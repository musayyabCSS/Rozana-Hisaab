import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { Transaction, NewTransaction } from '@/types';
import { deleteReceiptImage, moveReceiptImage } from '@/lib/receiptStorage';

type LocalTransaction = Transaction & { synced: boolean };

function cacheKey(userId: string) {
  return `rozana_transactions_${userId}`;
}

function queueKey(userId: string) {
  return `rozana_transaction_queue_${userId}`;
}

function readLocalTransactions(key: string): LocalTransaction[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is LocalTransaction =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.id === 'string' &&
        typeof item.type === 'string' &&
        typeof item.amount === 'number' &&
        typeof item.transaction_date === 'string' &&
        typeof item.created_at === 'string',
    );
  } catch (error) {
    console.error('Error reading cached transactions:', error);
    return [];
  }
}

function writeLocalTransactions(userId: string, transactions: LocalTransaction[]) {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify(transactions));
  } catch (error) {
    console.error('Error caching transactions:', error);
  }
}

function readPendingTransactions(userId: string): LocalTransaction[] {
  return readLocalTransactions(queueKey(userId));
}

function writePendingTransactions(userId: string, transactions: LocalTransaction[]) {
  try {
    localStorage.setItem(queueKey(userId), JSON.stringify(transactions));
  } catch (error) {
    console.error('Error saving pending transactions:', error);
  }
}

function combineTransactions(
  cached: LocalTransaction[],
  pending: LocalTransaction[],
): LocalTransaction[] {
  const byId = new Map(cached.map((transaction) => [transaction.id, transaction]));
  for (const transaction of pending) byId.set(transaction.id, transaction);
  return [...byId.values()].sort(
    (first, second) =>
      second.transaction_date.localeCompare(first.transaction_date) ||
      second.created_at.localeCompare(first.created_at),
  );
}

