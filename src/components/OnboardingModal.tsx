import { useEffect, useState, useRef } from 'react';
import { Camera, Check, User, Sparkles } from 'lucide-react';
import { LanguageIcon } from '@/components/ui/LanguageIcon';
import type { Language } from '@/types';
import { tr } from '@/lib/i18n';
import { validateAvatarFile } from '@/lib/avatar';

interface OnboardingModalProps {
  language: Language;
  dir: 'ltr' | 'rtl';
  onToggleLanguage: () => void;
  onComplete: (profile: { name: string; avatarFile: File | null }) => Promise<void>;
}

export function OnboardingModal({ language, dir, onToggleLanguage, onComplete }: OnboardingModalProps) {
  const [name, setName] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const validationError = validateAvatarFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onComplete({ name: name.trim(), avatarFile });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not save your profile.');
      setSubmitting(false);
    }
  };

  const getInitials = (n: string) => {
    const parts = n.trim().split(/\s+/);
    if (parts.length >= 2) return parts[0][0] + parts[1][0];
    return parts[0].slice(0, 2);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex items-center justify-center" dir={dir}>
      {/* Animated background glow */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-0 w-72 h-72 bg-teal-500/5 rounded-full blur-3xl" />
      </div>

      {/* Language toggle */}
      <button
        onClick={onToggleLanguage}
        className="absolute top-10 z-10 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 transition-all active:scale-95 text-slate-300 hover:text-slate-100"
        style={dir === 'rtl' ? { left: '1rem' } : { right: '1rem' }}
        aria-label="Toggle language"
      >
        <LanguageIcon size={18} className="text-emerald-400" />
        <span className="text-xs font-semibold">
          {language === 'en' ? 'EN / اردو' : 'اردو / EN'}
        </span>
      </button>

      <div className="relative w-full max-w-md px-6 py-8 flex flex-col items-center animate-[fadeIn_0.4s_ease-out]">
        {/* Logo / App name */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-xl shadow-emerald-500/20 mb-4">
            <Sparkles size={30} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            {tr('appName', language)}
          </h1>
          <p className="text-slate-400 text-sm mt-1.5 text-center">
            {tr('onboardingWelcome', language)}
          </p>
        </div>

        {/* Avatar picker */}
        <div className="mb-6">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handlePhoto}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="relative group"
          >
            {avatarPreview ? (
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-slate-800 shadow-xl">
                <img src={avatarPreview} alt="Profile" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-24 h-24 rounded-full bg-slate-800 border-4 border-slate-800 flex items-center justify-center shadow-xl group-hover:border-emerald-500/50 transition-colors">
                <User size={36} className="text-slate-500 group-hover:text-emerald-400 transition-colors" />
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg border-3 border-slate-950">
              <Camera size={15} className="text-white" />
            </div>
          </button>
          <p className="text-slate-500 text-xs mt-3 text-center">
            {tr('onboardingPhotoOptional', language)}
          </p>
        </div>
        {error && (
          <p role="alert" className="mb-4 text-center text-sm text-rose-400">
            {error}
          </p>
        )}

        {/* Name input */}
        <div className="w-full mb-6">
          <label className="text-slate-400 text-xs block mb-2">
            {tr('onboardingName', language)}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder={language === 'ur' ? 'آپ کا نام' : 'Your name'}
            className={`w-full bg-slate-900 border border-slate-700 rounded-2xl px-4 py-3.5 text-slate-100 text-base focus:outline-none focus:border-emerald-500 transition-colors ${dir === 'rtl' ? 'text-right' : 'text-left'}`}
            autoFocus
          />
        </div>

        {/* Preview avatar initials */}
        {name.trim() && (
          <div className="flex items-center gap-2 mb-5 text-slate-400 text-xs animate-[fadeIn_0.2s_ease-out]">
            <Check size={14} className="text-emerald-400" />
            {getInitials(name).toUpperCase()}
          </div>
        )}

        {/* Create Account button */}
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || submitting}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm hover:from-emerald-400 hover:to-teal-500 transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
        >
          {submitting ? 'Saving...' : tr('onboardingCreate', language)}
        </button>

        <p className="text-slate-600 text-xs mt-4 text-center">
          {tr('onboardingNoSetup', language)}
        </p>
      </div>
    </div>
  );
}
