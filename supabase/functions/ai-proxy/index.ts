import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Upper bounds on request payloads. The client already compresses receipts
// below 7M base64 chars and caps voice notes at 60 seconds.
const MAX_IMAGE_BASE64_LENGTH = 7_500_000;
const MAX_AUDIO_BASE64_LENGTH = 8_000_000;
const MAX_TEXT_LENGTH = 2_000;
const MAX_PROMPT_LENGTH = 1_000;
const MAX_TODAY_LENGTH = 100;

// Per-user rate limits across all actions. A voice entry uses two calls
// (transcribe + parse-voice), a receipt scan uses one.
const MAX_CALLS_PER_HOUR = 60;
const MAX_CALLS_PER_DAY = 300;

function jsonResponse(body: unknown, status: number): Response {
  if (status >= 400) {
    console.warn("ai-proxy responded with an error", status, JSON.stringify(body).slice(0, 500));
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "X-Ai-Proxy": "1" },
  });
}

// The client reads `error.message` from failed responses (see src/lib/aiClient.ts).
function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: { message } }, status);
}

function isTooLong(value: unknown, max: number): boolean {
  return typeof value === "string" && value.length > max;
}

async function countCallsSince(
  admin: ReturnType<typeof createClient>,
  userId: string,
  since: Date,
): Promise<number> {
  const { count, error } = await admin
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since.toISOString());
  if (error) throw new Error(`Could not read AI usage: ${error.message}`);
  return count ?? 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!apiKey || !supabaseUrl || !anonKey || !serviceRoleKey) {
      return errorResponse("AI service is not configured on Supabase", 500);
    }

    // The platform JWT check accepts the public anon key, so require a real
    // signed-in user before spending OpenAI credits.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Sign in to use AI features", 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      console.warn("ai-proxy auth failed", userError?.status, userError?.message);
      return errorResponse("Sign in to use AI features", 401);
    }

    const body = await req.json();
    const action = body.action || (body.imageBase64 ? "receipt" : body.audioBase64 ? "transcribe" : "parse-voice");
    console.log("ai-proxy request", {
      action,
      user: user.id,
      audioLength: typeof body.audioBase64 === "string" ? body.audioBase64.length : null,
      imageLength: typeof body.imageBase64 === "string" ? body.imageBase64.length : null,
      textLength: typeof body.text === "string" ? body.text.length : null,
    });

    if (action !== "transcribe" && action !== "parse-voice" && action !== "receipt") {
      return errorResponse("Invalid action", 400);
    }
    if (action === "transcribe" && typeof body.audioBase64 !== "string") {
      return errorResponse("audioBase64 is required", 400);
    }
    if (action === "parse-voice" && typeof body.text !== "string") {
      return errorResponse("text is required", 400);
    }
    if (action === "receipt" && typeof body.imageBase64 !== "string") {
      return errorResponse("imageBase64 is required", 400);
    }
    if (
      isTooLong(body.audioBase64, MAX_AUDIO_BASE64_LENGTH) ||
      isTooLong(body.imageBase64, MAX_IMAGE_BASE64_LENGTH) ||
      isTooLong(body.text, MAX_TEXT_LENGTH) ||
      isTooLong(body.prompt, MAX_PROMPT_LENGTH) ||
      isTooLong(body.today, MAX_TODAY_LENGTH)
    ) {
      return errorResponse("Request is too large", 413);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const now = Date.now();
    const [hourlyCalls, dailyCalls] = await Promise.all([
      countCallsSince(admin, user.id, new Date(now - 60 * 60 * 1000)),
      countCallsSince(admin, user.id, new Date(now - 24 * 60 * 60 * 1000)),
    ]);
    if (hourlyCalls >= MAX_CALLS_PER_HOUR || dailyCalls >= MAX_CALLS_PER_DAY) {
      return errorResponse("AI usage limit reached. Please try again later.", 429);
    }
    const { error: usageError } = await admin
      .from("ai_usage")
      .insert({ user_id: user.id, action });
    if (usageError) throw new Error(`Could not record AI usage: ${usageError.message}`);

    // 1. AUDIO TRANSCRIPTION (Whisper)
    if (action === "transcribe") {
      const binaryString = atob(body.audioBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const audioBlob = new Blob([bytes], { type: body.mimeType || "audio/webm" });
      const formData = new FormData();
      formData.append("file", audioBlob, "audio.webm");
      formData.append("model", "whisper-1");
      const whisperPrompt = typeof body.prompt === "string" && body.prompt.trim()
        ? body.prompt
        : "Rozana Hisaab personal finance ledger: LESCO electricity bill paid do din pehly 20000, parcel ki payment received Adil 5000, Shell se 5000 ka fuel lia, 1200 ki sabzi li, salary received, dukaan ka kharcha, paid, received.";
      formData.append("prompt", whisperPrompt);
      formData.append("temperature", "0");

      const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
        },
        body: formData,
      });

      const whisperData = await whisperRes.json();
      return jsonResponse(whisperData, whisperRes.status);
    }

    // 2. VOICE TEXT PARSING
    if (action === "parse-voice") {
      const localDateKey = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };
      const nowDate = new Date(now);
      const today = typeof body.today === "string"
        ? body.today
        : `Today's Date: ${localDateKey(nowDate)} (${nowDate.toLocaleDateString("en-US", { weekday: "long" })})`;
      const chatRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are an expense parser for a Pakistani ledger app named Rozana Hisaab.
