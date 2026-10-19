import { useSyncExternalStore, useEffect, useCallback } from 'react';
import type { Language } from '@/types';

const STORAGE_KEY = 'rozana-hisaab-lang';

function getSavedLanguage(): Language {
  return typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'ur'
    ? 'ur'
    : 'en';
}

let currentLanguage = getSavedLanguage();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setLanguage(language: Language) {
  currentLanguage = language;
  localStorage.setItem(STORAGE_KEY, language);
  listeners.forEach((listener) => listener());
}

export function useLanguage() {
  const language = useSyncExternalStore<Language>(
    subscribe,
    () => currentLanguage,
    () => 'en',
  );

  const toggleLanguage = useCallback(() => {
    setLanguage(currentLanguage === 'en' ? 'ur' : 'en');
  }, []);

  const dir: 'ltr' | 'rtl' = language === 'ur' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = language;
  }, [dir, language]);

  return { language, toggleLanguage, dir };
}
