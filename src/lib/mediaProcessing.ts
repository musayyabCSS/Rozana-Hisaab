import type { Category, NewTransaction, Transaction } from '@/types';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/categories';
import { getLocalDateKey } from '@/lib/format';
import { AiRequestError, parseReceiptImage, parseVoice, transcribeAudioWithWhisper } from '@/lib/ai';
import type { AiErrorKind } from '@/lib/aiClient';
import { normalizeConsumerNumber, normalizeIntervalMonths } from '@/lib/billConnections';

export interface MediaReviewDraft {
  id: string;
  type: 'voice' | 'receipt';
  blob: Blob;
  transaction: Transaction;
}

export class MediaProcessingError extends Error {
  constructor(
    message: string,
    readonly manualPrefill: Partial<NewTransaction>,
    readonly kind?: AiErrorKind,
  ) {
    super(message);
    this.name = 'MediaProcessingError';
  }
}

function aiErrorKind(error: unknown): AiErrorKind | undefined {
  return error instanceof AiRequestError ? error.kind : undefined;
}

function createTransactionId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Use the WebView-compatible fallback.
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function makeTransaction(type: MediaReviewDraft['type'], draft: NewTransaction): Transaction {
  const now = new Date();
  return {
    id: createTransactionId(),
    type: draft.type,
    amount: draft.amount,
    category: draft.category,
    title: draft.title,
    payment_method: draft.payment_method ?? null,
    provider: draft.provider ?? null,
    due_date: draft.due_date ?? null,
    units_consumed: draft.units_consumed ?? null,
    source: draft.source ?? (type === 'voice' ? 'voice' : 'scan'),
    transaction_date: draft.transaction_date ?? getLocalDateKey(now),
    created_at: now.toISOString(),
    ...(draft.has_receipt !== undefined ? { has_receipt: draft.has_receipt } : {}),
    ...(draft.is_paid !== undefined ? { is_paid: draft.is_paid } : {}),
    ...(draft.consumer_number ? { consumer_number: draft.consumer_number } : {}),
    ...(draft.issue_date ? { issue_date: draft.issue_date } : {}),
    is_synced: false,
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the captured receipt image.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Could not encode the captured receipt image.'));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}

export async function processVoiceBlob(blob: Blob): Promise<Transaction> {
  let transcript: string;
  try {
    transcript = await transcribeAudioWithWhisper(blob);
  } catch (error) {
    throw new MediaProcessingError(
      error instanceof Error ? error.message : 'Could not transcribe the voice note.',
      {
        type: 'expense',
        amount: 0,
        category: 'misc_expense',
        title: 'Voice transaction',
        source: 'voice',
      },
      aiErrorKind(error),
    );
  }
  if (!transcript.trim()) {
    throw new MediaProcessingError('No speech was detected in this recording.', {
      title: '',
      source: 'voice',
    });
  }
  try {
    const parsed = await parseVoice(transcript);
    return makeTransaction('voice', {
      type: parsed.type,
      amount: parsed.amount,
      category: parsed.category,
      title: parsed.title,
      payment_method: parsed.paymentMethod,
      transaction_date: parsed.date,
      source: 'voice',
    });
  } catch (error) {
    if (error instanceof MediaProcessingError) throw error;
    throw new MediaProcessingError(
      error instanceof Error ? error.message : 'Could not understand the voice note.',
      { title: transcript.trim().slice(0, 120), source: 'voice' },
      aiErrorKind(error),
    );
  }
}

export async function processReceiptBlob(blob: Blob): Promise<Transaction> {
  let parsed;
  try {
    parsed = await parseReceiptImage(await blobToDataUrl(blob));
  } catch (error) {
    throw new MediaProcessingError(
      error instanceof Error ? error.message : 'Could not analyze the receipt.',
      { title: 'Scanned Receipt', source: 'scan', has_receipt: true },
      aiErrorKind(error),
    );
  }

  const type = parsed.type === 'income' ? 'income' : 'expense';
  const category: Category = type === 'income'
    ? INCOME_CATEGORIES.find((candidate) => candidate === parsed.category) ?? 'freelance'
    : EXPENSE_CATEGORIES.find((candidate) => candidate === parsed.category) ?? 'bills';
  const dueDate =
    typeof parsed.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.due_date)
      ? parsed.due_date
      : null;
  // Bills and statements are dated by when they are due, not when they were
  // issued; other receipts keep their printed date.
  const transactionDate =
    [dueDate, parsed.transaction_date, parsed.date].find(
      (date): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date),
    ) ?? getLocalDateKey();
  // A bill or statement that is still due is saved as unpaid, so it triggers a
  // due-date reminder and stays out of expense totals until marked paid.
  const isUnpaidBill =
    type === 'expense' && dueDate !== null && dueDate >= getLocalDateKey() && parsed.is_paid !== true;
  const amount = typeof parsed.amount === 'number'
    ? parsed.amount
    : typeof parsed.amount === 'string'
      ? Number(parsed.amount.replace(/,/g, ''))
      : 0;
  const issueDate =
    typeof parsed.issue_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.issue_date)
      ? parsed.issue_date
      : null;
  const consumerNumber = normalizeConsumerNumber(parsed.consumer_number);

  const transaction = makeTransaction('receipt', {
    type,
    amount: Number.isFinite(amount) ? amount : 0,
    category,
    title: parsed.title || parsed.merchant || parsed.provider || parsed.vendor || 'Scanned Receipt',
    provider: parsed.provider || null,
    due_date: dueDate,
    units_consumed: parsed.units_consumed || null,
    transaction_date: transactionDate,
    source: 'scan',
    has_receipt: true,
    is_paid: !isUnpaidBill,
    consumer_number: consumerNumber,
    issue_date: issueDate,
  });
  return consumerNumber
    ? { ...transaction, billing_cycle_months: normalizeIntervalMonths(parsed.billing_cycle_months) }
    : transaction;
}
