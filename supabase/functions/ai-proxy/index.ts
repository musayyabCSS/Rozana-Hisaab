import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured on Supabase" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const action = body.action || (body.imageBase64 ? "receipt" : body.audioBase64 ? "transcribe" : "parse-voice");

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
      return new Response(JSON.stringify(whisperData), {
        status: whisperRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. VOICE TEXT PARSING
    if (action === "parse-voice") {
      const now = new Date();
      const today = typeof body.today === "string"
        ? body.today
        : `Today's Date: ${now.toISOString().split("T")[0]} (${now.toLocaleDateString("en-US", { weekday: "long" })})`;
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
- Careem/Bykea/Fuel/Petrol/Shell indicate transport or fuel; use the closest supported category "fuel".
- Dukaan/Sauda/Sabzi/Kirana indicate groceries; use category "groceries".
- Preserve person/merchant names such as Adil/Kashif/Ali/Ahmed in the transaction title.
Correctly interpret phonetically written English words in Urdu script (e.g., "ڈالری" or "سیلری" means Salary, "ریسیود" means Received, "بل" means Bill).
For example, classify "Electricity bill 25000" as category "bills", title "Electricity Bill", amount 25000, type "expense". Classify "parcel ki payment received Adil 5000" as income and include Adil in the title.
Return strictly valid JSON with this exact schema:
{
  "amount": number,
  "category": "salary" | "business" | "freelance" | "rental_income" | "commission" | "loan" | "scholarship" | "fuel" | "bills" | "groceries" | "medical" | "udhaar" | "rent" | "school_fee" | "mechanic" | "misc_expense",
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
      return new Response(content || JSON.stringify({ error: "Failed to parse text" }), {
        status: chatRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. RECEIPT & BILL OCR SCANNING
    if (action === "receipt") {
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
- title: for an incoming payment from an individual/client, use the person's/client's name (not generic text such as "Payment Received"). For a utility bill, use the provider name (such as LESCO or PTCL). Otherwise use a concise transaction title.
- amount: numeric amount in PKR, or 0 if not found
- type: use "income" when money is received, deposited, or paid to a person/client; otherwise "expense"
- category: for vehicle maintenance, car repair, parts, labour, periodic maintenance, workshop, or mechanic invoices, strictly use "mechanic". For incoming client payments use "freelance". For other transactions, choose exactly one of "salary", "business", "rental_income", "commission", "loan", "scholarship", "fuel", "bills", "groceries", "medical", "udhaar", "rent", "school_fee", or "misc_expense".
- vendor: for incoming payments, extract the client's/person's name (not generic labels); for expenses, extract the merchant name; or empty string if not visible
- provider: service/provider name, or empty string
- transaction_date: the printed or stamped invoice/receipt date in YYYY-MM-DD format (for example, "2026-08-09"). Never omit this if a date appears on the paper. Convert dates such as "09-AUG-2026" to "2026-08-09".
- due_date: only for utility bills or scheduled bills with an explicit due date, in YYYY-MM-DD format; otherwise use an empty string
- units_consumed: quantity/units shown, or empty string
- consumer_number: account/consumer reference if shown, or empty string
- description: brief summary of the receipt`
                },
                {
                  type: "image_url",
                  image_url: {
                    url: body.imageBase64.startsWith("data:")
                      ? body.imageBase64
                      : `data:image/jpeg;base64,${body.imageBase64}`
                  }
                }
              ]
            }
          ],
          max_tokens: 600,
        }),
      });

      const chatData = await chatRes.json();
      return new Response(JSON.stringify(chatData), {
        status: chatRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});