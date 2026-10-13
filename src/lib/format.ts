import type { Transaction } from '@/types';

export function formatPKR(amount: number): string {
  return amount.toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function formatPKRShort(amount: number): string {
  if (amount >= 100000) {
    return `${(amount / 100000).toFixed(1)}L`;
  }
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(1)}K`;
  }
  return String(amount);
}

export function formatDate(dateStr: string, lang: 'en' | 'ur'): string {
  const date = new Date(dateStr);
  if (lang === 'ur') {
    return date.toLocaleDateString('ur-PK', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  return date.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function getRelativeDate(dateStr: string, lang: 'en' | 'ur'): string {
  const date = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diffDays = Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (Number.isNaN(diffDays)) return dateStr;

  if (lang === 'ur') {
    if (diffDays === 0) return 'آج';
    if (diffDays === 1) return 'کل';
    if (diffDays > 1) return `${diffDays} دن بعد`;
    if (diffDays === -1) return 'گزشتہ کل';
    if (diffDays > -7) return `${Math.abs(diffDays)} دن پہلے`;
    return date.toLocaleDateString('ur-PK', { day: 'numeric', month: 'short' });
  }

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays > 1) return `In ${diffDays} days`;
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > -7) return `${Math.abs(diffDays)} days ago`;
  return date.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
}

export function isFutureDate(dateStr: string): boolean {
  const dateKey = dateStr.slice(0, 10);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;
  return dateKey > todayKey;
}

export function getMonthStats(transactions: Transaction[], year: number, month: number) {
  const filtered = transactions.filter((t) => {
    const d = new Date(t.transaction_date);
    return (
      t.is_paid !== false &&
      !isFutureDate(t.transaction_date) &&
      d.getFullYear() === year &&
      d.getMonth() === month
    );
  });

  const totalIncome = filtered
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const totalExpenses = filtered
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const availableFunds = totalIncome - totalExpenses;

  return { totalIncome, totalExpenses, availableFunds, transactions: filtered };
}

export function filterTransactions(
  transactions: Transaction[],
  filter: 'all' | 'income' | 'expense',
): Transaction[] {
  if (filter === 'all') return transactions;
  return transactions.filter((t) => t.type === filter);
}
