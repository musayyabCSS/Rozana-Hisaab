import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import type { Category, NewTransaction, Transaction, TransactionType } from '@/types';
import { CATEGORIES, EXPENSE_CATEGORIES, getCategoryLabel, INCOME_CATEGORIES } from '@/lib/categories';
import { tr } from '@/lib/i18n';
import { saveReceiptImage } from '@/lib/receiptStorage';
import { isFutureDate } from '@/lib/format';

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
const OPENAI_VISION_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

interface ScanModalProps {
  open: boolean;
  onClose: () => void;
  language: string;
  dir: string;
  onSave: (txn: NewTransaction) => Promise<Transaction | null>;
}

interface ExtractedBillData {
  title: string;
  amount: number;
  type: 'expense' | 'income';
  category: Category;
  vendor: string;
  provider: string;
  due_date: string;
  transaction_date: string;
  units_consumed: string;
  consumer_number: string;
  description: string;
}

function mapCategory(value: unknown): Category {
  if (typeof value !== 'string') return 'misc_expense';
  const normalized = value.toLowerCase().trim().replace(/[_-]/g, ' ');
  const categories: Record<string, Category> = {
    salary: 'salary',
    business: 'business',
    freelance: 'freelance',
    'rental income': 'rental_income',
    commission: 'commission',
    loan: 'loan',
    scholarship: 'scholarship',
    fuel: 'fuel',
    petrol: 'fuel',
    bills: 'bills',
    utilities: 'bills',
    'bills & utilities': 'bills',
    groceries: 'groceries',
    grocery: 'groceries',
    medical: 'medical',
    udhaar: 'udhaar',
    rent: 'rent',
    'school fee': 'school_fee',
    mechanic: 'mechanic',
    'misc expense': 'misc_expense',
    'misc. expense': 'misc_expense',
  };
  return categories[normalized] ?? 'misc_expense';
}