Understand English, Urdu script, Roman Urdu, and code-switched speech. Do not mistake Roman Urdu for English or require the transcript to use one language consistently.
Extract the exact numeric transaction amount from spoken numbers and numerals, including common Urdu/Roman Urdu number phrases (for example "pachaas hazar" = 50000) and English number phrases.
${today}
Calculate relative dates based on Today's Date:
- "do din pehly" / "2 days ago" -> subtract 2 days.
- "kal" / "yesterday" -> subtract 1 day.
- "pandra din baad" / "after 15 days" -> add 15 days.
- "agle hafte" / "next week" -> add 7 days.
- If no relative time is mentioned, use Today's Date.
- Always output date as YYYY-MM-DD.
Understand Pakistani vernacular and mixed terminology:
- LESCO/K-Electric/SNGPL indicate utility bills; use category "bills" (the app's Utilities-equivalent category).
- Careem/Bykea, taxi, bus, or train fares indicate category "transport". Fuel/Petrol/Shell indicate category "fuel".
- Dukaan/Sauda/Sabzi/Kirana indicate groceries; use category "groceries".
- Prepared meals and eating out (khana, lunch, dinner, nashta, chai, restaurant, dhaba, hotel, takeaway, Foodpanda, KFC, pizza, burger, biryani) indicate category "food". Raw ingredients and household supplies stay "groceries".
- Money received from an employer or office to spend on office needs (office ne paise diye, petty cash, imprest, funds for stationery/equipment/supplies, office kharcha advance) is income with category "office_funds", not "salary".
- Preserve person/merchant names such as Adil/Kashif/Ali/Ahmed in the transaction title.
Correctly interpret phonetically written English words in Urdu script (e.g., "ڈالری" or "سیلری" means Salary, "ریسیود" means Received, "بل" means Bill).
For example, classify "Electricity bill 25000" as category "bills", title "Electricity Bill", amount 25000, type "expense". Classify "parcel ki payment received Adil 5000" as income and include Adil in the title.
Return strictly valid JSON with this exact schema:
{
  "amount": number,
  "category": "salary" | "business" | "freelance" | "rental_income" | "commission" | "loan" | "scholarship" | "office_funds" | "transport" | "fuel" | "bills" | "groceries" | "food" | "medical" | "udhaar" | "rent" | "school_fee" | "mechanic" | "misc_expense",
  "title": string,
  "type": "income" | "expense",
  "paymentMethod": "cash" | "bank_transfer" | "easypaisa" | "jazzcash" | "card" | null,
  "date": "YYYY-MM-DD"
}`
            },
            {
              role: "user",
              content: body.text
            }
          ],
          response_format: { type: "json_object" },
          max_tokens: 300,
        }),
      });

      const chatData = await chatRes.json();
      const content = chatData?.choices?.[0]?.message?.content;
      if (!chatRes.ok) console.warn("ai-proxy OpenAI parse-voice failed", chatRes.status, JSON.stringify(chatData).slice(0, 500));
      return new Response(content || JSON.stringify({ error: { message: "Failed to parse text" } }), {
        status: chatRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Ai-Proxy": "1" },
      });
    }

    // 3. RECEIPT & BILL OCR SCANNING
    const chatRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this receipt or bill image. Return a JSON object with these exact keys:
- title: for an incoming payment from an individual/client, use the person's/client's name (not generic text such as "Payment Received"). For a utility bill, use the provider's common short name (such as LESCO, SNGPL, PTCL, WASA, K-Electric, StormFiber), not the full legal name. For a bank, credit card, or loan statement, use the bank and product name (such as "HBL ReadyCash" or "Meezan Credit Card"). Never use the name of the customer or account holder the document is addressed to. Otherwise use a concise transaction title.
- amount: numeric amount in PKR, or 0 if not found. For bills, use the amount payable within the due date (the lower amount), never the amount payable after the due date
- type: use "income" when money is received, deposited, or paid to a person/client; otherwise "expense"
- category: for vehicle maintenance, car repair, parts, labour, periodic maintenance, workshop, or mechanic invoices, strictly use "mechanic". For credit card, running finance (such as ReadyCash), personal loan, or installment statements, use type "expense" and category "udhaar" (loan repayment), with amount set to the minimum amount due if shown, otherwise the total amount due. For taxi, bus, or train fares, use "transport". For restaurant, cafe, takeaway, or food delivery receipts (prepared meals), use "food"; supermarket and kirana receipts stay "groceries". For incoming client payments use "freelance". For petty cash vouchers or funds issued by an office/employer for office supplies or equipment, use type "income" and category "office_funds". For other transactions, choose exactly one of "salary", "business", "rental_income", "commission", "loan", "scholarship", "office_funds", "transport", "fuel", "bills", "groceries", "food", "medical", "udhaar", "rent", "school_fee", or "misc_expense".
- vendor: for incoming payments, extract the client's/person's name (not generic labels); for expenses, extract the merchant name; or empty string if not visible
- provider: service/provider name, or empty string
- transaction_date: the printed or stamped invoice/receipt date in YYYY-MM-DD format (for example, "2026-08-09"). Never omit this if a date appears on the paper. Convert dates such as "09-AUG-2026" to "2026-08-09".
- due_date: only for utility bills, credit card/loan statements, or other scheduled bills with an explicit due date (such as "Due Date: 20th May 2026"), in YYYY-MM-DD format; otherwise use an empty string
- issue_date: only for utility bills and statements, the printed issue/bill date (such as "ISSUE DATE 02 OCT 26") in YYYY-MM-DD format; otherwise an empty string
- is_paid: true if the document shows the payment is already completed (a shop/sale receipt, cash memo, payment confirmation, transfer receipt, or a PAID stamp); false if it is a bill, invoice, or statement still awaiting payment
- units_consumed: quantity/units shown, or empty string
- consumer_number: for utility bills and statements, the account's permanent identifier exactly as printed. Always pick the same field for a given provider so monthly bills match: electricity companies (LESCO, K-Electric, IESCO, FESCO, GEPCO, MEPCO, PESCO and other DISCOs): the "REFERENCE NO", usually 14 digits printed in groups and often ending in a letter such as U or R, e.g. "44 11564 8318413U" (not the Consumer ID, and never the METER NO or bill number); SNGPL/SSGC gas: the "Consumer No"; WASA and other water/sewerage bills: the account number labelled "Account#", "Account No", or "A/C No." (for WASA Lahore usually 8 digits, e.g. "08453127"), not the property, NCR, ward, or bill-area number; PTCL: the "Account ID" or "Account ID/ESN" (not the phone number, invoice number, or Customer ID); fiber/internet providers (StormFiber, Nayatel, Transworld and others): the customer or account ID; housing societies and cantonment boards: the property, plot, or consumer number used for billing; bank statements: the repayment/loan account number (never a full card number; keep any masking as printed). Never a meter number, bill number, invoice number, transaction ID, a tax/registration number (STN, NTN, GST, CNIC), or a payment code (1Link/1Bill prefix or reference code, PSID, Kuickpay or barcode number), even if it is printed large, highlighted, or near the provider's name. Copy the digits exactly; if you cannot read the labelled field clearly, return an empty string rather than guessing
- billing_cycle_months: how many months one bill covers, if the bill states it (count the months in the billing month/period: 2 for a bi-monthly bill or "Jan-Feb", 3 for a quarterly bill or "July, August, September"); otherwise 1
- description: brief summary of the receipt`
              },
              {
                type: "image_url",
                image_url: {
                  url: body.imageBase64.startsWith("data:")
                    ? body.imageBase64
                    : `data:image/jpeg;base64,${body.imageBase64}`,
                  // Bills have small printed reference numbers; read them at full resolution.
                  detail: "high",
                }
              }
            ]
          }
        ],
        max_tokens: 600,
      }),
    });

    const chatData = await chatRes.json();
    return jsonResponse(chatData, chatRes.status);
  } catch (error) {
    console.error("ai-proxy unexpected error", error);
    return errorResponse((error as Error).message, 500);
  }
});
