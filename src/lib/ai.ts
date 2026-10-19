import { supabase } from './supabase';
import type { Category, TransactionType, PaymentMethod } from '@/types';

const WHISPER_CONTEXT_PROMPT =
  'Rozana Hisaab expense tracker: Shell se 5000 ka fuel lia, LESCO electricity bill 25000 pay kia, 1200 ki sabzi li, grocery store, lunch with friends, Careem ride 850, paid, received.';

export interface ScannedReceipt {
  merchant?: string;
  amount?: number;
  date?: string;
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

// 1. Audio Transcription using Whisper via Supabase Edge Function
export async function transcribeAudioWithWhisper(
  audioBlob: Blob,
  language?: 'en' | 'ur',
): Promise<string> {
  const buffer = await audioBlob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const audioBase64 = btoa(binary);

  const { data, error } = await supabase.functions.invoke('ai-proxy', {
    body: {
      action: 'transcribe',
      audioBase64,
      mimeType: audioBlob.type || 'audio/webm',
      language,
      prompt: WHISPER_CONTEXT_PROMPT,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data?.error) {
    throw new Error(data.error.message || data.error);
  }

  return data?.text || '';
}

// 2. Parse Voice Transcription Text into Transaction Fields
export async function parseVoice(
  text: string,
  inputLanguage?: 'en' | 'ur',
): Promise<ParsedVoiceResult> {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase.functions.invoke('ai-proxy', {
    body: {
      action: 'parse-voice',
      text,
      inputLanguage,
      today,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data?.error) {
    throw new Error(data.error.message || data.error);
  }

  return data as ParsedVoiceResult;
}

// 3. Receipt Image Scanner
export async function parseReceiptImage(base64Image: string): Promise<ScannedReceipt> {
  const { data, error } = await supabase.functions.invoke('ai-proxy', {
    body: {
      action: 'receipt',
      imageBase64: base64Image,
    },
  });

  if (error) {
    throw new Error(`Receipt scan failed: ${error.message}`);
  }

  const rawContent = data?.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error('No receipt data returned by the AI service');
  }

  return JSON.parse(rawContent) as ScannedReceipt;
}