import { Droplets, Flame, ReceiptText, Wifi, Zap } from 'lucide-react';
import {
  findBillConnection,
  getConnectionLabel,
  getNextExpectedIssueDate,
} from '@/lib/billConnections';
import { getCategoryIcon } from '@/lib/categories';
import { formatDate, getLocalDateKey, isFutureDate } from '@/lib/format';
import { tr } from '@/lib/i18n';
import type { BillConnection, Language, Transaction } from '@/types';

// How far ahead the dashboard strip looks (overdue items always show). The
// strip's count and the Bills badge use the same window.
const DAYS_AHEAD = 7;
// "Next bill expected" reminders show this many days either side of the date.
const EXPECTED_DAYS_AROUND = 7;

export type UpcomingItem =
  | {
      kind: 'pending';
      key: string;
      label: string;
      icon: typeof Zap;
      date: string;
      amount: number;
      overdue: boolean;
      transaction: Transaction;
    }
  | {
      kind: 'expected';
      key: string;
      label: string;
      icon: typeof Zap;
      date: string;
      late: boolean;
      connection: BillConnection;
    };

export function getUpcomingDateText(item: UpcomingItem, language: Language): string {
  const date = formatDate(item.date);
  if (item.kind === 'expected') {
    return tr(item.late ? 'billExpectedLate' : 'billExpectedAround', language).replace('{date}', date);
  }
  return tr(item.overdue ? 'upcomingOverdueOn' : 'upcomingDueOn', language).replace('{date}', date);
}

function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return getLocalDateKey(new Date(year, month - 1, day + days));
}

export function getBillIcon(provider: string) {
  const name = provider.toUpperCase();
  if (/ESCO|K-?ELECTRIC|ELECTRIC/.test(name)) return Zap;
  if (/SNGPL|SSGC|SUI|GAS/.test(name)) return Flame;
  if (/WASA|WATER/.test(name)) return Droplets;
  if (/PTCL|STORM|NAYATEL|TRANSWORLD|FIBER|FIBRE|INTERNET|OPTIX/.test(name)) return Wifi;
  return ReceiptText;
}

// Same rule the transaction list uses for "Scheduled": not yet marked paid or
// received, or dated in the future. Expenses and income alike, oldest first.
export function getPendingItems(transactions: Transaction[], connections: BillConnection[]): UpcomingItem[] {
  const today = getLocalDateKey();
  return transactions
    .filter((txn) => txn.is_paid === false || isFutureDate(txn.transaction_date))
    .map((txn): UpcomingItem => {
      const connection = findBillConnection(connections, txn.consumer_number);
      const date = (txn.due_date || txn.transaction_date).slice(0, 10);
      const isBill = Boolean(connection) || txn.category === 'bills';
      return {
        kind: 'pending',
        key: `pending-${txn.id}`,
        label: connection ? getConnectionLabel(connection) : txn.title,
        icon: isBill ? getBillIcon(connection?.provider ?? txn.title) : getCategoryIcon(txn.category),
        date,
        amount: Number(txn.amount),
        overdue: txn.is_paid === false && date < today,
        transaction: txn,
      };
    })
    .sort((first, second) => first.date.localeCompare(second.date));
}

// Bills are utility/bill-category expenses and anything scanned with a
// consumer or reference number (e.g. loan statements).
function isBill(txn: Transaction): boolean {
  return txn.type === 'expense' && (txn.category === 'bills' || Boolean(txn.consumer_number));
}

export interface BillEntry {
  key: string;
  label: string;
  icon: typeof Zap;
  date: string;
  amount: number;
  transaction: Transaction;
}

// Every bill, split into unpaid (oldest due first) and paid (newest first).
export function getBills(transactions: Transaction[], connections: BillConnection[]) {
  const bills = transactions.filter(isBill);
  // Not yet marked paid, or dated in the future, same as the Upcoming rule.
  const unpaid = getPendingItems(bills, connections).filter(
    (item): item is Extract<UpcomingItem, { kind: 'pending' }> => item.kind === 'pending',
  );
  const unpaidIds = new Set(unpaid.map((item) => item.transaction.id));
  const paid: BillEntry[] = bills
    .filter((txn) => !unpaidIds.has(txn.id))
    .map((txn) => {
      const connection = findBillConnection(connections, txn.consumer_number);
      return {
        key: `bill-${txn.id}`,
        label: connection ? getConnectionLabel(connection) : txn.title,
        icon: getBillIcon(connection?.provider ?? txn.title),
        date: txn.transaction_date.slice(0, 10),
        amount: Number(txn.amount),
        transaction: txn,
      };
    })
    .sort((first, second) => second.date.localeCompare(first.date));
  return { unpaid, paid };
}

// Unpaid bills due within the window, or overdue: the Bills badge.
export function countBillsNeedingAttention(transactions: Transaction[], connections: BillConnection[]): number {
  const limit = shiftDateKey(getLocalDateKey(), DAYS_AHEAD);
  return getBills(transactions, connections).unpaid.filter((item) => item.date <= limit).length;
}

// What the dashboard strip shows: pending items due soon (or overdue) and saved
// bills expected to arrive around now. Empty when nothing is coming up.
export function getUpcomingItems(transactions: Transaction[], connections: BillConnection[]): UpcomingItem[] {
  const today = getLocalDateKey();
  const stripLimit = shiftDateKey(today, DAYS_AHEAD);
  const pending = getPendingItems(transactions, connections).filter((item) => item.date <= stripLimit);
  const pendingNumbers = new Set(
    pending.flatMap((item) =>
      item.kind === 'pending' && item.transaction.consumer_number ? [item.transaction.consumer_number] : [],
    ),
  );

  const expected = connections.flatMap((connection): UpcomingItem[] => {
    const date = getNextExpectedIssueDate(connection.last_issue_date, connection.billing_interval_months);
    if (!date || pendingNumbers.has(connection.consumer_number)) return [];
    if (date < shiftDateKey(today, -EXPECTED_DAYS_AROUND) || date > shiftDateKey(today, EXPECTED_DAYS_AROUND)) return [];
    return [{
      kind: 'expected',
      key: `expected-${connection.id}`,
      label: getConnectionLabel(connection),
      icon: getBillIcon(connection.provider),
      date,
      late: date < today,
      connection,
    }];
  });

  return [...pending, ...expected].sort((first, second) => first.date.localeCompare(second.date));
}
