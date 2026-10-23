import { useRef, useState } from 'react';
import { Camera, FileUp, LogOut, Settings } from 'lucide-react';
import { LanguageIcon } from '@/components/ui/LanguageIcon';
import type { Language } from '@/types';
import { tr } from '@/lib/i18n';
import type { UserProfile } from '@/hooks/useProfile';
import { validateAvatarFile } from '@/lib/avatar';

interface HeaderProps {
  language: Language;
  onToggleLanguage: () => void;
  dir: 'ltr' | 'rtl';
  profile: UserProfile | null;
  userMetadata?: Record<string, unknown>;
  onAvatarChange: (file: File) => Promise<void>;
  onImportBank: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
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
  userMetadata,
  onAvatarChange,
  onImportBank,
  onOpenSettings,
  onLogout,
}: HeaderProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const displayName = profile?.name ?? tr('userName', language);
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const preferredAvatar =
    profile?.avatar ??
    (typeof userMetadata?.avatar_url === 'string' ? userMetadata.avatar_url : null) ??
    (typeof userMetadata?.picture === 'string' ? userMetadata.picture : null);
  // Show initials instead of a broken image if the photo cannot be loaded.
  const avatar = preferredAvatar === failedAvatar ? null : preferredAvatar;
  const initials = profile ? getInitials(profile.name, language) : language === 'ur' ? 'م' : 'MH';

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validationError = validateAvatarFile(file);
    e.target.value = '';
    if (validationError) {
      setAvatarError(validationError);
      return;
    }

    setAvatarError(null);
    setUploadingAvatar(true);
    try {
      await onAvatarChange(file);
    } catch (error) {
      setAvatarError(error instanceof Error ? error.message : 'Could not upload profile photo.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/50">
      <div className="max-w-md mx-auto px-4 pt-[max(env(safe-area-inset-top,0px),1rem)] pb-3 flex items-center justify-between gap-2">
        <div className={`flex min-w-0 items-center gap-3 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handlePhotoChange}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploadingAvatar}
            className="relative group shrink-0"
            aria-label="Change profile photo"
          >
            {avatar ? (
              <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-slate-800 shadow-lg shadow-emerald-500/20">
                <img
                  src={avatar}
                  alt={displayName}
                  // Google profile photos can refuse requests that carry a referrer.
                  referrerPolicy="no-referrer"
                  onError={() => setFailedAvatar(avatar)}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-emerald-500/20 group-hover:ring-2 group-hover:ring-emerald-400/50 transition-all">
                {initials}
              </div>
            )}
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center border-2 border-slate-950 group-hover:bg-emerald-500 transition-colors">
              <Camera size={9} className="text-slate-400 group-hover:text-slate-50 transition-colors" />
            </div>
          </button>
          <div className={`min-w-0 ${dir === 'rtl' ? 'text-right' : 'text-left'}`}>
            <p className="truncate text-slate-400 text-xs leading-tight">{displayName}</p>
            <h1 className="flex items-center text-slate-100 font-bold text-base leading-tight tracking-tight">
              <img
                src="/icon.svg"
                alt="Rozana Hisaab"
                className="me-2.5 h-9 w-9 rounded-xl"
              />
              {tr('appName', language)}
            </h1>
          </div>
        </div>

        <div className={`flex shrink-0 items-center gap-1.5 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
          {/* Import Bank Button */}
          <button
            onClick={onImportBank}
            className="flex items-center justify-center h-9 w-9 sm:w-auto sm:px-3 sm:py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-all active:scale-95 text-emerald-400"
            aria-label={tr('bankTitle', language)}
          >
            <FileUp size={18} />
            <span className="text-xs font-semibold hidden sm:inline sm:ms-1.5">{tr('importBank', language)}</span>
          </button>

          {/* Language Toggle */}
          <button
            onClick={onToggleLanguage}
            className="flex items-center justify-center h-9 w-9 sm:w-auto sm:px-3 sm:py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 transition-all active:scale-95 text-slate-300 hover:text-slate-100"
            aria-label="Toggle language"
          >
            <LanguageIcon size={18} className="text-emerald-400" />
            <span className="text-xs font-semibold hidden sm:inline sm:ms-1.5">
              {language === 'en' ? 'EN' : 'اردو'}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/80 text-slate-300 transition hover:bg-slate-700 hover:text-slate-100 active:scale-95"
            aria-label={tr('settingsTitle', language)}
            title={tr('settingsTitle', language)}
          >
            <Settings size={18} />
          </button>

          {/* Logout */}
          <button
            type="button"
            onClick={onLogout}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-red-400 transition hover:bg-red-500/10 hover:text-red-300 active:scale-95"
            aria-label={language === 'ur' ? 'لاگ آؤٹ' : 'Log Out'}
            title={language === 'ur' ? 'لاگ آؤٹ' : 'Log Out'}
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
      {avatarError && (
        <p role="alert" className="border-t border-rose-500/20 px-4 py-2 text-center text-xs text-rose-300">
          {avatarError}
        </p>
      )}
    </header>
  );
}