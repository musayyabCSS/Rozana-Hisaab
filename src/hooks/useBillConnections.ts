import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { supabase } from '@/lib/supabase';
import { getLocalDateKey } from '@/lib/format';
import { DAILY_REMINDER_ID } from '@/hooks/useNotifications';
import { billReminderId, cancelNativeBillReminders } from '@/lib/billReminders';
import {
  findBillConnection,
  getConnectionLabel,
  getNextExpectedIssueDate,
  normalizeConsumerNumber,
  normalizeIntervalMonths,
} from '@/lib/billConnections';
import type { BillConnection, Language } from '@/types';

const CACHE_KEY = 'rozana_bill_connections';
const REMINDER_HOUR = 10;

const CONNECTION_COLUMNS =
  'id, consumer_number, provider, nickname, last_issue_date, last_amount, billing_interval_months';

export interface BillDetails {
  consumerNumber: string;
  provider: string;
  nickname?: string | null;
  issueDate?: string | null;
  amount?: number | null;
  // Billing cycle read from the bill; only used when creating the connection.
  intervalMonths?: number;
}

function readCache(userId: string): BillConnection[] {
  try {
    const cached = localStorage.getItem(`${CACHE_KEY}_${userId}`);
    const parsed: unknown = cached ? JSON.parse(cached) : [];
    return Array.isArray(parsed) ? (parsed as BillConnection[]) : [];
  } catch {
    return [];
  }
}

function writeCache(userId: string, connections: BillConnection[]) {
  try {
    localStorage.setItem(`${CACHE_KEY}_${userId}`, JSON.stringify(connections));
  } catch (error) {
    console.error('Could not cache bill connections:', error);
  }
}

function sortConnections(connections: BillConnection[]): BillConnection[] {
  return [...connections].sort((first, second) =>
    getConnectionLabel(first).localeCompare(getConnectionLabel(second)),
  );
}

// Android has no server push, so expected-bill reminders are scheduled as local
// notifications while the daily reminder is switched on; the web gets them from
// scripts/send-reminders.mjs instead.
async function scheduleNativeReminders(connections: BillConnection[], language: Language) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted') return;

    const pending = await LocalNotifications.getPending();
    await cancelNativeBillReminders();
    const remindersEnabled = pending.notifications.some(({ id }) => id === DAILY_REMINDER_ID);
    if (!remindersEnabled) return;

    const today = getLocalDateKey();
    const notifications = connections.flatMap((connection) => {
      const expected = getNextExpectedIssueDate(connection.last_issue_date, connection.billing_interval_months);
      if (!expected || expected < today) return [];
      const [year, month, day] = expected.split('-').map(Number);
      const at = new Date(year, month - 1, day, REMINDER_HOUR, 0, 0);
      if (at.getTime() <= Date.now()) return [];
      const label = getConnectionLabel(connection);
      return [{
        id: billReminderId(connection.consumer_number),
        title: language === 'ur' ? `${label}: نیا بل متوقع` : `${label}: new bill expected`,
        body:
          language === 'ur'
            ? 'آپ کا اگلا بل آج کل میں آنا چاہیے۔ آنے پر اسے اسکین کریں۔'
            : 'Your next bill should arrive around now. Scan it when it comes.',
        schedule: { at, allowWhileIdle: true },
      }];
    });
    if (notifications.length > 0) await LocalNotifications.schedule({ notifications });
  } catch (error) {
    console.error('Could not schedule expected-bill reminders:', error);
  }
}

export function useBillConnections(userId: string | undefined, language: Language) {
  const [connections, setConnections] = useState<BillConnection[]>(() =>
    userId ? readCache(userId) : [],
  );

  const applyConnections = useCallback(
    (next: BillConnection[]) => {
      if (!userId) return;
      const sorted = sortConnections(next);
      setConnections(sorted);
      writeCache(userId, sorted);
      void scheduleNativeReminders(sorted, language);
    },
    [language, userId],
  );

  const refresh = useCallback(async () => {
    if (!userId) {
      setConnections([]);
      return;
    }
    setConnections(readCache(userId));
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const { data, error } = await supabase
      .from('bill_connections')
      .select(CONNECTION_COLUMNS)
      .eq('user_id', userId);
    if (error) {
      console.error('Could not load bill connections:', error);
      return;
    }
    applyConnections((data ?? []) as BillConnection[]);
  }, [applyConnections, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Creates the connection, or updates it with a newer bill's issue date and amount.
  const saveFromBill = useCallback(
    async (details: BillDetails): Promise<boolean> => {
      const consumerNumber = normalizeConsumerNumber(details.consumerNumber);
      if (!userId || !consumerNumber) return false;
      const existing = findBillConnection(connections, consumerNumber);
      const isNewer =
        !existing?.last_issue_date ||
        (details.issueDate != null && details.issueDate >= existing.last_issue_date);

      const row = {
        user_id: userId,
        consumer_number: consumerNumber,
        provider: existing?.provider ?? details.provider,
        nickname: details.nickname?.trim() || existing?.nickname || null,
        last_issue_date: isNewer ? details.issueDate ?? existing?.last_issue_date ?? null : existing?.last_issue_date ?? null,
        last_amount: isNewer ? details.amount ?? existing?.last_amount ?? null : existing?.last_amount ?? null,
        // Keep an existing connection's interval: the user may have corrected it.
        billing_interval_months: existing?.billing_interval_months ?? normalizeIntervalMonths(details.intervalMonths),
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('bill_connections')
        .upsert(row, { onConflict: 'user_id,consumer_number' })
        .select(CONNECTION_COLUMNS)
        .single();
      if (error) {
        console.error('Could not save bill connection:', error);
        return false;
      }
      const saved = data as BillConnection;
      applyConnections([...connections.filter((item) => item.id !== saved.id), saved]);
      return true;
    },
    [applyConnections, connections, userId],
  );

  const update = useCallback(
    async (id: string, changes: Pick<Partial<BillConnection>, 'nickname' | 'billing_interval_months'>) => {
      if (!userId) return false;
      const { error } = await supabase
        .from('bill_connections')
        .update({ ...changes, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId);
      if (error) {
        console.error('Could not update bill connection:', error);
        return false;
      }
      applyConnections(connections.map((item) => (item.id === id ? { ...item, ...changes } : item)));
      return true;
    },
    [applyConnections, connections, userId],
  );

  const rename = useCallback(
    (id: string, nickname: string) => update(id, { nickname: nickname.trim() || null }),
    [update],
  );

  const setBillingInterval = useCallback(
    (id: string, months: number) => update(id, { billing_interval_months: normalizeIntervalMonths(months) }),
    [update],
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      if (!userId) return false;
      const { error } = await supabase.from('bill_connections').delete().eq('id', id).eq('user_id', userId);
      if (error) {
        console.error('Could not delete bill connection:', error);
        return false;
      }
      applyConnections(connections.filter((item) => item.id !== id));
      return true;
    },
    [applyConnections, connections, userId],
  );

  return { connections, saveFromBill, rename, setBillingInterval, remove, refresh };
}
