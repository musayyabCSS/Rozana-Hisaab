import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import type { Language, TransactionType, Category, PaymentMethod, NewTransaction } from '@/types';
import { tr } from '@/lib/i18n';
import { getCategoryDetails, getCategoryLabel, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/categories';
import { isFutureDate } from '@/lib/format';

interface ManualEntryModalProps {
  open: boolean;
  onClose: () => void;
  language: Language;
  dir: 'ltr' | 'rtl';
  onSave: (txn: NewTransaction) => void;
}

const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'bank', 'easypaisa', 'jazzcash', 'card'];

export function ManualEntryModal({ open, onClose, language, dir, onSave }: ManualEntryModalProps) {
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<Category>('fuel');
  const [title, setTitle] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);

  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);
    const cats = newType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    setCategory(cats[0]);
  };

  const handleSave = () => {
    const amt = Number(amount);
    if (amt <= 0 || !title.trim() || !date) return;
    onSave({
      type,
      amount: amt,
      category,
      title: title.trim(),
      payment_method: paymentMethod,
      source: 'manual',
      transaction_date: date,
      is_paid: !isFutureDate(date),
    });
    // Reset
    setType('expense');
    setAmount('');
    setCategory('fuel');
    setTitle('');
    setPaymentMethod(null);
    setDate(new Date().toISOString().split('T')[0]);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={tr('add', language)} dir={dir}>
      {/* Segmented control */}
      <div className="flex gap-1.5 bg-slate-950/60 rounded-2xl p-1.5 mb-5">
        <button
          onClick={() => handleTypeChange('expense')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
            type === 'expense'
              ? 'bg-rose-500/15 text-rose-400 shadow-sm'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <ArrowUpRight size={16} />
          {tr('expense', language)}
        </button>
        <button
          onClick={() => handleTypeChange('income')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
            type === 'income'
              ? 'bg-emerald-500/15 text-emerald-400 shadow-sm'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <ArrowDownLeft size={16} />
          {tr('income', language)}
        </button>
      </div>

      {/* Amount */}
      <div className="mb-4">
        <label className="text-slate-400 text-xs block mb-1.5">{tr('amount', language)} ({tr('pkr', language)})</label>
        <div className="relative">
          <span className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-500 text-sm font-medium pointer-events-none">
            {tr('pkr', language)}
          </span>
          <input
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="w-full bg-slate-950 border border-slate-700 rounded-2xl ps-14 pe-3 py-3.5 text-slate-100 text-2xl font-bold tabular-nums focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Title */}
      <div className="mb-4">
        <label className="text-slate-400 text-xs block mb-1.5">{tr('title', language)}</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={language === 'ur' ? 'تفصیل لکھیں' : 'Enter description'}
          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
        />
      </div>

      {/* Category chips */}
      <div className="mb-4">
        <label className="text-slate-400 text-xs block mb-1.5">{tr('category', language)}</label>
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-2 rounded-xl text-xs font-medium transition-all active:scale-95 ${
                category === cat
                  ? type === 'income'
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                    : 'bg-rose-500 text-white shadow-lg shadow-rose-500/20'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {getCategoryDetails(cat).emoji} {getCategoryLabel(cat, language)}
            </button>
          ))}
        </div>
      </div>

      {/* Payment method */}
      <div className="mb-5">
        <label className="text-slate-400 text-xs block mb-1.5">{tr('paymentMethod', language)}</label>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_METHODS.map((method) => (
            <button
              key={method}
              onClick={() => setPaymentMethod(method === paymentMethod ? null : method)}
              className={`px-3 py-2 rounded-xl text-xs font-medium transition-all active:scale-95 ${
                paymentMethod === method
                  ? 'bg-slate-700 text-slate-100 shadow-sm'
                  : 'bg-slate-800/60 text-slate-500 hover:bg-slate-700/60'
              }`}
            >
              {tr(method, language)}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5">
        <label htmlFor="manual-transaction-date" className="text-slate-400 text-xs block mb-1.5">
          {language === 'ur' ? 'تاریخ' : 'Date'}
        </label>
        <input
          id="manual-transaction-date"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
          required
        />
      </div>

      <button
        onClick={handleSave}
        disabled={!amount || Number(amount) <= 0 || !title.trim() || !date}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm hover:from-emerald-400 hover:to-teal-500 transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
      >
        {tr('saveTransaction', language)}
      </button>
    </Modal>
  );
}
