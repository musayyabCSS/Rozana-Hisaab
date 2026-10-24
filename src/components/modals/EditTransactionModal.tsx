import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { DateInput } from '@/components/ui/DateInput';
import type { Category, Language, NewTransaction, PaymentMethod, Transaction, TransactionType } from '@/types';
import { EXPENSE_CATEGORIES, getCategoryDetails, getCategoryLabel, INCOME_CATEGORIES } from '@/lib/categories';
import { tr } from '@/lib/i18n';

interface EditTransactionModalProps {
  transaction: Transaction | null;
  onClose: () => void;
  onSave: (id: string, updates: NewTransaction) => Promise<boolean>;
  language: Language;
  dir: 'ltr' | 'rtl';
}

const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'bank', 'easypaisa', 'jazzcash', 'card'];

export function EditTransactionModal({ transaction, onClose, onSave, language, dir }: EditTransactionModalProps) {
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<Category>('bills');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!transaction) return;
    setType(transaction.type);
    setAmount(String(transaction.amount));
    setCategory(transaction.category);
    setTitle(transaction.title);
    setDate(transaction.transaction_date);
    setPaymentMethod(transaction.payment_method);
  }, [transaction]);

  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const handleTypeChange = (nextType: TransactionType) => {
    const nextCategories = nextType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    setType(nextType);
    if (!nextCategories.includes(category)) setCategory(nextCategories[0]);
  };

  const handleSave = async () => {
    if (!transaction || !title.trim() || Number(amount) <= 0 || !date) return;
    setSaving(true);
    const saved = await onSave(transaction.id, {
      type,
      amount: Number(amount),
      category,
      title: title.trim(),
      transaction_date: date,
      payment_method: paymentMethod,
    });
    setSaving(false);
    if (saved) onClose();
  };

  return (
    <Modal open={!!transaction} onClose={onClose} title={language === 'ur' ? 'لین دین میں ترمیم' : 'Edit Transaction'} subtitle={language === 'ur' ? 'تفصیلات اپ ڈیٹ کریں' : 'Update the transaction details'} dir={dir}>
      <div className="flex gap-1.5 bg-slate-950/60 rounded-2xl p-1.5 mb-5">
        <button onClick={() => handleTypeChange('expense')} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 ${type === 'expense' ? 'bg-rose-500/15 text-rose-400' : 'text-slate-500'}`}><ArrowUpRight size={16} />{tr('expense', language)}</button>
        <button onClick={() => handleTypeChange('income')} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 ${type === 'income' ? 'bg-emerald-500/15 text-emerald-400' : 'text-slate-500'}`}><ArrowDownLeft size={16} />{tr('income', language)}</button>
      </div>

      <div className="space-y-4">
        <div><label className="text-slate-400 text-xs block mb-1.5">{tr('amount', language)} ({tr('pkr', language)})</label><input type="number" value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-3 text-slate-100 text-lg font-bold focus:outline-none focus:border-emerald-500" /></div>
        <div><label className="text-slate-400 text-xs block mb-1.5">{tr('title', language)}</label><input type="text" value={title} onChange={(event) => setTitle(event.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-emerald-500" /></div>
        <div><label className="text-slate-400 text-xs block mb-1.5">{tr('category', language)}</label><div className="flex flex-wrap gap-2">{categories.map((cat) => <button key={cat} onClick={() => setCategory(cat)} className={`px-3 py-2 rounded-xl text-xs font-medium ${category === cat ? type === 'income' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-400'}`}>{getCategoryDetails(cat).emoji} {getCategoryLabel(cat, language)}</button>)}</div></div>
        <div><label className="text-slate-400 text-xs block mb-1.5">{language === 'ur' ? 'تاریخ' : 'Date'}</label><DateInput value={date} onChange={setDate} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-emerald-500" /></div>
        <div><label className="text-slate-400 text-xs block mb-1.5">{tr('paymentMethod', language)}</label><div className="flex flex-wrap gap-2">{PAYMENT_METHODS.map((method) => <button key={method} onClick={() => setPaymentMethod(method === paymentMethod ? null : method)} className={`px-3 py-2 rounded-xl text-xs font-medium ${paymentMethod === method ? 'bg-slate-700 text-slate-100' : 'bg-slate-800/60 text-slate-500'}`}>{tr(method, language)}</button>)}</div></div>
      </div>

      <button onClick={() => void handleSave()} disabled={saving || !title.trim() || Number(amount) <= 0 || !date} className="w-full mt-5 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm disabled:opacity-40"><Check size={16} className="inline mr-2" />{saving ? (language === 'ur' ? 'محفوظ ہو رہا ہے...' : 'Saving...') : (language === 'ur' ? 'تبدیلیاں محفوظ کریں' : 'Save Changes')}</button>
    </Modal>
  );
}