export function useTransactions(activeUserId?: string) {
  const [transactions, setTransactions] = useState<LocalTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const syncing = useRef(false);

  const fetchTransactions = useCallback(async () => {
    if (!activeUserId) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    const cached = readLocalTransactions(cacheKey(activeUserId));
    const pending = readPendingTransactions(activeUserId);
    if (cached.length) setTransactions(cached);
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setTransactions(combineTransactions(cached, pending));
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', activeUserId)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      const confirmed = (data ?? []).map(
        (transaction) => ({ ...transaction, synced: true }) as LocalTransaction,
      );
      const confirmedIds = new Set(confirmed.map((transaction) => transaction.id));
      const visibleTransactions = [
        ...pending.filter((transaction) => !confirmedIds.has(transaction.id)),
        ...confirmed,
      ];
      setTransactions(visibleTransactions);
      writeLocalTransactions(activeUserId, visibleTransactions);
    } catch (error) {
      console.error('Error loading transactions:', error);
      setTransactions(combineTransactions(cached, pending));
    } finally {
      setLoading(false);
    }
  }, [activeUserId]);

  const syncPendingTransactions = useCallback(async () => {
    if (
      !activeUserId ||
      syncing.current ||
      (typeof navigator !== 'undefined' && !navigator.onLine)
    ) {
      return;
    }

    syncing.current = true;
    try {
      while (true) {
        const transaction = readPendingTransactions(activeUserId)[0];
        if (!transaction) break;

        const id = transaction.id;
        const payload: NewTransaction = {
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
          ...(transaction.has_receipt === undefined
            ? {}
            : { has_receipt: transaction.has_receipt }),
          ...(transaction.is_paid === undefined ? {} : { is_paid: transaction.is_paid }),
        };
        try {
          const { data, error } = await supabase
            .from('transactions')
            .insert({ ...payload, user_id: activeUserId })
            .select()
            .single();
          if (error) throw error;

          const confirmed = { ...data, synced: true } as LocalTransaction;
          const current = readLocalTransactions(cacheKey(activeUserId));
          const next = current.map((item) => (item.id === id ? confirmed : item));
          writeLocalTransactions(activeUserId, next);
          setTransactions(next);

          writePendingTransactions(
            activeUserId,
            readPendingTransactions(activeUserId).filter((item) => item.id !== id),
          );
          try {
            await moveReceiptImage(id, confirmed.id);
          } catch (receiptError) {
            console.error('Error moving synced transaction receipt:', receiptError);
          }
        } catch (error) {
          console.error('Error syncing pending transaction:', error);
          break;
        }
      }
    } finally {
      syncing.current = false;
    }
  }, [activeUserId]);

  useEffect(() => {
    void fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    const handleOnline = () => {
      void syncPendingTransactions().then(fetchTransactions);
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [fetchTransactions, syncPendingTransactions]);

  const addTransaction = useCallback(
    async (txn: NewTransaction): Promise<Transaction | null> => {
      if (!activeUserId) {
        console.error('Cannot add transaction without an active user session.');
        return null;
      }

      const now = new Date().toISOString();
      const optimistic: LocalTransaction = {
        id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: txn.type,
        amount: txn.amount,
        category: txn.category,
        title: txn.title,
        payment_method: txn.payment_method ?? null,
        provider: txn.provider ?? null,
        due_date: txn.due_date ?? null,
        units_consumed: txn.units_consumed ?? null,
        source: txn.source ?? 'manual',
        transaction_date: txn.transaction_date ?? now.slice(0, 10),
        created_at: now,
        ...(txn.has_receipt === undefined ? {} : { has_receipt: txn.has_receipt }),
        ...(txn.is_paid === undefined ? {} : { is_paid: txn.is_paid }),
        synced: false,
      };

      setTransactions((previous) => [optimistic, ...previous]);
      writeLocalTransactions(activeUserId, [
        optimistic,
        ...readLocalTransactions(cacheKey(activeUserId)).filter((item) => item.id !== optimistic.id),
      ]);
      writePendingTransactions(activeUserId, [
        ...readPendingTransactions(activeUserId),
        optimistic,
      ]);

      if (typeof navigator === 'undefined' || navigator.onLine) {
        void syncPendingTransactions();
      }
      return optimistic;
    },
    [activeUserId, syncPendingTransactions],
  );

  const deleteTransaction = useCallback(async (id: string): Promise<boolean> => {
    if (!activeUserId) return false;

    if (id.startsWith('temp-')) {
      const next = readLocalTransactions(cacheKey(activeUserId)).filter((item) => item.id !== id);
      writeLocalTransactions(activeUserId, next);
      writePendingTransactions(
        activeUserId,
        readPendingTransactions(activeUserId).filter((item) => item.id !== id),
      );
      setTransactions(next);
      await deleteReceiptImage(id);
      return true;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', activeUserId);

    if (error) {
      console.error('Error deleting transaction:', error);
      return false;
    }
    try {
      await deleteReceiptImage(id);
    } catch (receiptError) {
      console.error('Error deleting receipt image:', receiptError);
    }
    const next = readLocalTransactions(cacheKey(activeUserId)).filter((transaction) => transaction.id !== id);
    writeLocalTransactions(activeUserId, next);
    setTransactions(next);
    return true;
  }, [activeUserId]);

  const updateTransaction = useCallback(
    async (id: string, updates: Partial<NewTransaction>): Promise<boolean> => {
      if (!activeUserId || (typeof navigator !== 'undefined' && !navigator.onLine)) return false;

      const { error } = await supabase
        .from('transactions')
        .update(updates)
        .eq('id', id)
        .eq('user_id', activeUserId);

      if (error) {
        console.error('Error updating transaction:', error);
        return false;
      }
      setTransactions((previous) => {
        const next = previous.map((transaction) =>
          transaction.id === id ? { ...transaction, ...updates } : transaction,
        );
        writeLocalTransactions(activeUserId, next);
        return next;
      });
      return true;
    },
    [activeUserId],
  );

  return {
    transactions,
    loading,
    addTransaction,
    deleteTransaction,
    updateTransaction,
    refetch: fetchTransactions,
  };
}
