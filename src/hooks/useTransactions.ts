import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { Transaction, NewTransaction } from '@/types';
import { deleteReceiptImage } from '@/lib/receiptStorage';

const CACHE_KEY = 'rozana_transactions_cache';
const PENDING_KEY = 'rozana_pending_transactions';

type PendingTransaction = Transaction & { is_synced: false };

function getPendingKey(userId: string): string {
  return `${PENDING_KEY}_${userId}`;
}

function readPendingTransactions(userId: string): PendingTransaction[] {
  const stored = localStorage.getItem(getPendingKey(userId));
  if (!stored) return [];

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid pending transaction queue for user ${userId}`);
  }
  return parsed as PendingTransaction[];
}

function writePendingTransactions(userId: string, transactions: PendingTransaction[]): void {
  localStorage.setItem(getPendingKey(userId), JSON.stringify(transactions));
}

function createTransactionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

function isNetworkError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : String(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes('failed to fetch') ||
    normalized.includes('err_internet_disconnected') ||
    normalized.includes('network error')
  );
}

function toSupabasePayload(transaction: Transaction, userId: string) {
  return {
    id: transaction.id,
    user_id: userId,
    type: transaction.type,
    amount: transaction.amount,
    category: transaction.category,
    title: transaction.title,
    payment_method: transaction.payment_method,
    provider: transaction.provider,
    due_date: transaction.due_date,
    units_consumed: transaction.units_consumed,
    source: transaction.source,
    transaction_date: transaction.transaction_date,
    ...(transaction.has_receipt !== undefined
      ? { has_receipt: transaction.has_receipt }
      : {}),
    ...(transaction.is_paid !== undefined ? { is_paid: transaction.is_paid } : {}),
  };
}

function saveTransactionCache(userId: string, transactions: Transaction[]): void {
  try {
    localStorage.setItem(`${CACHE_KEY}_${userId}`, JSON.stringify(transactions));
  } catch (error) {
    console.error('Could not cache transactions on this device:', error);
  }
}

function getCachedTransactions(userId: string): Transaction[] {
  const cached = localStorage.getItem(`${CACHE_KEY}_${userId}`);
  if (!cached) return [];
  const parsed: unknown = JSON.parse(cached);
  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid transaction cache for user ${userId}`);
  }
  return parsed as Transaction[];
}

function mergePendingTransactions(
  transactions: Transaction[],
  pending: PendingTransaction[],
): Transaction[] {
  const transactionIds = new Set(transactions.map((transaction) => transaction.id));
  const missingPending = pending.filter((transaction) => !transactionIds.has(transaction.id));
  return [...missingPending, ...transactions];
}

