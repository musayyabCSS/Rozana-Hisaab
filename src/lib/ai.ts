import type { Category, PaymentMethod } from '@/types';

const API_KEY = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
const ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses';
const WHISPER_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const MODEL = 'gpt-4o-mini';

interface OpenAIResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  output_text?: string;
  output?: Array<{
    content?: Array<{ text?: string }>;
  }>;
  error?: { message?: string; type?: string; code?: string };
}

function getHeaders(): HeadersInit {
  if (!API_KEY) throw new Error('Missing OpenAI API key');
  return { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
}

function parseJSON(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

async function requestOpenAI(body: Record<string, unknown>, context: string): Promise<Record<string, unknown>> {
  const response = await fetch(ENDPOINT, { method: 'POST', headers: getHeaders(), body: JSON.stringify(body) });
  const data = await response.json() as OpenAIResponse;
  if (!response.ok) throw new Error(data.error?.message || `OpenAI ${context} error: ${response.status}`);
  const content = data.choices?.[0]?.message?.content ?? '';
  const json = parseJSON(content);
  if (!json) throw new Error(`OpenAI ${context} returned invalid JSON.`);
  return json;
}

function mapCategory(raw: string | undefined): Category {
  if (!raw) return 'bills';
  const lower = raw.toLowerCase().trim();
  const map: Record<string, Category> = {
    salary: 'salary', business: 'business', freelance: 'freelance', 'rental income': 'rental_income', rental: 'rental_income',
    commission: 'commission', 'loan repayment': 'udhaar', rent: 'rent',
    'school fee': 'school_fee', school: 'school_fee', mechanic: 'mechanic', 'misc. expense': 'misc_expense',
    'misc expense': 'misc_expense', loan: 'loan', scholarship: 'scholarship', fuel: 'fuel', petrol: 'fuel',
    groceries: 'groceries', grocery: 'groceries', bills: 'bills', utilities: 'bills', 'bills & utilities': 'bills',
    shopping: 'misc_expense', medical: 'medical', health: 'medical',
    other: 'misc_expense', udhaar: 'udhaar', qarz: 'loan',
  };
  for (const [key, value] of Object.entries(map)) if (lower.includes(key)) return value;
  return 'bills';
}

export interface ScanResult {
  provider: string;
  amount: number;
  dueDate: string;
  units: string;
  category: Category;
  type: 'income' | 'expense';
}

export async function scanBill(base64Image: string): Promise<ScanResult> {
  const pureBase64 = base64Image.replace(/^data:[^;]+;base64,/, '');
  const json = await requestOpenAI({
    model: MODEL,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: [
      { type: 'text', text: "Analyze this Pakistani bill or receipt image. Extract details and return ONLY a JSON object with exact keys:\n- provider (string): company or vendor name\n- amount (number in PKR)\n- dueDate (YYYY-MM-DD or empty string). Parse handwritten dates like '03-OCT-2026' into ISO format '2026-10-03'. Preserve the exact year shown (2026, not 2016 or 2020).\n- units (string or empty)\n- category: match strictly to allowed lists:\n  * Income: ['Salary', 'Business', 'Freelance', 'Rental Income', 'Commission', 'Loan', 'Scholarship']\n  * Expense: ['Fuel / Petrol', 'Bills / Utilities', 'Grocery', 'Medical', 'Loan Repayment', 'Rent', 'School Fee', 'Mechanic', 'Misc. Expense']\n- type: 'income' if text contains 'Payment Received', 'Received From', 'Deposit Voucher', 'Credit Slip', 'Cash In', or 'Received PKR'. Otherwise 'expense' if text contains 'Bill', 'Invoice', 'Paid', 'Receipt', 'POS', or 'Tax Invoice'. Default to 'expense' if unclear." },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${pureBase64}` } },
    ] }],
  }, 'bill OCR');
  return {
    provider: String(json.provider || ''), amount: Number(json.amount) || 0, dueDate: String(json.dueDate || ''),
    units: String(json.units || ''), category: mapCategory(String(json.category || '')),
    type: json.type === 'income' ? 'income' : 'expense',
  };
}

export interface VoiceResult {
  amount: number;
  category: Category;
  title: string;
  type: 'income' | 'expense';
  paymentMethod: PaymentMethod | null;
  date: string;
}

export async function transcribeAudioWithWhisper(audioBlob: Blob): Promise<string> {
  if (!API_KEY) throw new Error('Missing OpenAI API key');
  const formData = new FormData();
  const mimeMap: Record<string, string> = {
    'audio/webm': 'webm', 'audio/webm;codecs=opus': 'webm',
    'audio/mp4': 'mp4', 'audio/aac': 'aac', 'audio/wav': 'wav',
    'audio/ogg': 'ogg', 'audio/mpeg': 'mp3',
  };
  const ext = mimeMap[audioBlob.type] || 'webm';
  formData.append('file', audioBlob, `recording.${ext}`);
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'json');
  const response = await fetch(WHISPER_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: formData,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Whisper transcription error: ${response.status}`);
  }
  const data = await response.json() as { text?: string };
  return String(data.text || '').trim();
}

function mapPaymentMethod(raw: string | undefined): PaymentMethod | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  if (lower.includes('credit card') || lower === 'card') return 'card';
  if (lower.includes('cash')) return 'cash';
  if (lower.includes('easypaisa')) return 'easypaisa';
  if (lower.includes('jazzcash')) return 'jazzcash';
  if (lower.includes('bank')) return 'bank';
  return null;
}

export async function parseVoice(transcript: string): Promise<VoiceResult> {
  const today = new Date().toISOString().split('T')[0];
  const json = await requestOpenAI({
    model: MODEL, response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: "You are a Pakistani personal finance voice parser. Analyze the transcribed voice input in English, Roman Urdu, or Urdu script.\nExtract:\n- title: exact transaction title or person/vendor name (e.g. 'Zubair Bhai', 'Shell Petrol', 'School Fee')\n- amount: exact numeric value, parsing Urdu slang ('dhai hazaar' -> 2500, 'panch hazar' -> 5000, 'terah hazaar' -> 13000, 'lakh' -> 100000)\n- type: 'income' if text contains 'Payment Received', 'Received From', 'Deposit Voucher', 'Credit Slip', 'Cash In', or 'Received PKR'. Otherwise 'expense' if text contains 'Bill', 'Invoice', 'Paid', 'Receipt', 'POS', or 'Tax Invoice'. Default to 'expense' if unclear.\n- category: match strictly to allowed lists based on type:\n  * Income: ['Salary', 'Business', 'Freelance', 'Rental Income', 'Commission', 'Loan', 'Scholarship']\n  * Expense: ['Fuel / Petrol', 'Bills / Utilities', 'Grocery', 'Medical', 'Loan Repayment', 'Rent', 'School Fee', 'Mechanic', 'Misc. Expense']\n- paymentMethod: 'Cash' | 'Bank' | 'EasyPaisa' | 'JazzCash' | 'Card' | 'Credit Card'\nReturn ONLY valid JSON: { amount: number, category: string, title: string, type: 'expense' | 'income', paymentMethod: string }." },
      {
        role: 'system',
        content: `Today's date is ${today}. Extract the transaction date as YYYY-MM-DD. Resolve "yesterday" or Roman Urdu "kal" to one day before today when context describes a past transaction; resolve "day before yesterday" or Roman Urdu "parso" to two days before today in past context. Convert explicit dates to YYYY-MM-DD. If no date is stated, use today's date. The required JSON object must include all original fields plus "date": { amount: number, category: string, title: string, type: "expense" | "income", paymentMethod: string, date: "YYYY-MM-DD" }.`,
      },
      { role: 'user', content: transcript },
    ],
  }, 'voice parsing');
  return {
    amount: Number(json.amount) || 0, category: mapCategory(String(json.category || '')),
    title: String(json.title || transcript.slice(0, 60)), type: json.type === 'income' ? 'income' : 'expense',
    paymentMethod: mapPaymentMethod(String(json.paymentMethod || '')),
    date: normalizeVoiceDate(json.date, today),
  };
}

