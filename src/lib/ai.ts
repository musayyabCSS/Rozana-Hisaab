import { supabase } from './supabase';

export interface ScannedReceipt {
  merchant?: string;
  amount?: number;
  date?: string;
  category?: string;
  notes?: string;
}

export async function parseReceiptImage(base64Image: string): Promise<ScannedReceipt> {
  const { data, error } = await supabase.functions.invoke('ai-proxy', {
    body: { imageBase64: base64Image },
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