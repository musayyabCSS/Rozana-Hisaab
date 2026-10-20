import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { Transaction, NewTransaction } from '@/types';
import { deleteReceiptImage } from '@/lib/receiptStorage';
import {
  clearPendingTransactionOperations,
  deletePendingTransactionOperation,
  getPendingTransactionOperations,
  setPendingTransactionOperation,
  type PendingTransactionOperation,
} from '@/lib/localStore';

const CACHE_KEY = 'rozana_transactions_cache';

function createTransactionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      const id = crypto.randomUUID();
      if (id) return id;
    } catch {
      // Continue with the WebView-compatible fallback.
    }
  }
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
  pending: PendingTransactionOperation[],
): Transaction[] {
  const deleteAll = pending.some((operation) => operation.operation === 'deleteAll');
  const relevantPending = pending.filter((operation) => operation.operation !== 'deleteAll');
  const pendingById = new Map(relevantPending.map((operation) => [operation.id, operation]));
  const merged = (deleteAll ? [] : transactions)
    .filter((transaction) => pendingById.get(transaction.id)?.operation !== 'delete')
    .map((transaction) => {
      const operation = pendingById.get(transaction.id);
      return operation?.operation === 'upsert' ? operation.transaction : transaction;
    });
  const knownIds = new Set(merged.map((transaction) => transaction.id));
  for (const operation of relevantPending) {
    if (operation.operation === 'upsert' && !knownIds.has(operation.id)) {
      merged.unshift(operation.transaction);
    }
  }
  return merged;
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
      const pending = (await getPendingTransactionOperations(activeUserId)).sort((first, second) =>
        first.operation === 'deleteAll' ? -1 : second.operation === 'deleteAll' ? 1 : 0,
      );

      for (const operation of pending) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) break;

        try {
          if (operation.operation === 'deleteAll') {
            const { error } = await supabase
              .from('transactions')
              .delete()
              .eq('user_id', activeUserId);
            if (error) throw error;
            setTransactions(() => {
              saveTransactionCache(activeUserId, []);
              return [];
            });
          } else if (operation.operation === 'delete') {
            const { error } = await supabase
              .from('transactions')
              .delete()
              .eq('id', operation.id)
              .eq('user_id', activeUserId);
            if (error) throw error;
            setTransactions((current) => {
              const next = current.filter((item) => item.id !== operation.id);
              saveTransactionCache(activeUserId, next);
              return next;
            });
          } else {
            const { data, error } = await supabase
              .from('transactions')
              .upsert(toSupabasePayload(operation.transaction, activeUserId), { onConflict: 'id' })
              .select()
              .single();
            if (error) throw error;

            setTransactions((current) => {
              const next = current.map((item) =>
                item.id === operation.id ? { ...data, is_synced: true } : item,
              );
              saveTransactionCache(activeUserId, next);
              return next;
            });
          }

          await deletePendingTransactionOperation(activeUserId, operation.id);
        } catch (error) {
          console.error('Error syncing pending transaction operation:', error);
          if (operation.operation === 'deleteAll' || isNetworkError(error)) break;
        }
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
      const pending = await getPendingTransactionOperations(activeUserId);
      const merged = mergePendingTransactions(remoteTransactions, pending);
      setTransactions(merged);
      saveTransactionCache(activeUserId, merged);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      try {
        const cached = getCachedTransactions(activeUserId);
        const pending = await getPendingTransactionOperations(activeUserId);
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

      const transaction: Transaction & { is_synced: false } = {
        id: txn.id?.trim() || createTransactionId(),
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
        await setPendingTransactionOperation({
          id: transaction.id,
          userId: activeUserId,
          operation: 'upsert',
          transaction,
        });
      } catch (error) {
        console.error('Could not queue transaction on this device:', error);
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          try {
            const { data, error: saveError } = await supabase
              .from('transactions')
              .upsert(toSupabasePayload(transaction, activeUserId), { onConflict: 'id' })
              .select()
              .single();
            if (saveError) throw saveError;
            const savedTransaction = { ...data, is_synced: true };
            setTransactions((current) => {
              const next = [savedTransaction, ...current.filter((item) => item.id !== savedTransaction.id)];
              saveTransactionCache(activeUserId, next);
              return next;
            });
            return savedTransaction;
          } catch (saveError) {
            console.error('Could not save transaction directly to the server:', saveError);
          }
        }
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
        await syncPendingTransactions();
      } catch (error) {
        console.error('Transaction saved locally and sync is pending:', error);
      }
      try {
        const pending = await getPendingTransactionOperations(activeUserId);
        if (pending.some((operation) => operation.id === transaction.id)) {
          setOfflineSavedNotice(true);
          return transaction;
        }
      } catch (error) {
        console.error('Could not verify transaction sync status:', error);
        setOfflineSavedNotice(true);
        return transaction;
      }
      return { ...transaction, is_synced: true };
    },
    [activeUserId, syncPendingTransactions],
  );

  const deleteTransaction = useCallback(
    async (id: string): Promise<boolean> => {
      if (!activeUserId) return false;

      try {
        await setPendingTransactionOperation({
          id,
          userId: activeUserId,
          operation: 'delete',
        });
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

        if (typeof navigator === 'undefined' || navigator.onLine) {
          await syncPendingTransactions();
        } else {
          setOfflineSavedNotice(true);
        }
        return true;
      } catch (error) {
        console.error('Error deleting transaction:', error);
        alert('Failed to delete transaction.');
        return false;
      }
    },
    [activeUserId, syncPendingTransactions],
  );

  const deleteAllTransactions = useCallback(async (): Promise<void> => {
    if (!activeUserId) throw new Error('Sign in before deleting account transactions.');
    await clearPendingTransactionOperations(activeUserId);
    await setPendingTransactionOperation({
      id: '__delete_all__',
      userId: activeUserId,
      operation: 'deleteAll',
    });
    setTransactions([]);
    saveTransactionCache(activeUserId, []);
    if (typeof navigator === 'undefined' || navigator.onLine) {
      await syncPendingTransactions();
    } else {
      setOfflineSavedNotice(true);
    }
  }, [activeUserId, syncPendingTransactions]);

  const updateTransaction = useCallback(
    async (id: string, updates: Partial<NewTransaction>): Promise<boolean> => {
      if (!activeUserId) return false;

      try {
        const existing = transactions.find((transaction) => transaction.id === id);
        if (!existing) return false;
        const updatedTransaction: Transaction & { is_synced: false } = {
          ...existing,
          ...updates,
          is_synced: false,
        };
        await setPendingTransactionOperation({
          id,
          userId: activeUserId,
          operation: 'upsert',
          transaction: updatedTransaction,
        });
        setTransactions((current) => {
          const next = current.map((transaction) =>
            transaction.id === id ? updatedTransaction : transaction,
          );
          saveTransactionCache(activeUserId, next);
          return next;
        });
        if (typeof navigator === 'undefined' || navigator.onLine) {
          await syncPendingTransactions();
        } else {
          setOfflineSavedNotice(true);
        }
        return true;
      } catch (error) {
        console.error('Error updating transaction:', error);
        return false;
      }
    },
    [activeUserId, syncPendingTransactions, transactions],
  );

  return {
    transactions,
    loading,
    offlineSavedNotice,
    addTransaction,
    deleteTransaction,
    updateTransaction,
    deleteAllTransactions,
    refetch: fetchTransactions,
  };
}