export function useTransactions(activeUserId?: string) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [offlineSavedNotice, setOfflineSavedNotice] = useState(false);
  const syncPromiseRef = useRef<Promise<void> | null>(null);

  const syncPendingTransactions = useCallback(async () => {
    if (!activeUserId || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    if (syncPromiseRef.current) return syncPromiseRef.current;

    const syncPromise = (async () => {
      const pending = readPendingTransactions(activeUserId);
      const syncedIds: string[] = [];

      for (const transaction of pending) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) break;

        try {
          const { data, error } = await supabase
            .from('transactions')
            .upsert(toSupabasePayload(transaction, activeUserId), { onConflict: 'id' })
            .select()
            .single();
          if (error) throw error;

          syncedIds.push(transaction.id);
          setTransactions((current) => {
            const next = current.map((item) =>
              item.id === transaction.id ? { ...data, is_synced: true } : item,
            );
            saveTransactionCache(activeUserId, next);
            return next;
          });
        } catch (error) {
          console.error('Error syncing pending transaction:', error);
          if (isNetworkError(error)) break;
        }
      }

      if (syncedIds.length > 0) {
        const latestPending = readPendingTransactions(activeUserId);
        writePendingTransactions(
          activeUserId,
          latestPending.filter((transaction) => !syncedIds.includes(transaction.id)),
        );
      }
    })();

    syncPromiseRef.current = syncPromise;
    try {
      await syncPromise;
    } finally {
      syncPromiseRef.current = null;
    }
  }, [activeUserId]);

  const fetchTransactions = useCallback(async () => {
    if (!activeUserId) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      if (typeof navigator === 'undefined' || navigator.onLine) {
        try {
          await syncPendingTransactions();
        } catch (error) {
          console.error('Could not sync pending transactions before refresh:', error);
        }
      }

      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', activeUserId)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      const remoteTransactions = (data || []).map((transaction) => ({
        ...transaction,
        is_synced: true,
      }));
      const pending = readPendingTransactions(activeUserId);
      const merged = mergePendingTransactions(remoteTransactions, pending);
      setTransactions(merged);
      saveTransactionCache(activeUserId, merged);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      try {
        const cached = getCachedTransactions(activeUserId);
        const pending = readPendingTransactions(activeUserId);
        setTransactions(mergePendingTransactions(cached, pending));
      } catch (cacheError) {
        console.error('Could not restore cached transactions:', cacheError);
        setTransactions([]);
      }
    } finally {
      setLoading(false);
    }
  }, [activeUserId, syncPendingTransactions]);

  useEffect(() => {
    void fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    const handleOnline = () => {
      void syncPendingTransactions().catch((error) => {
        console.error('Background transaction sync failed:', error);
      });
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncPendingTransactions]);

  useEffect(() => {
    if (!offlineSavedNotice) return;
    const timeoutId = window.setTimeout(() => setOfflineSavedNotice(false), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [offlineSavedNotice]);

  const addTransaction = useCallback(
    async (txn: NewTransaction): Promise<Transaction | null> => {
      if (!activeUserId) return null;

      const transaction: PendingTransaction = {
        id: txn.id ?? createTransactionId(),
        type: txn.type,
        amount: txn.amount,
        category: txn.category,
        title: txn.title,
        payment_method: txn.payment_method ?? null,
        provider: txn.provider ?? null,
        due_date: txn.due_date ?? null,
        units_consumed: txn.units_consumed ?? null,
        source: txn.source ?? 'manual',
        transaction_date: txn.transaction_date ?? new Date().toISOString().slice(0, 10),
        created_at: txn.created_at ?? new Date().toISOString(),
        ...(txn.has_receipt !== undefined ? { has_receipt: txn.has_receipt } : {}),
        ...(txn.is_paid !== undefined ? { is_paid: txn.is_paid } : {}),
        is_synced: false,
      };

      try {
        const pending = readPendingTransactions(activeUserId);
        writePendingTransactions(
          activeUserId,
          [...pending.filter((item) => item.id !== transaction.id), transaction],
        );
      } catch (error) {
        console.error('Could not queue transaction on this device:', error);
        alert('Could not save this transaction on your device. Please try again.');
        return null;
      }

      setTransactions((current) => {
        const next = [transaction, ...current.filter((item) => item.id !== transaction.id)];
        saveTransactionCache(activeUserId, next);
        return next;
      });

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setOfflineSavedNotice(true);
        return transaction;
      }

      try {
        const { data, error } = await supabase
          .from('transactions')
          .upsert(toSupabasePayload(transaction, activeUserId), { onConflict: 'id' })
          .select()
          .single();
        if (error) throw error;

        const currentPending = readPendingTransactions(activeUserId);
        writePendingTransactions(
          activeUserId,
          currentPending.filter((item) => item.id !== transaction.id),
        );
        const saved = { ...data, is_synced: true };
        setTransactions((current) => {
          const next = current.map((item) => (item.id === transaction.id ? saved : item));
          saveTransactionCache(activeUserId, next);
          return next;
        });
        return saved;
      } catch (error) {
        if (isNetworkError(error) || (typeof navigator !== 'undefined' && !navigator.onLine)) {
          console.warn('Transaction saved locally and will sync when online:', error);
          setOfflineSavedNotice(true);
          return transaction;
        }

        console.error('Error adding transaction to Supabase:', error);
        try {
          const pending = readPendingTransactions(activeUserId);
          writePendingTransactions(
            activeUserId,
            pending.filter((item) => item.id !== transaction.id),
          );
        } catch (queueError) {
          console.error('Could not remove failed transaction from local queue:', queueError);
        }
        setTransactions((current) => {
          const next = current.filter((item) => item.id !== transaction.id);
          saveTransactionCache(activeUserId, next);
          return next;
        });
        const message = error instanceof Error ? error.message : 'Unable to save transaction';
        alert(`Failed to save transaction: ${message}`);
        return null;
      }
    },
    [activeUserId],
  );

  const deleteTransaction = useCallback(
    async (id: string): Promise<boolean> => {
      if (!activeUserId) return false;

      try {
        const { error } = await supabase
          .from('transactions')
          .delete()
          .eq('id', id)
          .eq('user_id', activeUserId);

        if (error) throw error;

        setTransactions((prev) => {
          const next = prev.filter((transaction) => transaction.id !== id);
          saveTransactionCache(activeUserId, next);
          return next;
        });

        try {
          await deleteReceiptImage(id);
        } catch (receiptError) {
          console.error('Error deleting receipt image:', receiptError);
        }

        return true;
      } catch (error) {
        console.error('Error deleting transaction:', error);
        alert('Failed to delete transaction.');
        return false;
      }
    },
    [activeUserId],
  );

  const updateTransaction = useCallback(
    async (id: string, updates: Partial<NewTransaction>): Promise<boolean> => {
      if (!activeUserId) return false;

      try {
        const { error } = await supabase
          .from('transactions')
          .update(updates)
          .eq('id', id)
          .eq('user_id', activeUserId);

        if (error) throw error;

        setTransactions((prev) => {
          const next = prev.map((transaction) =>
            transaction.id === id ? { ...transaction, ...updates } : transaction,
          );
          saveTransactionCache(activeUserId, next);
          return next;
        });
        return true;
      } catch (error) {
        console.error('Error updating transaction:', error);
        alert('Failed to update transaction.');
        return false;
      }
    },
    [activeUserId],
  );

  return {
    transactions,
    loading,
    offlineSavedNotice,
    addTransaction,
    deleteTransaction,
    updateTransaction,
    refetch: fetchTransactions,
  };
}
