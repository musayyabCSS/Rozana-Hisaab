import { useState, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { supabase } from '@/lib/supabase';

interface SetNewPasswordModalProps {
  open: boolean;
  onSuccess: () => void;
}

export function SetNewPasswordModal({ open, onSuccess }: SetNewPasswordModalProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setPassword('');
      setConfirmPassword('');
      onSuccess();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : 'Could not update your password. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => undefined}
      title="Set New Password"
      subtitle="Choose a new password for your account."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p role="alert" className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-center text-sm text-rose-400">
            {error}
          </p>
        )}
        <div>
          <label htmlFor="new-password" className="mb-1.5 block text-xs text-slate-400">
            New Password
          </label>
          <div className="relative flex items-center">
            <input
              id="new-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 p-3 pr-11 text-sm text-slate-50 focus:border-emerald-500 focus:outline-none"
              minLength={6}
              required
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute right-3 text-slate-400 transition-colors hover:text-slate-50"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="confirm-new-password" className="mb-1.5 block text-xs text-slate-400">
            Confirm Password
          </label>
          <div className="relative flex items-center">
            <input
              id="confirm-new-password"
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 p-3 pr-11 text-sm text-slate-50 focus:border-emerald-500 focus:outline-none"
              minLength={6}
              required
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowConfirmPassword((visible) => !visible)}
              className="absolute right-3 text-slate-400 transition-colors hover:text-slate-50"
            >
              {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-emerald-500 py-3 text-sm font-semibold text-ink transition hover:bg-emerald-600 disabled:opacity-60"
        >
          {loading ? 'Updating...' : 'Update Password'}
        </button>
      </form>
    </Modal>
  );
}
