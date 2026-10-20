import type { Category, TransactionType, PaymentMethod } from '@/types';
import { invokeAiProxy, type AiErrorKind } from '@/lib/aiClient';

const WHISPER_CONTEXT_PROMPT =
  'Rozana Hisaab personal finance ledger: LESCO electricity bill paid do din pehly 20000, parcel ki payment received Adil 5000, Shell se 5000 ka fuel lia, 1200 ki sabzi li, salary received, dukaan ka kharcha, paid, received.';

export interface ScannedReceipt {
  merchant?: string;
  vendor?: string;
  provider?: string;
  title?: string;
  type?: TransactionType;
  amount?: number | string;
  date?: string;
  transaction_date?: string;
  due_date?: string;
  units_consumed?: string;
  category?: string;
  notes?: string;
}

export interface ParsedVoiceResult {
  amount: number;
  category: Category;
  title: string;
  type: TransactionType;
  paymentMethod: PaymentMethod | null;
  date: string;
}

export class AiRequestError extends Error {
  constructor(
    message: string,
    readonly kind: AiErrorKind,
  ) {
    super(message);
    this.name = 'AiRequestError';
  }
}

function requireAiData<T>(
  result: Awaited<ReturnType<typeof invokeAiProxy<T>>>,
): T {
  if (!result.ok) throw new AiRequestError(result.message, result.kind);
  return result.data;
}

// 1. Audio Transcription using Whisper via Supabase Edge Function
export async function transcribeAudioWithWhisper(
  audioBlob: Blob,
): Promise<string> {
  const buffer = await audioBlob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const audioBase64 = btoa(binary);

  const data = requireAiData(await invokeAiProxy<{ text: string }>({
    action: 'transcribe',
    audioBase64,
    mimeType: audioBlob.type || 'audio/webm',
    prompt: WHISPER_CONTEXT_PROMPT,
  }));

  return data.text || '';
}

// 2. Parse Voice Transcription Text into Transaction Fields
export async function parseVoice(text: string): Promise<ParsedVoiceResult> {
  const now = new Date();
  const today = `Today's Date: ${now.toISOString().split('T')[0]} (${now.toLocaleDateString('en-US', { weekday: 'long' })})`;
  const data = requireAiData(await invokeAiProxy<ParsedVoiceResult>({
    action: 'parse-voice',
    text,
    today,
  }));

  return data;
}

// 3. Receipt Image Scanner
export async function parseReceiptImage(base64Image: string): Promise<ScannedReceipt> {
  const data = requireAiData(await invokeAiProxy<{
    choices?: Array<{ message?: { content?: string } }>;
  }>({
    action: 'receipt',
    imageBase64: base64Image,
  }));

  const rawContent = data.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error('No receipt data returned by the AI service');
  }

  return JSON.parse(rawContent) as ScannedReceipt;
}