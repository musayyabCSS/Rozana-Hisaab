import { Sparkles, ArrowRight, Languages } from 'lucide-react';
import type { Language } from '@/types';
import { tr } from '@/lib/i18n';
import type { UserProfile } from '@/hooks/useProfile';

interface WelcomeBackScreenProps {
  profile: UserProfile;
  language: Language;
  dir: 'ltr' | 'rtl';
  onToggleLanguage: () => void;
  onContinue: () => void;
}

export function WelcomeBackScreen({ profile, language, dir, onToggleLanguage, onContinue }: WelcomeBackScreenProps) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex items-center justify-center" dir={dir}>
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-72 h-72 bg-teal-500/5 rounded-full blur-3xl" />
      </div>

      {/* Language toggle */}
      <button
        onClick={onToggleLanguage}
        className="absolute top-10 z-10 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 transition-all active:scale-95 text-slate-300 hover:text-slate-100"
        style={dir === 'rtl' ? { left: '1rem' } : { right: '1rem' }}
        aria-label="Toggle language"
      >
        <Languages size={16} className="text-emerald-400" />
        <span className="text-xs font-semibold">
          {language === 'en' ? 'EN / اردو' : 'اردو / EN'}
        </span>
      </button>

      <div className="relative w-full max-w-md px-6 flex flex-col items-center animate-[fadeIn_0.5s_ease-out]">
        {/* Avatar */}
        <div className="mb-5">
          {profile.avatar ? (
            <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-slate-800 shadow-xl shadow-emerald-500/20">
              <img src={profile.avatar} alt={profile.name} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-xl shadow-emerald-500/20">
              <Sparkles size={32} className="text-white" />
            </div>
          )}
        </div>

        {/* Welcome text */}
        <p className="text-emerald-400 text-sm font-medium">
          {tr('welcomeBack', language)}
        </p>
        <h1 className="text-2xl font-bold text-slate-100 tracking-tight mt-1.5 text-center">
          {profile.name}
        </h1>
        <p className="text-slate-400 text-sm mt-2 text-center">
          {tr('appName', language)}
        </p>

        {/* Continue button */}
        <button
          onClick={onContinue}
          className={`mt-10 w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm hover:from-emerald-400 hover:to-teal-500 transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 ${
            dir === 'rtl' ? 'flex-row-reverse' : ''
          }`}
        >
          {tr('continueDashboard', language)}
          <ArrowRight size={18} className={dir === 'rtl' ? 'rotate-180' : ''} />
        </button>
      </div>
    </div>
  );
}
