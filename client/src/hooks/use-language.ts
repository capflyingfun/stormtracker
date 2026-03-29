import { createContext, useContext, useState, useEffect, createElement, type ReactNode } from 'react';
import { type Language, type Translations, translations, LANGUAGES } from '@/lib/i18n';

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  setLanguage: () => {},
  t: translations.en,
});

function detectBrowserLanguage(): Language {
  const nav = navigator.language || 'en';
  const code = nav.split('-')[0].toLowerCase() as Language;
  return LANGUAGES.some(l => l.code === code) ? code : 'en';
}

const STORAGE_KEY = 'st_language';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Language | null;
    if (saved && LANGUAGES.some(l => l.code === saved)) return saved;
    return detectBrowserLanguage();
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(STORAGE_KEY, lang);
  };

  const t = translations[language] ?? translations.en;

  return createElement(LanguageContext.Provider, { value: { language, setLanguage, t } }, children);
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
