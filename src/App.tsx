import { useState, useCallback, useEffect, useRef, type TouchEvent } from 'react';
import { App as CapApp } from '@capacitor/app';
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

const REFRESH_THRESHOLD = 65;
const MAX_PULL_DISTANCE = 80;

function App() {
  // --- SUPABASE AUTH STATE ---
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [passwordUpdatedNotice, setPasswordUpdatedNotice] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);

  // --- EXISTING APP STATE ---
  const { language, toggleLanguage, dir } = useLanguage();
  const {
    transactions,
    addTransaction,
    deleteTransaction,
    updateTransaction,
    refetch: refetchTransactions,
    offlineSavedNotice,
  } = useTransactions(session?.user.id);
  const {
    profile,
    onboarded,
    loading: loadingProfile,
    saveProfile,
    uploadAvatar,
    syncProfile,
  } = useProfile(session?.user.id);
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [feedFilter, setFeedFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [showWelcome, setShowWelcome] = useState(
    () => onboarded && (typeof navigator === 'undefined' || navigator.onLine),
  );
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const dashboardRef = useRef<HTMLElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const pullDistanceRef = useRef(0);
  const thresholdReachedRef = useRef(false);

  const now = new Date();
  const stats = getMonthStats(transactions, now.getFullYear(), now.getMonth());

  const isAtTop = (target: EventTarget | null) => {
    if (window.scrollY !== 0 || (document.scrollingElement?.scrollTop ?? 0) !== 0) {
      return false;
    }

    const main = dashboardRef.current;
    let element = target instanceof Element ? target : null;
    while (element && main?.contains(element)) {
      const style = window.getComputedStyle(element);
      const isScrollable =
        /(auto|scroll|overlay)/.test(`${style.overflowY} ${style.overflow}`) &&
        element.scrollHeight > element.clientHeight;
      if (isScrollable && element.scrollTop !== 0) return false;
      if (element === main) break;
      element = element.parentElement;
    }
    return true;
  };

  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    if (
      event.touches.length !== 1 ||
      isRefreshing ||
      activeModal !== null ||
      editingTransaction !== null ||
      !isAtTop(event.target) ||
      (event.target instanceof Element &&
        event.target.closest(
          'button, a, input, textarea, select, summary, [role="button"], [role="dialog"], [contenteditable="true"]',
        ))
    ) {
      touchStartRef.current = null;
      thresholdReachedRef.current = false;
      return;
    }

    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    thresholdReachedRef.current = false;
  };

  const handleTouchMove = (event: TouchEvent<HTMLElement>) => {
    const start = touchStartRef.current;
    if (!start) return;
    if (event.touches.length !== 1 || !isAtTop(event.target)) {
      touchStartRef.current = null;
      pullDistanceRef.current = 0;
      setPullDistance(0);
      return;
    }

    const touch = event.touches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 8) {
      touchStartRef.current = null;
      pullDistanceRef.current = 0;
      setPullDistance(0);
      return;
    }
    if (deltaY <= 0) {
      touchStartRef.current = null;
      pullDistanceRef.current = 0;
      setPullDistance(0);
      return;
    }

    const distance = Math.min(MAX_PULL_DISTANCE, MAX_PULL_DISTANCE * (1 - Math.exp(-deltaY / 45)));
    if (!thresholdReachedRef.current && distance >= REFRESH_THRESHOLD) {
      thresholdReachedRef.current = true;
      navigator.vibrate?.(10);
    }
    pullDistanceRef.current = distance;
    setPullDistance(distance);
  };

  const handleTouchEnd = () => {
    touchStartRef.current = null;
    if (pullDistanceRef.current < REFRESH_THRESHOLD || isRefreshing) {
      pullDistanceRef.current = 0;
      setPullDistance(0);
      return;
    }

    pullDistanceRef.current = REFRESH_THRESHOLD;
    setPullDistance(REFRESH_THRESHOLD);
    setIsRefreshing(true);
    void (async () => {
      try {
        await Promise.all([refetchTransactions(), syncProfile()]);
      } catch (error) {
        console.error('Error refreshing dashboard:', error);
      } finally {
        pullDistanceRef.current = 0;
        setPullDistance(0);
        setIsRefreshing(false);
      }
    })();
  };

  const handleTouchCancel = () => {
    touchStartRef.current = null;
    pullDistanceRef.current = 0;
    setPullDistance(0);
  };

  useEffect(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine && onboarded && profile) {
      setShowWelcome(false);
    }
  }, [onboarded, profile]);

  // --- SUPABASE AUTH LISTENER ---
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const oauthErrorCode =
      searchParams.get('error') ??
      hashParams.get('error') ??
      (window.location.search.includes('bad_oauth_state') ||
      window.location.hash.includes('bad_oauth_state')
        ? 'bad_oauth_state'
        : null);

    if (oauthErrorCode) {
      const errorMessage =
        searchParams.get('error_description') ??
        hashParams.get('error_description') ??
        (oauthErrorCode === 'bad_oauth_state'
          ? 'Google sign-in could not be verified. Please try again.'
          : oauthErrorCode);
      setOauthError(errorMessage.replace(/\+/g, ' '));
      setSession(null);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!oauthErrorCode) setSession(session);
      setLoadingSession(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!oauthErrorCode || event === 'SIGNED_IN') {
        setSession(session);
        if (event === 'SIGNED_IN') setOauthError(null);
      }
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let isMounted = true;
    let removeListener: (() => Promise<void>) | undefined;

    const handleOAuthCallback = async (url: string) => {
      if (!url.includes('google-auth')) return;

      try {
        const callbackUrl = new URL(url);
        const hashParams = new URLSearchParams(callbackUrl.hash.slice(1));
        const code = callbackUrl.searchParams.get('code') ?? hashParams.get('code');

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          return;
        }

        const accessToken =
          hashParams.get('access_token') ?? callbackUrl.searchParams.get('access_token');
        const refreshToken =
          hashParams.get('refresh_token') ?? callbackUrl.searchParams.get('refresh_token');
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        }
      } catch (error) {
        console.error('Could not restore session from Google OAuth deep link:', error);
      }
    };

    void CapApp.addListener('appUrlOpen', ({ url }) => handleOAuthCallback(url)).then((listener) => {
      if (isMounted) {
        removeListener = () => listener.remove();
      } else {
        void listener.remove();
      }
    }).catch((error: unknown) => {
      console.error('Could not register Google OAuth deep link listener:', error);
    });

    void CapApp.getLaunchUrl().then((launch) => {
      if (launch?.url) return handleOAuthCallback(launch.url);
    }).catch((error: unknown) => {
      console.error('Could not read initial Google OAuth deep link:', error);
    });

    return () => {
      isMounted = false;
      if (removeListener) void removeListener();
      void CapApp.removeAllListeners();
    };
  }, []);

  useEffect(() => {
    if (!passwordUpdatedNotice) return;
    const timeoutId = window.setTimeout(() => setPasswordUpdatedNotice(false), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [passwordUpdatedNotice]);

  const handleLogout = async () => {
    localStorage.removeItem('rozana_cached_profile');
    if (session?.user.id) {
      localStorage.removeItem(`rozana_profile_${session.user.id}`);
    }
    await supabase.auth.signOut();
  };

  // --- EXISTING CALLBACKS ---
  const handleOnboardingComplete = useCallback(
    async (p: { name: string; avatarFile: File | null }) => {
      const avatar = p.avatarFile ? await uploadAvatar(p.avatarFile) : null;
      await saveProfile({ name: p.name, avatar });
    },
    [saveProfile, uploadAvatar],
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
      <div className="min-h-[100dvh] bg-slate-950 pb-[env(safe-area-inset-bottom,0px)] text-emerald-400 flex items-center justify-center animate-pulse">
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

  if (oauthError) {
    return <Auth initialError={oauthError} />;
  }

  // 2. Auth Login/Signup Screen
  if (!session) {
    return <Auth initialError={oauthError} />;
  }

  if (loadingProfile) {
    return (
      <div className="min-h-[100dvh] bg-[#0b0f19] pb-[env(safe-area-inset-bottom,0px)] text-slate-100 flex items-center justify-center animate-pulse">
        Loading Rozana Hisaab...
      </div>
    );
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
      className="min-h-[100dvh] bg-[#0b0f19] text-slate-100 pb-[env(safe-area-inset-bottom,0px)] animate-[fadeIn_0.5s_ease-out]"
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
      {offlineSavedNotice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-900/95 px-4 py-2.5 text-sm text-slate-200 shadow-xl"
        >
          Saved offline. Will sync when back online.
        </div>
      )}
      <Header
        language={language}
        onToggleLanguage={toggleLanguage}
        dir={dir}
        profile={profile}
        userMetadata={session.user.user_metadata}
        onAvatarChange={async (file) => {
          await uploadAvatar(file);
        }}
        onImportBank={() => setActiveModal('bank')}
        onLogout={handleLogout}
        userId={session?.user?.id}
      />
      <main
        ref={dashboardRef}
        className="max-w-md mx-auto px-4 py-5 pb-32 space-y-4"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        <div
          role="status"
          aria-live="polite"
          aria-hidden={!isRefreshing && pullDistance === 0}
          className="fixed left-1/2 top-2 z-40 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-slate-700/70 bg-slate-900/90 shadow-lg transition-[transform,opacity] duration-200"
          style={{
            opacity: isRefreshing ? 1 : Math.min(pullDistance / 24, 1),
            transform: `translate(-50%, ${pullDistance}px)`,
            pointerEvents: 'none',
          }}
        >
          <span
            className={`h-4 w-4 rounded-full border-2 border-emerald-400/30 border-t-emerald-400 ${
              isRefreshing || pullDistance >= REFRESH_THRESHOLD ? 'animate-spin' : ''
            }`}
          />
          <span className="sr-only">
            {isRefreshing ? 'Refreshing dashboard' : 'Release to refresh'}
          </span>
        </div>
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