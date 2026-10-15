import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Transaction, NewTransaction } from '@/types';
import { deleteReceiptImage } from '@/lib/receiptStorage';

const CACHE_KEY = 'rozana_transactions_cache';

export function useTransactions(activeUserId?: string) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. Fetch directly from Supabase (with offline read fallback)
  const fetchTransactions = useCallback(async () => {
    if (!activeUserId) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', activeUserId)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      setTransactions(data || []);
      localStorage.setItem(`${CACHE_KEY}_${activeUserId}`, JSON.stringify(data || []));
    } catch (error) {
      console.error('Error fetching transactions:', error);
      const cached = localStorage.getItem(`${CACHE_KEY}_${activeUserId}`);
      if (cached) setTransactions(JSON.parse(cached));
    } finally {
      setLoading(false);
    }
  }, [activeUserId]);

  useEffect(() => {
    void fetchTransactions();
  }, [fetchTransactions]);

  // 2. Direct Cloud Insert (Bypasses buggy offline queue)
  const addTransaction = useCallback(
    async (txn: NewTransaction): Promise<Transaction | null> => {
      if (!activeUserId) return null;

      const payload = {
        user_id: activeUserId,
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
        ...(txn.has_receipt !== undefined ? { has_receipt: txn.has_receipt } : {}),
        ...(txn.is_paid !== undefined ? { is_paid: txn.is_paid } : {}),
      };

      try {
        const { data, error } = await supabase
          .from('transactions')
          .insert(payload)
          .select()
          .single();

        if (error) throw error;

        // Update UI and Cache instantly
        setTransactions((prev) => [data, ...prev]);
        const updatedCache = [data, ...transactions];
        localStorage.setItem(`${CACHE_KEY}_${activeUserId}`, JSON.stringify(updatedCache));
        
        return data; // Returns the REAL Supabase UUID
      // With this:
} catch (error) {
  console.error('Error adding transaction to Supabase:', error);
  const message = error instanceof Error ? error.message : 'Network Error';
  alert(`Failed to save transaction: ${message}`);
  return null;
}
    },
    [activeUserId, transactions]
  );

  // 3. Direct Cloud Delete
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
          const next = prev.filter((t) => t.id !== id);
          localStorage.setItem(`${CACHE_KEY}_${activeUserId}`, JSON.stringify(next));
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
    [activeUserId]
  );

  // 4. Direct Cloud Update
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
          const next = prev.map((t) => (t.id === id ? { ...t, ...updates } : t));
          localStorage.setItem(`${CACHE_KEY}_${activeUserId}`, JSON.stringify(next));
          return next;
        });
        return true;
      } catch (error) {
        console.error('Error updating transaction:', error);
        alert('Failed to update transaction.');
        return false;
      }
    },
    [activeUserId]
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