import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearSession, getStoredUser, getToken } from './api';
import { useI18n } from './i18n/index.jsx';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { setLocale } = useI18n();
  // Seeded from localStorage so a returning user sees their app immediately
  // instead of a spinner while /auth/me round-trips.
  const [user, setUser] = useState(() => getStoredUser());
  const [ready, setReady] = useState(() => !getToken());

  useEffect(() => {
    if (!getToken()) {
      setReady(true);
      return;
    }
    let alive = true;
    api
      .me()
      .then((me) => {
        if (!alive) return;
        setUser(me);
        if (me.locale) setLocale(me.locale);
      })
      // A 401 has already cleared the session inside the api wrapper.
      .catch(() => alive && setUser(null))
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [setLocale]);

  const signIn = useCallback(
    (u) => {
      setUser(u);
      if (u?.locale) setLocale(u.locale);
    },
    [setLocale],
  );

  const signOut = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, setUser, signIn, signOut, ready, isAuthed: !!user && !!getToken() }),
    [user, signIn, signOut, ready],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
