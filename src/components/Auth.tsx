import React, { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';

export function Auth({ initialError }: { initialError?: string | null }) {
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialError) setError(initialError);
  }, [initialError]);

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetSent(false);
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      setResetSent(true);
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : 'Could not send the password reset link.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    if (error) setError(error.message);
    setLoading(false);
  };

const handleGoogleLogin = async () => {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: Capacitor.isNativePlatform()
          ? 'com.cssestimation.rozanahisaab://google-auth'
          : window.location.origin,
        skipBrowserRedirect: false,
        queryParams: {
          prompt: 'select_account',
          access_type: 'offline',
        },
      },
    });

    if (error) {
      setError(error.message);
      console.error('Error logging in with Google:', error.message);
    }
  };
  
  return (
    <div className="flex min-h-screen min-h-[100dvh] flex-col items-center justify-center gap-8 bg-slate-950 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] text-white">
      <header className="w-full max-w-xl space-y-4 text-center">
        <img
          src="/icon.svg"
          alt="Rozana Hisaab Logo"
          className="mx-auto h-16 w-16 rounded-2xl shadow-lg shadow-emerald-500/20"
        />
        <h1 className="text-3xl font-bold tracking-tight text-emerald-400">
          Rozana Hisaab — Smart Expense Tracker
        </h1>
        <p className="text-sm leading-relaxed text-slate-300">
          Track daily expenses, record voice transactions, and scan bills with AI.
        </p>
        <ul className="flex flex-wrap justify-center gap-2" aria-label="App features">
          {['Daily Ledgers', 'Instant Voice Input', 'Receipt & Bill OCR'].map((feature) => (
            <li
              key={feature}
              className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300"
            >
              {feature}
            </li>
          ))}
        </ul>
      </header>

      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <h2 className="text-xl font-bold text-center text-emerald-400">
          {showResetForm ? 'Reset your password' : isSignUp ? 'Create your account' : 'Welcome back'}
        </h2>
        <p className="text-xs text-slate-400 text-center">
          {showResetForm
            ? 'Reset your password'
            : isSignUp
              ? 'Create a new account'
              : 'Log in to your account'}
        </p>

        {showResetForm ? (
          <>
            {resetSent && (
              <div className="p-3 text-sm bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-lg text-center">
                If an account exists for this email, a password reset link has been sent. Check your inbox.
              </div>
            )}
            {error && (
              <div className="p-2 text-xs bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-center">
                {error}
              </div>
            )}
            <form onSubmit={handlePasswordReset} className="space-y-3">
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3 rounded-lg bg-slate-800 text-white border border-slate-700 focus:outline-none focus:border-emerald-500 text-sm"
                required
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 font-semibold rounded-lg transition text-slate-950 text-sm disabled:opacity-60"
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
            <button
              type="button"
              onClick={() => {
                setShowResetForm(false);
                setResetSent(false);
                setError(null);
              }}
              className="w-full text-xs text-slate-400 hover:text-white underline text-center pt-2"
            >
              Back to Log In
            </button>
          </>
        ) : (
          <>
        {error && (
          <div className="p-2 text-xs bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-center">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleLogin}
          className="w-full py-3 px-4 flex items-center justify-center gap-3 bg-white text-slate-900 font-semibold rounded-lg hover:bg-slate-100 transition shadow text-sm"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          Sign in with Google
        </button>

        <div className="relative flex items-center justify-center my-2">
          <div className="border-t border-slate-800 w-full"></div>
          <span className="bg-slate-900 px-3 text-xs text-slate-500 uppercase">Or</span>
          <div className="border-t border-slate-800 w-full"></div>
        </div>

        <form onSubmit={handleAuth} className="space-y-3">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-3 rounded-lg bg-slate-800 text-white border border-slate-700 focus:outline-none focus:border-emerald-500 text-sm"
            required
          />
          <div className="relative flex items-center">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 pr-11 rounded-lg bg-slate-800 text-white border border-slate-700 focus:outline-none focus:border-emerald-500 text-sm"
              required
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute right-3 text-slate-400 hover:text-white transition-colors"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {!isSignUp && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => {
                  setShowResetForm(true);
                  setError(null);
                }}
                className="text-xs text-slate-400 hover:text-emerald-400 transition-colors"
              >
                Forgot Password?
              </button>
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 font-semibold rounded-lg transition text-slate-950 text-sm"
          >
            {loading ? 'Processing...' : isSignUp ? 'Sign Up' : 'Log In'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setIsSignUp(!isSignUp)}
          className="w-full text-xs text-slate-400 hover:text-white underline text-center pt-2"
        >
          {isSignUp ? 'Already have an account? Log In' : "Don't have an account? Sign Up"}
        </button>
          </>
        )}
      </div>
      <footer className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs text-slate-400">
        <a href="/privacy" className="transition-colors hover:text-white">
          Privacy Policy
        </a>
        <span aria-hidden="true" className="text-slate-600">·</span>
        <a href="/terms" className="transition-colors hover:text-white">
          Terms of Service
        </a>
        <span aria-hidden="true" className="text-slate-600">·</span>
        <a
          href="mailto:musayyab@chatsupportservice.com?subject=Rozana%20Hisaab%20Support"
          className="transition-colors hover:text-white"
        >
          Contact Support
        </a>
      </footer>
    </div>
  );
}