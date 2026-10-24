import type { BillConnection } from '@/types';

export const BILLING_INTERVAL_OPTIONS = [1, 2, 3] as const;

// Consumer numbers are printed with varying spacing ("44 11564 8318413U"), so
// they are stored without spaces and in upper case to match across scans.
export function normalizeConsumerNumber(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[\s-]+/g, '').toUpperCase();
  return normalized.length >= 4 ? normalized : null;
}

export function normalizeIntervalMonths(value: unknown): number {
  const months = typeof value === 'number' ? Math.round(value) : Number.NaN;
  return Number.isFinite(months) && months >= 1 && months <= 12 ? months : 1;
}

export function findBillConnection(
  connections: BillConnection[],
  consumerNumber: string | null | undefined,
): BillConnection | null {
  const key = normalizeConsumerNumber(consumerNumber);
  if (!key) return null;
  return connections.find((connection) => connection.consumer_number === key) ?? null;
}

// Bills are issued around the same day each cycle: the next one is expected the
// billing interval after the last issue date (clamped to the end of shorter
// months). Mirrored in scripts/send-reminders.mjs.
export function getNextExpectedIssueDate(
  lastIssueDate: string | null,
  intervalMonths: number = 1,
): string | null {
  if (!lastIssueDate || !/^\d{4}-\d{2}-\d{2}$/.test(lastIssueDate)) return null;
  const [year, month, day] = lastIssueDate.split('-').map(Number);
  const monthIndex = month - 1 + normalizeIntervalMonths(intervalMonths);
  const nextYear = year + Math.floor(monthIndex / 12);
  const nextMonth = monthIndex % 12;
  const daysInNextMonth = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate();
  const nextDay = Math.min(day, daysInNextMonth);
  return `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;
}

export function getConnectionLabel(connection: BillConnection): string {
  return connection.nickname?.trim() || connection.provider;
}
