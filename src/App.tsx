import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { Auth } from '@/components/Auth';
import { Header } from '@/components/Header';
import { BudgetCard } from '@/components/BudgetCard';
import { TransactionFeed } from '@/components/TransactionFeed';
import { BottomBar } from '@/components/BottomBar';
import { OnboardingModal } from '@/components/OnboardingModal';
import { WelcomeBackScreen } from '@/components/WelcomeBackScreen';
import { VoiceModal } from '@/components/modals/VoiceModal';
import { ScanModal } from '@/components/modals/ScanModal';
import { ManualEntryModal } from '@/components/modals/ManualEntryModal';
import { BankStatementModal } from '@/components/modals/BankStatementModal';
import { ExportModal } from '@/components/modals/ExportModal';
import { EditTransactionModal } from '@/components/modals/EditTransactionModal';
import { SetNewPasswordModal } from '@/components/modals/SetNewPasswordModal';
import { useLanguage } from '@/hooks/useLanguage';
import { useTransactions } from '@/hooks/useTransactions';
import { useProfile } from '@/hooks/useProfile';
import { getMonthStats } from '@/lib/format';
import type { NewTransaction, Transaction } from '@/types';

type ModalType = 'voice' | 'scan' | 'add' | 'bank' | 'export' | null;

function App() {
  // --- SUPABASE AUTH STATE ---
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [passwordUpdatedNotice, setPasswordUpdatedNotice] = useState(false);

  // --- EXISTING APP STATE ---
  const { language, toggleLanguage, dir } = useLanguage();
  const { transactions, addTransaction, deleteTransaction, updateTransaction } = useTransactions();
  const { profile, onboarded, saveProfile, updateProfile } = useProfile();
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [feedFilter, setFeedFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [showWelcome, setShowWelcome] = useState(() => onboarded);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  const now = new Date();
  const stats = getMonthStats(transactions, now.getFullYear(), now.getMonth());

  // --- SUPABASE AUTH LISTENER ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoadingSession(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!passwordUpdatedNotice) return;
    const timeoutId = window.setTimeout(() => setPasswordUpdatedNotice(false), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [passwordUpdatedNotice]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // --- EXISTING CALLBACKS ---
  const handleOnboardingComplete = useCallback(
    (p: { name: string; avatar: string | null }) => {
      saveProfile(p);
    },
    [saveProfile],
  );

  const handleSaveTransaction = useCallback(
    async (txn: NewTransaction) => {
      await addTransaction(txn);
    },
    [addTransaction],
  );

  const handleSaveScannedTransaction = useCallback(
    async (txn: NewTransaction) => addTransaction(txn),
    [addTransaction],
  );

  const handleBankImport = useCallback(
    async (txns: NewTransaction[]) => {
      for (const txn of txns) {
        await addTransaction(txn);
      }
    },
    [addTransaction],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteTransaction(id);
    },
    [deleteTransaction],
  );

  const handleEdit = useCallback((transaction: Transaction) => {
    setEditingTransaction(transaction);
  }, []);

  const handleUpdate = useCallback(
    async (id: string, updates: Partial<NewTransaction>) => updateTransaction(id, updates),
    [updateTransaction],
  );

  // --- CONDITIONAL SCREENS ---
  
  // 1. Loading Session Screen
  if (loadingSession) {
    return (
      <div className="min-h-screen bg-slate-950 text-emerald-400 flex items-center justify-center animate-pulse">
        Loading Rozana Hisaab...
      </div>
    );
  }

  if (passwordRecovery) {
    return (
      <div className="min-h-screen bg-slate-950">
        <SetNewPasswordModal
          open
          onSuccess={() => {
            setPasswordRecovery(false);
            setPasswordUpdatedNotice(true);
          }}
        />
      </div>
    );
  }

  // 2. Auth Login/Signup Screen
  if (!session) {
    return <Auth />;
  }

  // 3. Profile Onboarding
  if (!onboarded || !profile) {
    return (
      <OnboardingModal
        language={language}
        dir={dir}
        onToggleLanguage={toggleLanguage}
        onComplete={handleOnboardingComplete}
      />
    );
  }

  // 4. Welcome Back Splash
  if (showWelcome) {
    return (
      <WelcomeBackScreen
        profile={profile}
        language={language}
        dir={dir}
        onToggleLanguage={toggleLanguage}
        onContinue={() => setShowWelcome(false)}
      />
    );
  }

  // --- MAIN DASHBOARD ---
  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100 animate-[fadeIn_0.5s_ease-out]"
      dir={dir}
    >
      {passwordUpdatedNotice && (
        <div
          role="status"
          className="fixed right-4 top-4 z-50 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 shadow-lg"
        >
          Password updated successfully.
        </div>
      )}
      {/* Auth Status Banner added for user switching */}
      <div className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 pb-2 pt-[max(env(safe-area-inset-top,0px),1rem)] text-xs">
        <span className="min-w-0 flex-1 truncate text-slate-400">
          {language === 'en' ? 'Logged in as:' : 'لاگ ان:'}{' '}
          <strong className="inline-block max-w-[55vw] truncate align-bottom text-slate-200">
            {session.user.email}
          </strong>
        </span>
        <button
          onClick={handleLogout}
          className="relative z-50 min-h-9 shrink-0 rounded px-3 py-1.5 text-red-400 transition hover:bg-red-500/10 hover:text-red-300"
        >
          {language === 'en' ? 'Log Out' : 'لاگ آؤٹ'}
        </button>
      </div>

      <Header
        language={language}
        onToggleLanguage={toggleLanguage}
        dir={dir}
        profile={profile}
        onAvatarChange={(avatar) => updateProfile({ avatar })}
        onImportBank={() => setActiveModal('bank')}
      />

      <main className="max-w-md mx-auto px-4 py-5 pb-32 space-y-4">
        <BudgetCard
          availableFunds={stats.availableFunds}
          totalIncome={stats.totalIncome}
          totalExpenses={stats.totalExpenses}
          language={language}
          dir={dir}
        />

        <TransactionFeed
          transactions={transactions}
          language={language}
          dir={dir}
          filter={feedFilter}
          onFilterChange={setFeedFilter}
          onDelete={handleDelete}
          onEdit={handleEdit}
          onUpdate={handleUpdate}
        />
      </main>

      <BottomBar
        language={language}
        dir={dir}
        onScan={() => setActiveModal('scan')}
        onVoice={() => setActiveModal('voice')}
        onAdd={() => setActiveModal('add')}
        onExport={() => setActiveModal('export')}
      />

      {/* Modals */}
      <VoiceModal
        open={activeModal === 'voice'}
        onClose={() => setActiveModal(null)}
        language={language}
        dir={dir}
        onSave={handleSaveTransaction}
      />

      <ScanModal
        open={activeModal === 'scan'}
        onClose={() => setActiveModal(null)}
        language={language}
        dir={dir}
        onSave={handleSaveScannedTransaction}
      />

      <ManualEntryModal
        open={activeModal === 'add'}
        onClose={() => setActiveModal(null)}
        language={language}
        dir={dir}
        onSave={handleSaveTransaction}
      />

      <BankStatementModal
        open={activeModal === 'bank'}
        onClose={() => setActiveModal(null)}
        language={language}
        dir={dir}
        onImport={handleBankImport}
      />

      <ExportModal
        open={activeModal === 'export'}
        onClose={() => setActiveModal(null)}
        language={language}
        dir={dir}
        transactions={transactions}
      />

      <EditTransactionModal
        transaction={editingTransaction}
        onClose={() => setEditingTransaction(null)}
        onSave={handleUpdate}
        language={language}
        dir={dir}
      />
    </div>
  );
}

export default App;