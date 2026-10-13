import { ArrowLeft, ArrowRight, Camera, Check, Pencil, Search, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { NewTransaction, Transaction, Language } from '@/types';
import { tr } from '@/lib/i18n';
import { getCategoryEmoji, getCategoryLabel } from '@/lib/categories';
import { formatDate, formatPKR, getRelativeDate, isFutureDate } from '@/lib/format';
import { filterTransactions } from '@/lib/format';
import { getReceiptImage } from '@/lib/receiptStorage';
import { Modal } from '@/components/ui/Modal';

interface TransactionFeedProps {
  transactions: Transaction[];
  language: Language;
  dir: 'ltr' | 'rtl';
  filter: 'all' | 'income' | 'expense';
  onFilterChange: (f: 'all' | 'income' | 'expense') => void;
  onDelete: (id: string) => void;
  onEdit: (transaction: Transaction) => void;
  onUpdate: (id: string, updates: Partial<NewTransaction>) => Promise<boolean>;
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function TransactionFeed({
  transactions,
  language,
  dir,
  filter,
  onFilterChange,
  onDelete,
  onEdit,
  onUpdate,
}: TransactionFeedProps) {
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<'month' | '30days' | 'all'>('all');
  const [paymentTransaction, setPaymentTransaction] = useState<Transaction | null>(null);
  const [paymentDate, setPaymentDate] = useState(() => toLocalDateKey(new Date()));
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    },
    [receiptPreview],
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = toLocalDateKey(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = toLocalDateKey(yesterday);

  const visibleTransactions = filterTransactions(transactions, filter)
    .filter((transaction) => {
      if (!showAll) {
        return transaction.transaction_date.slice(0, 10) === todayKey;
      }
      const query = search.trim().toLocaleLowerCase();
      const matchesSearch =
        !query ||
        transaction.title.toLocaleLowerCase().includes(query) ||
        (transaction.provider ?? '').toLocaleLowerCase().includes(query);
      if (!matchesSearch) return false;

      const transactionDate = new Date(`${transaction.transaction_date.slice(0, 10)}T00:00:00`);
      if (dateRange === 'month') {
        return (
          transactionDate.getFullYear() === today.getFullYear() &&
          transactionDate.getMonth() === today.getMonth()
        );
      }
      if (dateRange === '30days') {
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 29);
        return transactionDate >= startDate && transactionDate <= today;
      }
      return true;
    })
    .slice()
    .sort(
      (first, second) =>
        second.transaction_date.localeCompare(first.transaction_date) ||
        (second.created_at ?? '').localeCompare(first.created_at ?? ''),
    );

  const displayedTransactions = visibleTransactions;
  const groupedTransactions = displayedTransactions.reduce<
    Array<{ date: string; transactions: Transaction[] }>
  >((groups, transaction) => {
    const date = transaction.transaction_date.slice(0, 10);
    const existingGroup = groups[groups.length - 1];
    if (existingGroup?.date === date) {
      existingGroup.transactions.push(transaction);
    } else {
      groups.push({ date, transactions: [transaction] });
    }
    return groups;
  }, []);

  const showReceipt = async (transactionId: string) => {
    setReceiptError(null);
    try {
      const imageUrl = await getReceiptImage(transactionId);
      if (!imageUrl) {
        setReceiptError(
          language === 'ur'
            ? 'رسید کی تصویر اس ڈیوائس پر موجود نہیں۔'
            : 'Receipt image is not available on this device.',
        );
        return;
      }
      setReceiptPreview(imageUrl);
    } catch (error) {
      console.error('Error loading receipt image:', error);
      setReceiptError(
        language === 'ur'
          ? 'رسید کی تصویر لوڈ نہیں ہو سکی۔'
          : 'Could not load receipt image.',
      );
    }
  };

  const confirmMarkPaid = async () => {
    if (!paymentTransaction || !paymentDate || isMarkingPaid) return;
    setIsMarkingPaid(true);
    setPaymentError(null);
    try {
      const updated = await onUpdate(paymentTransaction.id, {
        is_paid: true,
        transaction_date: paymentDate,
      });
      if (!updated) {
        setPaymentError(
          language === 'ur'
            ? 'لین دین اپ ڈیٹ نہیں ہو سکا۔ دوبارہ کوشش کریں۔'
            : 'Could not update transaction. Please try again.',
        );
        return;
      }
      setPaymentTransaction(null);
    } catch (error) {
      console.error('Error marking transaction as paid:', error);
      setPaymentError(
        language === 'ur'
          ? 'لین دین اپ ڈیٹ نہیں ہو سکا۔ دوبارہ کوشش کریں۔'
          : 'Could not update transaction. Please try again.',
      );
    } finally {
      setIsMarkingPaid(false);
    }
  };

  const filterTabs: { key: 'all' | 'income' | 'expense'; label: string }[] = [
    { key: 'all', label: tr('all', language) },
    { key: 'income', label: tr('incomeOnly', language) },
    { key: 'expense', label: tr('expenseOnly', language) },
  ];

  return (
    <div
      className={
        showAll
          ? 'fixed inset-0 z-40 overflow-y-auto bg-slate-950 p-4 sm:p-6'
          : 'rounded-3xl bg-slate-900 border border-slate-800 p-4'
      }
    >
      <div
        className={`mx-auto ${
          showAll ? 'max-w-3xl rounded-3xl bg-slate-900 border border-slate-800 p-4 sm:p-6' : ''
        }`}
      >
      <div className={`flex items-center justify-between mb-3 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
        <div className="flex items-center gap-2">
          {showAll && (
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              aria-label={language === 'ur' ? 'واپس جائیں' : 'Back to dashboard'}
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <h3 className="text-slate-100 font-bold text-sm">
            {showAll
              ? tr('recentTransactions', language)
              : language === 'ur'
                ? `${tr('today', language)} کے لین دین`
                : "Today's Transactions"}
          </h3>
        </div>
        {!showAll && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300"
          >
            {language === 'ur' ? 'سب دیکھیں' : `View All (${transactions.length})`}
            <ArrowRight size={14} />
          </button>
        )}
      </div>

      {showAll && (
        <>
          <label className="relative block mb-3">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={language === 'ur' ? 'عنوان یا فروخت کنندہ تلاش کریں' : 'Search title or vendor'}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </label>
          <div className="flex gap-2 mb-4 overflow-x-auto">
            {([
              ['month', language === 'ur' ? 'اس ماہ' : 'This Month'],
              ['30days', language === 'ur' ? 'گزشتہ 30 دن' : 'Last 30 Days'],
              ['all', language === 'ur' ? 'تمام وقت' : 'All Time'],
            ] as const).map(([range, label]) => (
              <button
                key={range}
                type="button"
                onClick={() => setDateRange(range)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  dateRange === range
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="flex gap-1.5 mb-4 bg-slate-950/60 rounded-xl p-1">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onFilterChange(tab.key)}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
              filter === tab.key
                ? 'bg-slate-800 text-slate-100 shadow-sm'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Transactions list */}
      {displayedTransactions.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-slate-500 text-sm">
            {!showAll && language === 'en'
              ? 'No transactions recorded today.'
              : tr('noTransactions', language)}
          </p>
        </div>
      ) : (
          <div className="space-y-4">
          {groupedTransactions.map((group) => (
            <section key={group.date} aria-label={group.date}>
              <h4 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {group.date === todayKey
                  ? tr('today', language)
                  : group.date === yesterdayKey
                    ? tr('yesterday', language)
                    : formatDate(group.date, language)}
              </h4>
              <div className="space-y-2">
                {group.transactions.map((txn) => {
                  const isIncome = txn.type === 'income';
                  const isScheduled = txn.is_paid === false || isFutureDate(txn.transaction_date);
                  return (
                    <div
                      key={txn.id}
                      dir={dir}
                      className="group flex flex-col gap-2 rounded-2xl bg-slate-950/40 border border-slate-800/50 p-3 hover:border-slate-700 transition-all"
                    >
                      <div className="flex min-w-0 items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div
                            className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                              isIncome ? 'bg-emerald-500/15' : 'bg-rose-500/15'
                            }`}
                          >
                            {getCategoryEmoji(txn.category)}
                          </div>
                          <div
                            className={`min-w-0 flex-1 ${
                              dir === 'rtl' ? 'text-right' : 'text-left'
                            }`}
                          >
                            <p className="truncate text-slate-100 text-sm font-medium">
                              {txn.title}
                            </p>
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <p
                            dir="ltr"
                            className={`font-bold text-sm tabular-nums ${
                              isIncome ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {isIncome ? '+' : '−'} {formatPKR(Number(txn.amount))}
                          </p>
                        </div>
                      </div>

                      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                          <span
                            className={`max-w-full rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                              isIncome
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-rose-500/10 text-rose-400'
                            }`}
                          >
                            {getCategoryLabel(txn.category, language)}
                          </span>
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[10px] ${
                              isScheduled
                                ? 'bg-amber-500/10 text-amber-400 font-medium'
                                : 'bg-slate-800 text-slate-500'
                            }`}
                          >
                            {getRelativeDate(txn.transaction_date, language)}
                          </span>
                          {isScheduled && (
                            <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-400">
                              {language === 'ur' ? 'غیر ادا شدہ' : 'Scheduled'}
                            </span>
                          )}
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          {isScheduled && (
                            <button
                              type="button"
                              onClick={() => {
                                setPaymentTransaction(txn);
                                setPaymentDate(toLocalDateKey(new Date()));
                                setPaymentError(null);
                              }}
                              className="flex items-center gap-1 rounded-lg bg-amber-500/10 px-2 py-1.5 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/20"
                            >
                              <Check size={13} />
                              {isIncome
                                ? language === 'ur'
                                  ? 'وصول شدہ'
                                  : 'Mark Received'
                                : language === 'ur'
                                  ? 'ادا کریں'
                                  : 'Mark Paid'}
                            </button>
                          )}
                          {txn.has_receipt && (
                            <button
                              type="button"
                              onClick={() => void showReceipt(txn.id)}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-sky-500/10 hover:text-sky-400"
                              aria-label={language === 'ur' ? 'رسید دیکھیں' : 'View receipt'}
                            >
                              <Camera size={15} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onEdit(txn)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-emerald-500/10 hover:text-emerald-400"
                            aria-label={language === 'ur' ? 'ترمیم' : 'Edit transaction'}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(txn.id)}
                            className="rounded-lg p-1.5 text-slate-600 hover:bg-rose-500/10 hover:text-rose-400"
                            aria-label={tr('delete', language)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
      )}

      {receiptError && (
        <p role="alert" className="mt-3 text-xs text-rose-400">
          {receiptError}
        </p>
      )}

      {receiptPreview && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={language === 'ur' ? 'رسید کی تصویر' : 'Receipt image'}
          onClick={() => setReceiptPreview(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] w-full flex items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setReceiptPreview(null)}
              className="absolute -top-3 -right-3 z-10 rounded-full bg-slate-800 p-2 text-white hover:bg-slate-700"
              aria-label={language === 'ur' ? 'بند کریں' : 'Close receipt preview'}
            >
              <X size={20} />
            </button>
            <img
              src={receiptPreview}
              alt={language === 'ur' ? 'رسید' : 'Receipt'}
              className="max-h-[85vh] max-w-full rounded-xl object-contain"
            />
          </div>
        </div>
      )}
      <Modal
        open={paymentTransaction !== null}
        onClose={() => {
          if (!isMarkingPaid) {
            setPaymentTransaction(null);
            setPaymentError(null);
          }
        }}
        title={
          paymentTransaction?.type === 'income'
            ? language === 'ur'
              ? 'وصولی کی تصدیق'
              : 'Confirm Receipt'
            : language === 'ur'
              ? 'ادائیگی کی تصدیق'
              : 'Confirm Payment'
        }
        subtitle={
          language === 'ur'
            ? 'تاریخ کی تصدیق کریں اور لین دین کو ادا شدہ نشان زد کریں۔'
            : 'Confirm the details and date to update this transaction.'
        }
        dir={dir}
      >
        {paymentTransaction && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
              <div className="flex justify-between gap-4">
                <span className="text-xs text-slate-400">{tr('title', language)}</span>
                <span className="text-sm text-slate-100 text-right">{paymentTransaction.title}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-xs text-slate-400">{tr('amount', language)}</span>
                <span className="text-sm font-bold text-slate-100">
                  {tr('pkr', language)} {formatPKR(Number(paymentTransaction.amount))}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-xs text-slate-400">{tr('category', language)}</span>
                <span className="text-sm text-slate-100">
                  {getCategoryEmoji(paymentTransaction.category)}{' '}
                  {getCategoryLabel(paymentTransaction.category, language)}
                </span>
              </div>
            </div>
            <div>
              <label htmlFor="payment-confirm-date" className="text-slate-400 text-xs block mb-1.5">
                {language === 'ur' ? 'ادائیگی کی تاریخ' : 'Payment Date'}
              </label>
              <input
                id="payment-confirm-date"
                type="date"
                value={paymentDate}
                max={toLocalDateKey(new Date())}
                onChange={(event) => setPaymentDate(event.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-amber-500"
                required
              />
            </div>
            {paymentError && (
              <p role="alert" className="text-sm text-rose-400">
                {paymentError}
              </p>
            )}
            <button
              type="button"
              onClick={() => void confirmMarkPaid()}
              disabled={isMarkingPaid || !paymentDate}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 font-bold text-sm disabled:opacity-50"
            >
              {isMarkingPaid
                ? language === 'ur'
                  ? 'محفوظ ہو رہا ہے...'
                  : 'Updating...'
                : paymentTransaction.type === 'income'
                  ? language === 'ur'
                    ? 'وصولی کی تصدیق کریں'
                    : 'Confirm Received'
                  : language === 'ur'
                    ? 'ادا شدہ نشان زد کریں'
                    : 'Confirm Mark Paid'}
            </button>
          </div>
        )}
      </Modal>
      </div>
    </div>
  );
}
