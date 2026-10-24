import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { DateInput } from '@/components/ui/DateInput';
import { formatDate, formatPKR } from '@/lib/format';
import { tr } from '@/lib/i18n';
import type { BillConnection, Category, Language, Transaction, TransactionType } from '@/types';
import { findBillConnection, getConnectionLabel, normalizeConsumerNumber } from '@/lib/billConnections';
import { EXPENSE_CATEGORIES, getCategoryDetails, getCategoryLabel, INCOME_CATEGORIES } from '@/lib/categories';
import type { MediaReviewDraft } from '@/lib/mediaProcessing';

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

// Present when the bill should be linked to a saved connection (new or existing).
export interface ConnectionSaveOptions {
  nickname: string | null;
}

interface TransactionReviewModalProps {
  media: MediaReviewDraft | null;
  language: Language;
  dir: 'ltr' | 'rtl';
  connections: BillConnection[];
  onDiscard: (id: string) => void;
  onSave: (
    media: MediaReviewDraft,
    transaction: Transaction,
    connection: ConnectionSaveOptions | null,
  ) => Promise<boolean>;
}

export function TransactionReviewModal({
  media,
  language,
  dir,
  connections,
  onDiscard,
  onSave,
}: TransactionReviewModalProps) {
  const transaction = media?.transaction;
  const isUrdu = language === 'ur';
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [draft, setDraft] = useState<Transaction | null>(() => createReviewDraft(transaction));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [trackConnection, setTrackConnection] = useState(true);
  const [connectionNickname, setConnectionNickname] = useState('');

  useEffect(() => {
    setDraft(createReviewDraft(transaction));
    setSaving(false);
    setSaveError(null);
    setTrackConnection(true);
    setConnectionNickname('');
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
      // Only expense bills can be pending; income is always recorded as received.
      is_paid: type === 'income' ? true : media?.transaction.is_paid ?? true,
    });
  };

  // Bills and statements carry a consumer/reference number that links them to a saved connection.
  const showConsumerNumber =
    draft?.type === 'expense' &&
    (Boolean(draft.consumer_number) || draft.category === 'bills' || draft.category === 'udhaar');
  const linkedConnection = findBillConnection(connections, draft?.consumer_number);

  const saveTransaction = async () => {
    if (!media || !draft || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const consumerNumber = draft.type === 'expense' ? normalizeConsumerNumber(draft.consumer_number) : null;
      const saved = await onSave(
        media,
        { ...draft, consumer_number: consumerNumber },
        consumerNumber && (linkedConnection || trackConnection)
          ? { nickname: linkedConnection ? null : connectionNickname }
          : null,
      );
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
      {media && draft ? (
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
              <DateInput
                id="review-transaction-date"
                value={draft.transaction_date}
                onChange={(value) => setDraft({ ...draft, transaction_date: value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            {draft.is_paid === false && draft.due_date && (
              <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300">
                {tr('reviewUnpaidBill', language).replace('{date}', formatDate(draft.due_date))}
              </p>
            )}
            {showConsumerNumber && (
              <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                <label htmlFor="review-consumer-number" className="block text-xs text-slate-400">
                  {tr('billConsumerNumber', language)}
                </label>
                <input
                  id="review-consumer-number"
                  type="text"
                  inputMode="text"
                  autoCapitalize="characters"
                  value={draft.consumer_number ?? ''}
                  onChange={(event) => setDraft({ ...draft, consumer_number: event.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm tracking-wide text-slate-100 focus:border-emerald-500 focus:outline-none"
                  dir="ltr"
                />
                {linkedConnection ? (
                  <p className="text-xs text-emerald-300">
                    {tr('billLinkedTo', language).replace('{name}', getConnectionLabel(linkedConnection))}
                  </p>
                ) : normalizeConsumerNumber(draft.consumer_number) ? (
                  <>
                    <label className="flex items-center gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={trackConnection}
                        onChange={(event) => setTrackConnection(event.target.checked)}
                        className="h-4 w-4 accent-emerald-500"
                      />
                      {tr('billTrackConnection', language)}
                    </label>
                    {trackConnection && (
                      <input
                        type="text"
                        value={connectionNickname}
                        onChange={(event) => setConnectionNickname(event.target.value)}
                        placeholder={tr('billNicknamePlaceholder', language).replace('{provider}', draft.title || 'LESCO')}
                        aria-label={tr('billNickname', language)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                      />
                    )}
                  </>
                ) : null}
              </div>
            )}
          </div>
          {saveError && <p role="alert" className="text-sm text-rose-300">{saveError}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void saveTransaction()}
              disabled={saving || !draft.title.trim() || !Number.isFinite(draft.amount) || draft.amount <= 0 || !draft.transaction_date}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-ink disabled:opacity-50"
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