function normalizeReceiptDate(value: unknown): string {
  if (typeof value !== 'string') return '';
  const input = value.trim();
  const isoMatch = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dayFirstMatch = input.match(
    /^(\d{1,2})[-/ ]([A-Za-z]{3,}|0?\d{1,2})[-/ ,]+(\d{2,4})$/,
  );

  let year: number;
  let month: number;
  let day: number;
  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else if (dayFirstMatch) {
    day = Number(dayFirstMatch[1]);
    const monthText = dayFirstMatch[2];
    if (/^\d+$/.test(monthText)) {
      month = Number(monthText);
    } else {
      const monthIndex = [
        'jan', 'feb', 'mar', 'apr', 'may', 'jun',
        'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
      ].indexOf(monthText.slice(0, 3).toLowerCase());
      month = monthIndex + 1;
    }
    year = Number(dayFirstMatch[3]);
    if (year < 100) year += 2000;
  } else {
    return '';
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return '';
  }

  return `${year.toString().padStart(4, '0')}-${month
    .toString()
    .padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

export function ScanModal({ open, onClose, language, dir, onSave }: ScanModalProps) {
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [transactionDateCustomized, setTransactionDateCustomized] = useState(false);
  const [step, setStep] = useState<'capture' | 'review'>('capture');

  // Form state for review step
  const [extractedData, setExtractedData] = useState<ExtractedBillData>({
    title: '',
    amount: 0,
    type: 'expense',
    category: 'bills',
    vendor: '',
    provider: '',
    due_date: new Date().toISOString().split('T')[0],
    transaction_date: new Date().toISOString().split('T')[0],
    units_consumed: '',
    consumer_number: '',
    description: '',
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const categories =
    extractedData.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const handleTypeChange = (type: TransactionType) => {
    setExtractedData({
      ...extractedData,
      type,
      category: type === 'income' ? 'freelance' : 'bills',
    });
  };

  // Stop camera tracks cleanly
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }
  }, []);

  // Start camera hardware
  const startCamera = useCallback(async () => {
    stopCamera(); // Ensure previous streams are released
    setCameraError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera access is not supported on this browser or device.');
      return;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = mediaStream;

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play().catch(() => {
          // Video auto-play handled gracefully
        });
      }
    } catch (err: unknown) {
      console.error(
        'Camera access error:',
        err instanceof Error ? err.message : String(err),
      );
      setCameraError('Could not start camera. Upload a file or photo instead.');
    }
  }, [stopCamera]);

  // Handle modal visibility and camera lifecycle
  useEffect(() => {
    if (open && step === 'capture' && !capturedImage) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [open, step, capturedImage, startCamera, stopCamera]);

  // Capture photo frame from stream
  const handleCapturePhoto = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      stopCamera();
      setCapturedImage(dataUrl);
      processOCR(dataUrl);
    }
  };

  // Handle gallery file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        stopCamera();
        setCapturedImage(dataUrl);
        processOCR(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  // Retake photo logic
  const handleRetake = async () => {
    stopCamera();
    setCapturedImage(null);
    setCameraError(null);
    setTransactionDateCustomized(false);
    setStep('capture');
    await startCamera();
  };

  const processOCR = async (imageData: string) => {
    setIsProcessing(true);
    setOcrError(null);
    setTransactionDateCustomized(false);
    try {
      if (!OPENAI_API_KEY) {
        throw new Error('Missing VITE_OPENAI_API_KEY.');
      }

      const response = await fetch(OPENAI_VISION_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Analyze this receipt or bill image. Return a JSON object with these exact keys:
- title: for an incoming payment from an individual/client, use the person's/client's name (not generic text such as "Payment Received"). For a utility bill, use the provider name (such as LESCO or PTCL). Otherwise use a concise transaction title.
- amount: numeric amount in PKR, or 0 if not found
- type: use "income" when money is received, deposited, or paid to a person/client; otherwise "expense"
- category: for incoming client/individual payments always use "freelance". For other income choose salary, business, freelance, rental_income, commission, loan, or scholarship. For expenses choose fuel, bills, groceries, medical, udhaar, rent, school_fee, mechanic, or misc_expense.
- vendor: for incoming payments, extract the client's/person's name (not generic labels); for expenses, extract the merchant name; or empty string if not visible
- provider: service/provider name, or empty string
- due_date: date in YYYY-MM-DD format; convert dates such as "03-OCT-2026" to "2026-10-03", or use empty string if no date is visible
- units_consumed: quantity/units shown, or empty string
- consumer_number: account/consumer reference if shown, or empty string
- description: brief summary of the receipt`,
                },
                {
                  type: 'image_url',
                  image_url: { url: imageData },
                },
              ],
            },
          ],
        }),
      });

      const result = (await response.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(
          result.error?.message || `OpenAI Vision request failed (${response.status}).`,
        );
      }

      const content = result.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('OpenAI Vision returned an empty response.');
      }

      const parsed = JSON.parse(content) as Record<string, unknown>;
      const amount = Number(parsed.amount);
      const type = parsed.type === 'income' ? 'income' : 'expense';
      const recognizedCategory = mapCategory(parsed.category);
      const category: Category =
        type === 'income'
          ? 'freelance'
          : EXPENSE_CATEGORIES.includes(recognizedCategory)
            ? recognizedCategory
            : 'misc_expense';
      const modelTitle = typeof parsed.title === 'string' ? parsed.title.trim() : '';
      const provider =
        typeof parsed.provider === 'string' ? parsed.provider.trim() : '';
      const utilityBill =
        type === 'expense' &&
        (category === 'bills' ||
          /electric|gas|water|internet|utility|lesco|ptcl|sngpl|mepco|k-electric/i.test(
            `${provider} ${modelTitle}`,
          ));
      const parsedVendor =
        typeof parsed.vendor === 'string' ? parsed.vendor.trim() : '';
      const genericIncomeTitle =
        /^(payment received|received payment|income|payment|cash received)$/i;
      const vendor =
        parsedVendor ||
        (type === 'income' && !genericIncomeTitle.test(modelTitle) ? modelTitle : '');
      const title = utilityBill
        ? provider || vendor || modelTitle || 'Utility Bill'
        : type === 'income'
          ? vendor || (genericIncomeTitle.test(modelTitle) ? 'Freelance Income' : modelTitle)
          : modelTitle || 'Scanned Receipt';

      const dueDate = normalizeReceiptDate(parsed.due_date);
      const today = new Date().toISOString().split('T')[0];
      const transactionDate = dueDate && isFutureDate(dueDate) ? dueDate : today;

      setExtractedData({
        title,
        amount: Number.isFinite(amount) ? amount : 0,
        type,
        category,
        vendor,
        provider: provider || (utilityBill ? vendor : ''),
        due_date: dueDate,
        transaction_date: transactionDate,
        units_consumed:
          typeof parsed.units_consumed === 'string' ? parsed.units_consumed : '',
        consumer_number:
          typeof parsed.consumer_number === 'string' ? parsed.consumer_number : '',
        description:
          typeof parsed.description === 'string' ? parsed.description : '',
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error during receipt analysis.';
      console.error('OpenAI Vision error:', message);
      setOcrError(message);
    } finally {
      setIsProcessing(false);
      setStep('review');
    }
  };

  // Save transaction to Supabase
  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    setIsSaving(true);
    try {
      const newTxn: NewTransaction = {
        title: extractedData.title || 'Scanned Receipt',
        amount: Number(extractedData.amount) || 0,
        type: extractedData.type,
        category: mapCategory(extractedData.category),
        transaction_date: extractedData.transaction_date,
        provider: extractedData.provider,
        due_date: extractedData.due_date,
        units_consumed: extractedData.units_consumed,
        source: 'scan',
        is_paid: !isFutureDate(extractedData.transaction_date),
        ...(capturedImage ? { has_receipt: true } : {}),
      };

      const savedTxn = await onSave(newTxn);
      if (!savedTxn) {
        setOcrError('The transaction could not be saved. Please try again.');
        return;
      }
      if (capturedImage) {
        await saveReceiptImage(savedTxn.id, capturedImage);
      }
      handleClose();
    } catch (err) {
      console.error('Error saving scanned receipt:', err);
      setOcrError(
        err instanceof Error
          ? err.message
          : 'Could not save the transaction or its local receipt image.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    stopCamera();
    setCapturedImage(null);
    setCameraError(null);
    setOcrError(null);
    setTransactionDateCustomized(false);
    setTransactionDateCustomized(false);
    setStep('capture');
    setIsProcessing(false);
    setIsSaving(false);
    onClose();
  };

  if (!open) return null;

  const isUrdu = language === 'ur';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      dir={dir}
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl relative my-8">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-lg font-bold text-white">
              {isUrdu ? 'بل سکین اور OCR' : 'Bill Scan & OCR'}
            </h3>
            <p className="text-xs text-slate-400">
              {step === 'capture'
                ? isUrdu
                  ? 'رسید یا بل کی تصویر لیں'
                  : 'Capture or upload a receipt'
                : isUrdu
                ? 'نکالی گئی تفصیلات کی تصدیق کریں'
                : 'Review extracted details'}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white text-xl p-1 transition"
          >
            ✕
          </button>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* STEP 1: CAPTURE & CAMERA VIEW */}
        {step === 'capture' && (
          <div className="space-y-4">
            {cameraError && (
              <div className="p-3 text-xs bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl text-center">
                ⚠️ {cameraError}
              </div>
            )}

            <div className="relative rounded-xl overflow-hidden bg-slate-950 aspect-[3/4] flex items-center justify-center border border-slate-800 shadow-inner">
              {capturedImage ? (
                <img
                  src={capturedImage}
                  alt="Captured receipt"
                  className="w-full h-full object-cover"
                />
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              )}

              {isProcessing && (
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                  <div className="w-8 h-8 border-3 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs font-semibold text-emerald-400">
                    {isUrdu ? 'OCR پروسیسنگ جاری ہے...' : 'Extracting receipt data...'}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleCapturePhoto}
                disabled={isProcessing}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-sm font-bold rounded-xl transition shadow-lg shadow-emerald-500/20"
              >
                {isUrdu ? 'تصویر لیں' : 'Take Photo'}
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl transition border border-slate-700"
              >
                {isUrdu ? 'گیلری سے منتخب کریں' : '📁 Upload from Gallery'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: REVIEW & EDIT EXTRACTED DETAILS */}
        {step === 'review' && (
          <form onSubmit={handleSaveTransaction} className="space-y-3 text-xs">
            <div className="flex gap-1.5 bg-slate-950/60 rounded-2xl p-1.5">
              <button
                type="button"
                onClick={() => handleTypeChange('income')}
                aria-pressed={extractedData.type === 'income'}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                  extractedData.type === 'income'
                    ? 'bg-emerald-500/15 text-emerald-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <ArrowDownLeft size={16} />
                {tr('income', isUrdu ? 'ur' : 'en')}
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('expense')}
                aria-pressed={extractedData.type === 'expense'}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                  extractedData.type === 'expense'
                    ? 'bg-rose-500/15 text-rose-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <ArrowUpRight size={16} />
                {tr('expense', isUrdu ? 'ur' : 'en')}
              </button>
            </div>

            {ocrError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl">
                Receipt processing error: {ocrError}
              </div>
            )}
            {capturedImage && (
              <div className="relative h-28 rounded-xl overflow-hidden border border-slate-800">
                <img
                  src={capturedImage}
                  alt="Receipt preview"
                  className="w-full h-full object-cover opacity-60"
                />
                <button
                  type="button"
                  onClick={handleRetake}
                  className="absolute bottom-2 right-2 px-3 py-1 bg-slate-900/90 text-amber-400 border border-amber-500/30 rounded-lg font-medium hover:bg-slate-800 transition"
                >
                  {isUrdu ? 'دوبارہ تصویر لیں' : '📷 Retake Photo'}
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-400 block mb-1">Title</label>
                <input
                  type="text"
                  value={extractedData.title}
                  onChange={(e) =>
                    setExtractedData({ ...extractedData, title: e.target.value })
                  }
                  className="w-full p-2.5 bg-slate-800 text-white rounded-lg border border-slate-700 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Amount (PKR)</label>
                <input
                  type="number"
                  value={extractedData.amount}
                  onChange={(e) =>
                    setExtractedData({
                      ...extractedData,
                      amount: Number(e.target.value),
                    })
                  }
                  className="w-full p-2.5 bg-slate-800 text-white rounded-lg border border-slate-700 focus:outline-none focus:border-emerald-500 font-bold"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-400 block mb-1">Vendor</label>
                <input
                  type="text"
                  value={extractedData.vendor}
                  onChange={(e) =>
                    setExtractedData({
                      ...extractedData,
                      vendor: e.target.value,
                    })
                  }
                  className="w-full p-2.5 bg-slate-800 text-white rounded-lg border border-slate-700 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Category</label>
                <select
                  value={extractedData.category}
                  onChange={(e) =>
                    setExtractedData({
                      ...extractedData,
                      category: e.target.value as Category,
                    })
                  }
                  className="w-full p-2.5 bg-slate-800 text-white rounded-lg border border-slate-700 focus:outline-none focus:border-emerald-500"
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {CATEGORIES[category].emoji}{' '}
                      {getCategoryLabel(category, isUrdu ? 'ur' : 'en')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-400 block mb-1">Transaction Date</label>
                <input
                  type="date"
                  value={extractedData.transaction_date}
                  onChange={(e) =>
                    {
                      setTransactionDateCustomized(true);
                      setExtractedData({
                        ...extractedData,
                        transaction_date: e.target.value,
                      });
                    }
                  }
                  className="w-full p-2.5 bg-slate-800 text-white rounded-lg border border-slate-700 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Due Date</label>
                <input
                  type="date"
                  value={extractedData.due_date}
                  onChange={(e) =>
                    {
                      const dueDate = e.target.value;
                      setExtractedData({
                        ...extractedData,
                        due_date: dueDate,
                        ...(transactionDateCustomized
                          ? {}
                          : { transaction_date: dueDate || new Date().toISOString().split('T')[0] }),
                      });
                    }
                  }
                  className="w-full p-2.5 bg-slate-800 text-white rounded-lg border border-slate-700 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Units Consumed</label>
                <input
                  type="text"
                  placeholder="e.g. 280 kWh"
                  value={extractedData.units_consumed}
                  onChange={(e) =>
                    setExtractedData({
                      ...extractedData,
                      units_consumed: e.target.value,
                    })
                  }
                  className="w-full p-2.5 bg-slate-800 text-white rounded-lg border border-slate-700 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleRetake}
                className="w-1/3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl transition"
              >
                {isUrdu ? 'منسوخ کریں' : 'Cancel'}
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className="w-2/3 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl transition shadow-lg shadow-emerald-500/20"
              >
                {isSaving
                  ? isUrdu
                    ? 'محفوظ ہو رہا ہے...'
                    : 'Saving...'
                  : isUrdu
                  ? 'محفوظ کریں'
                  : 'Save Transaction'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}