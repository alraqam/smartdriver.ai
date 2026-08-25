import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError, clearSession, getStoredUser, getToken } from './api';
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
      .catch((err) => {
        if (!alive) return;
        // A 401 has already cleared the session inside the api wrapper; any
        // other real status still means the server answered and rejected us.
        // Status 0 is the api client's "no answer at all" marker, so it has to
        // be excluded here — it is the one ApiError that is not a verdict.
        if (err instanceof ApiError && err.status !== 0) {
          setUser(null);
          return;
        }
        // A network failure is not a signed-out user. Offline — a patchy
        // connection, aeroplane mode, the phone between cells — the session in
        // localStorage is the best information available, and discarding it
        // bounced a signed-in learner to a login screen they cannot complete
        // without a network. Keep them in the app; the screens that genuinely
        // need the server fail through their own error UI.
      })
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