function normalizeVoiceDate(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return fallback;
  const date = new Date(`${normalized}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === normalized
    ? normalized
    : fallback;
}

export interface StatementTransaction { date: string; title: string; amount: number; type: 'income' | 'expense' }

export async function parseStatementDocument(dataUrl: string, mimeType: string): Promise<StatementTransaction[]> {
  const prompt = "Extract bank statement transactions from this image/PDF. Ignore summary rows, beginning balances, and daily ending balances. Return ONLY a JSON object with a 'transactions' array containing: { date: YYYY-MM-DD, title: string, amount: number (absolute value), type: 'income' | 'expense' }.";
  const body = mimeType === 'application/pdf'
    ? {
        model: MODEL,
        input: [{ role: 'user', content: [
          { type: 'input_text', text: prompt },
          { type: 'input_file', filename: 'bank-statement.pdf', file_data: dataUrl },
        ] }],
      }
    : {
        model: MODEL,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: dataUrl } },
        ] }],
      };

  const endpoint = mimeType === 'application/pdf' ? RESPONSES_ENDPOINT : ENDPOINT;
  const response = await fetch(endpoint, { method: 'POST', headers: getHeaders(), body: JSON.stringify(body) });
  const data = await response.json() as OpenAIResponse;
  if (!response.ok) throw new Error(data.error?.message || `OpenAI statement import error: ${response.status}`);
  const content = data.choices?.[0]?.message?.content ?? data.output_text ?? data.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? '').join('') ?? '';
  const json = parseJSON(content);
  if (!json || !Array.isArray(json.transactions)) throw new Error('OpenAI returned no statement transactions.');
  return json.transactions.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const amount = Math.abs(Number(row.amount));
    const type = row.type === 'income' ? 'income' : row.type === 'expense' ? 'expense' : null;
    if (!Number.isFinite(amount) || amount <= 0 || !type || !String(row.title || '').trim()) return [];
    return [{ date: String(row.date || ''), title: String(row.title), amount, type }];
  });
}
