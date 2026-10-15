import { useRef } from 'react';
import { Languages, Camera, FileUp, LogOut, Bell, BellRing } from 'lucide-react';
import type { Language } from '@/types';
import { tr } from '@/lib/i18n';
import type { UserProfile } from '@/hooks/useProfile';
import { usePushNotifications } from '@/hooks/usePushNotifications';

interface HeaderProps {
  language: Language;
  onToggleLanguage: () => void;
  dir: 'ltr' | 'rtl';
  profile: UserProfile | null;
  onAvatarChange: (avatar: string) => void;
  onImportBank: () => void;
  onLogout: () => void;
  userId?: string; // Passed from App.tsx session.user.id
}

function getInitials(name: string, lang: Language): string {
  const parts = name.trim().split(/\s+/);
  if (lang === 'ur') {
    return parts[0]?.[0] ?? '؟';
  }
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0]?.slice(0, 2).toUpperCase() ?? '?';
}

export function Header({
  language,
  onToggleLanguage,
  dir,
  profile,
  onAvatarChange,
  onImportBank,
  onLogout,
  userId,
}: HeaderProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const displayName = profile?.name ?? tr('userName', language);
  const initials = profile ? getInitials(profile.name, language) : language === 'ur' ? 'م' : 'MH';
  
  // Initialize Push Notifications Hook
  const { isSubscribed, subscribeToPush, loading } = usePushNotifications(userId);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      onAvatarChange(reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/50">
      <div className="max-w-md mx-auto px-4 pt-[max(env(safe-area-inset-top,0px),1rem)] pb-3 flex items-center justify-between gap-2">
        <div className={`flex min-w-0 items-center gap-3 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoChange}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="relative group shrink-0"
            aria-label="Change profile photo"
          >
            {profile?.avatar ? (
              <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-slate-800 shadow-lg shadow-emerald-500/20">
                <img src={profile.avatar} alt={displayName} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-emerald-500/20 group-hover:ring-2 group-hover:ring-emerald-400/50 transition-all">
                {initials}
              </div>
            )}
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center border-2 border-slate-950 group-hover:bg-emerald-500 transition-colors">
              <Camera size={9} className="text-slate-400 group-hover:text-white transition-colors" />
            </div>
          </button>
          <div className={`min-w-0 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
            <p className="truncate text-slate-400 text-xs leading-tight">{displayName}</p>
            <h1 className="flex items-center text-slate-100 font-bold text-base leading-tight tracking-tight">
              <img
                src="/icon.svg"
                alt="Rozana Hisaab"
                className="mr-2.5 h-9 w-9 rounded-xl"
              />
              {tr('appName', language)}
            </h1>
          </div>
        </div>

        <div className={`flex shrink-0 items-center gap-1.5 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
          
          {/* Push Notification Toggle Button */}
          <button
            onClick={subscribeToPush}
            disabled={loading || isSubscribed}
            title={isSubscribed ? 'Reminders Active' : 'Enable Reminders'}
            className={`flex items-center justify-center h-9 w-9 sm:w-auto sm:px-3 sm:py-2 rounded-xl border transition-all active:scale-95 ${
              isSubscribed
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 cursor-default'
                : 'bg-slate-800/80 hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-400 border-slate-700 hover:border-emerald-500/30'
            }`}
            aria-label="Toggle Reminders"
          >
            {isSubscribed ? <BellRing size={16} /> : <Bell size={16} />}
            <span className="text-xs font-semibold hidden sm:inline sm:ml-1.5">
              {isSubscribed ? 'Active' : 'Alerts'}
            </span>
          </button>

          {/* Import Bank Button */}
          <button
            onClick={onImportBank}
            className="flex items-center justify-center h-9 w-9 sm:w-auto sm:px-3 sm:py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-all active:scale-95 text-emerald-400"
            aria-label={tr('bankTitle', language)}
          >
            <FileUp size={16} />
            <span className="text-xs font-semibold hidden sm:inline sm:ml-1.5">{tr('importBank', language)}</span>
          </button>

          {/* Language Toggle */}
          <button
            onClick={onToggleLanguage}
            className="flex items-center justify-center h-9 w-9 sm:w-auto sm:px-3 sm:py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 transition-all active:scale-95 text-slate-300 hover:text-slate-100"
            aria-label="Toggle language"
          >
            <Languages size={16} className="text-emerald-400" />
            <span className="text-xs font-semibold hidden sm:inline sm:ml-1.5">
              {language === 'en' ? 'EN' : 'اردو'}
            </span>
          </button>

          {/* Logout */}
          <button
            type="button"
            onClick={onLogout}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-red-400 transition hover:bg-red-500/10 hover:text-red-300 active:scale-95"
            aria-label={language === 'ur' ? 'لاگ آؤٹ' : 'Log Out'}
            title={language === 'ur' ? 'لاگ آؤٹ' : 'Log Out'}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}