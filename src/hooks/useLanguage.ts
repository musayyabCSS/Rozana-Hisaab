import { useState, useEffect, useCallback } from 'react';
import type { Language } from '@/types';

const STORAGE_KEY = 'rozana-hisaab-lang';

export function useLanguage() {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'ur' ? 'ur' : 'en';
  });

  const toggleLanguage = useCallback(() => {
    setLanguage((prev) => {
      const next = prev === 'en' ? 'ur' : 'en';
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const dir: 'ltr' | 'rtl' = language === 'ur' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = language;
  }, [dir, language]);

  return { language, toggleLanguage, dir };
}
