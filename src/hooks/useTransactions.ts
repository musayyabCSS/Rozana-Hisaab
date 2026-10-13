import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Transaction, NewTransaction } from '@/types';
import { deleteReceiptImage } from '@/lib/receiptStorage';

export function useTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (!error && data) {
      setTransactions(data as Transaction[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const addTransaction = useCallback(
    async (txn: NewTransaction): Promise<Transaction | null> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('transactions')
        .insert({ ...txn, user_id: user.id })
        .select()
        .single();

      if (error) {
        console.error('Error adding transaction:', error);
        return null;
      }
      const newTxn = data as Transaction;
      setTransactions((prev) => [newTxn, ...prev]);
      return newTxn;
    },
    [],
  );

  const deleteTransaction = useCallback(async (id: string): Promise<boolean> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting transaction:', error);
      return false;
    }
    try {
      await deleteReceiptImage(id);
    } catch (receiptError) {
      console.error('Error deleting receipt image:', receiptError);
    }
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    return true;
  }, []);

  const updateTransaction = useCallback(
    async (id: string, updates: Partial<NewTransaction>): Promise<boolean> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase
        .from('transactions')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error updating transaction:', error);
        return false;
      }
      setTransactions((prev) =>
        prev.map((t) => (t.id === id ? ({ ...t, ...updates } as Transaction) : t)),
      );
      return true;
    },
    [],
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