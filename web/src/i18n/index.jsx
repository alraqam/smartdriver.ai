import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import uz from './uz.json';
import ru from './ru.json';

// Deliberately not an i18n library. Two locales, flat keys, one interpolation
// form — a library would be more configuration than translation.

const DICTS = { uz, ru };
const LOCALE_KEY = 'sdai.locale';

export const LOCALES = [
  { code: 'uz', label: "O'zbek" },
  { code: 'ru', label: 'Русский' },
];

const I18nContext = createContext(null);

export function I18nProvider({ children, initial }) {
  const [locale, setLocaleState] = useState(
    () => initial || localStorage.getItem(LOCALE_KEY) || 'uz',
  );

  const setLocale = useCallback((next) => {
    localStorage.setItem(LOCALE_KEY, next);
    setLocaleState(next);
    document.documentElement.lang = next;
  }, []);

  const t = useCallback(
    (key, vars) => {
      // Falls back to uz, then to the key itself — a missing translation shows
      // as a visible key rather than an empty element, so it gets noticed.
      const raw = DICTS[locale]?.[key] ?? DICTS.uz[key] ?? key;
      if (!vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
