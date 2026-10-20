import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { formatPKR } from '@/lib/format';
import { tr } from '@/lib/i18n';
import type { Category, Language, Transaction, TransactionType } from '@/types';
import { EXPENSE_CATEGORIES, getCategoryDetails, getCategoryLabel, INCOME_CATEGORIES } from '@/lib/categories';
import type { PendingMedia } from '@/lib/localStore';

function createReviewDraft(transaction: Transaction | undefined): Transaction | null {
  if (!transaction) return null;
  const availableCategories =
    transaction.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const resolvedCategory = getCategoryDetails(transaction.category).id;
  const fallbackCategory =
    transaction.type === 'income' ? 'business' : 'misc_expense';
  const safeCategory =
    availableCategories.find((category) => category === resolvedCategory) ??
    availableCategories.find((category) => category === fallbackCategory) ??
    availableCategories[0];
  return { ...transaction, category: safeCategory };
}

interface PendingMediaReviewModalProps {
  media: PendingMedia | null;
  language: Language;
  dir: 'ltr' | 'rtl';
  onRetry: (id: string) => void;
  onDiscard: (id: string) => void;
  onSave: (media: PendingMedia, transaction: Transaction) => Promise<boolean>;
}

export function PendingMediaReviewModal({
  media,
  language,
  dir,
  onRetry,
  onDiscard,
  onSave,
}: PendingMediaReviewModalProps) {
  const transaction = media?.transaction;
  const isUrdu = language === 'ur';
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [draft, setDraft] = useState<Transaction | null>(() => createReviewDraft(transaction));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(createReviewDraft(transaction));
    setSaving(false);
    setSaveError(null);
  }, [media?.id, transaction]);

  useEffect(() => {
    if (!media || media.type !== 'receipt') {
      setReceiptPreview(null);
      return;
    }
    const url = URL.createObjectURL(media.blob);
    setReceiptPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [media]);

  const categories = draft?.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const changeType = (type: TransactionType) => {
    if (!draft) return;
    const nextCategories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    setDraft({
      ...draft,
      type,
      category: nextCategories.includes(draft.category) ? draft.category : nextCategories[0],
    });
  };

  const saveTransaction = async () => {
    if (!media || !draft || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await onSave(media, draft);
      if (!saved) setSaveError(isUrdu ? 'لین دین محفوظ نہیں ہو سکا۔ دوبارہ کوشش کریں۔' : 'Could not save the transaction. Please try again.');
    } catch (error) {
      console.error('Could not confirm the reviewed transaction:', error);
      setSaveError(error instanceof Error ? error.message : 'Could not save the transaction. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={media !== null}
      onClose={() => media && onDiscard(media.id)}
      title={tr('mediaReviewTitle', language)}
      dir={dir}
    >
      {media?.status === 'failed' ? (
        <div className="space-y-4">
          <p role="alert" className="text-sm text-amber-300">
            {media.errorKind === 'too_large'
              ? tr(media.type === 'voice' ? 'mediaTooLargeVoice' : 'mediaTooLargeReceipt', language)
              : media.errorKind === 'invalid'
                ? tr('mediaInvalid', language)
                : tr('mediaFailure', language)}
          </p>
          <div className="flex gap-3">
            {media.errorKind === 'server' && (
              <button
                type="button"
                onClick={() => onRetry(media.id)}
                className="flex-1 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950"
              >
                {tr('mediaRetry', language)}
              </button>
            )}
            <button
              type="button"
              onClick={() => onDiscard(media.id)}
              className="flex-1 rounded-xl border border-slate-700 px-4 py-3 text-sm text-slate-200"
            >
              {tr('mediaDiscard', language)}
            </button>
          </div>
        </div>
      ) : media && draft ? (
        <div className="max-h-[calc(90dvh-7rem)] overflow-y-auto px-1 py-1">
        <div className="space-y-4 pb-2">
          {media.type === 'receipt' && receiptPreview && (
            <img
              src={receiptPreview}
              alt={isUrdu ? 'رسید کی تصویر' : 'Receipt photo'}
              className="max-h-48 w-full rounded-xl object-contain"
            />
          )}
          <div className="flex gap-1.5 rounded-2xl bg-slate-950/60 p-1.5">
            <button
              type="button"
              onClick={() => changeType('expense')}
              aria-pressed={draft.type === 'expense'}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold ${draft.type === 'expense' ? 'bg-rose-500/15 text-rose-400' : 'text-slate-500'}`}
            >
              <ArrowUpRight size={16} />{tr('expense', language)}
            </button>
            <button
              type="button"
              onClick={() => changeType('income')}
              aria-pressed={draft.type === 'income'}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold ${draft.type === 'income' ? 'bg-emerald-500/15 text-emerald-400' : 'text-slate-500'}`}
            >
              <ArrowDownLeft size={16} />{tr('income', language)}
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label htmlFor="review-transaction-amount" className="mb-1.5 block text-xs text-slate-400">
                {tr('amount', language)} ({tr('pkr', language)})
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">{tr('pkr', language)}</span>
                <input
                  id="review-transaction-amount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={draft.amount || ''}
                  onChange={(event) => setDraft({ ...draft, amount: Number(event.target.value) })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pe-3 ps-14 text-lg font-bold text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">{formatPKR(draft.amount || 0)}</p>
            </div>
            <div>
              <label htmlFor="review-transaction-title" className="mb-1.5 block text-xs text-slate-400">{tr('title', language)}</label>
              <input
                id="review-transaction-title"
                type="text"
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <span className="mb-1.5 block text-xs text-slate-400">{tr('category', language)}</span>
              <div className="flex flex-wrap gap-2">
                {categories.map((category: Category) => (
                  <button
                    key={category}
                    type="button"
                    aria-pressed={category === draft.category}
                    onClick={() => setDraft({ ...draft, category })}
                    className={`rounded-xl px-3 py-2 text-xs font-medium transition-all active:scale-95 ${
                      category === draft.category
                        ? draft.type === 'income'
                          ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                          : 'bg-rose-500 text-white shadow-lg shadow-rose-500/20'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    {getCategoryDetails(category).emoji} {getCategoryLabel(category, language)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="review-transaction-date" className="mb-1.5 block text-xs text-slate-400">{isUrdu ? 'تاریخ' : 'Date'}</label>
              <input
                id="review-transaction-date"
                type="date"
                value={draft.transaction_date}
                onChange={(event) => setDraft({ ...draft, transaction_date: event.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>
          {saveError && <p role="alert" className="text-sm text-rose-300">{saveError}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void saveTransaction()}
              disabled={saving || !draft.title.trim() || !Number.isFinite(draft.amount) || draft.amount <= 0 || !draft.transaction_date}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50"
            >
              <Check size={16} />
              {saving ? (isUrdu ? 'محفوظ ہو رہا ہے...' : 'Saving...') : 'Confirm & Save'}
            </button>
            <button
              type="button"
              onClick={() => onDiscard(media.id)}
              disabled={saving}
              className="flex-1 rounded-xl border border-slate-700 px-4 py-3 text-sm text-slate-200 disabled:opacity-50"
            >
              {isUrdu ? 'منسوخ / حذف کریں' : 'Cancel / Discard'}
            </button>
          </div>
        </div>
        </div>
      ) : null}
    </Modal>
  );
}
