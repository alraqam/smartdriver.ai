import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { api } from './api';
import { useTheme } from './design/theme.jsx';
import { Icon } from './design/Icon.jsx';
import { useI18n, LOCALES } from './i18n/index.jsx';
import { useAuth } from './auth.jsx';

// Desktop shell, ported from the prototype's web-app.jsx: a fixed sidebar and
// one centred panel that every screen fills absolutely.

/// First letter of a learner's name, or null when they only have a phone.
export function initialOf(user) {
  const name = (user?.name || '').trim();
  if (!name) return null;
  const ch = name.charAt(0);
  return /\p{L}|\p{N}/u.test(ch) ? ch.toUpperCase() : null;
}

const NAV = [
  { id: 'road', to: '/', icon: 'map', end: true },
  { id: 'lessons', to: '/lessons', icon: 'book' },
  { id: 'mistakes', to: '/mistakes', icon: 'target', badge: 'due' },
  { id: 'mock', to: '/mock', icon: 'quiz' },
  { id: 'signs', to: '/signs', icon: 'library' },
  { id: 'tutor', to: '/tutor', icon: 'sparkle' },
  { id: 'profile', to: '/profile', icon: 'profile' },
  // Content team only. The server's AdminGuard is what actually enforces this;
  // hiding the link just keeps it out of a learner's way.
  { id: 'admin', to: '/admin', icon: 'grid', adminOnly: true },
];

// Per-screen panel width, from the prototype. The road stays phone-like because
// its metaphor depends on a narrow column; lists and the exam get more room.
const PANEL_W = [
  [/^\/$/, 560],
  [/^\/lesson\//, 680],
  [/^\/session\//, 720],
  [/^\/result\//, 640],
  [/^\/review\//, 760],
  [/^\/lessons/, 760],
  [/^\/mistakes/, 760],
  [/^\/mock/, 760],
  [/^\/signs/, 900],
  [/^\/tutor/, 760],
  [/^\/profile/, 680],
  [/^\/admin/, 980],
];

function panelWidth(pathname) {
  for (const [re, w] of PANEL_W) if (re.test(pathname)) return w;
  return 640;
}

function Toggle({ options, value, onChange, T }) {
  return (
    <div style={{
      display: 'flex', gap: 6, borderRadius: 12, padding: 4,
      background: T.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
    }}>
      {options.map((o) => (
        <button key={String(o.id)} onClick={() => onChange(o.id)} style={{
          flex: 1, padding: '7px 0', border: 'none', cursor: 'pointer', borderRadius: 9,
          fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
          background: value === o.id ? (T.dark ? '#2A2F38' : '#fff') : 'transparent',
          color: T.dark ? '#F2F4F7' : '#151617',
        }}>{o.label}</button>
      ))}
    </div>
  );
}

export function Shell({ dark, setDark, children }) {
  const T = useTheme();
  const { t, locale, setLocale } = useI18n();
  const { user, signOut } = useAuth();
  const { pathname } = useLocation();

  // The quiz and exam runners take the whole panel: a sidebar during a timed
  // exam is an invitation to lose the paper by mistap.
  const focused = /^\/(session|mock\/run)/.test(pathname);
  const width = panelWidth(pathname);

  // How many mistakes are owed today. Refetched on every navigation so it
  // settles right after a drill rather than going stale until reload.
  const [due, setDue] = useState(0);
  useEffect(() => {
    let alive = true;
    api.reviews(locale, 'due')
      .then((r) => alive && setDue(r.counts.due))
      .catch(() => {});
    return () => { alive = false; };
  }, [pathname, locale]);

  return (
    <div style={{ display: 'flex', height: '100vh', background: T.shellBg, color: T.text }}>
      {!focused && (
        <aside style={{
          width: 248, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4,
          padding: '24px 16px', background: T.shellSurface, borderRight: `1px solid ${T.line}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 8px 20px' }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12, flexShrink: 0,
              background: `linear-gradient(135deg, ${T.a}, ${T.b})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name="map" size={22} color="#fff" strokeWidth={2} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.4 }}>{t('app.name')}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.textDim }}>{t('app.tagline')}</div>
            </div>
          </div>

          {NAV.filter((item) => !item.adminOnly || user?.role === 'admin').map((item) => (
            <NavLink key={item.id} to={item.to} end={item.end} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 12,
              textDecoration: 'none', fontSize: 14.5, fontWeight: 700, letterSpacing: -0.2,
              background: isActive ? T.a : 'transparent',
              color: isActive ? '#fff' : T.text,
            })}>
              {({ isActive }) => (
                <>
                  <Icon name={item.icon} size={20} color={isActive ? '#fff' : T.textDim} strokeWidth={2} />
                  <span style={{ flex: 1 }}>{t(`nav.${item.id}`)}</span>
                  {item.badge === 'due' && due > 0 && (
                    <span style={{
                      minWidth: 20, padding: '1px 6px', borderRadius: 10,
                      background: isActive ? 'rgba(255,255,255,0.28)' : T.danger,
                      color: '#fff', fontSize: 11, fontWeight: 800, textAlign: 'center',
                      fontVariantNumeric: 'tabular-nums',
                    }}>{due}</span>
                  )}
                </>
              )}
            </NavLink>
          ))}

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {user && (
              <button onClick={signOut} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                borderRadius: 12, border: 'none', background: 'transparent', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: T.textDim, textAlign: 'left',
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 13, flexShrink: 0,
                  background: `linear-gradient(135deg, ${T.a}, ${T.b})`, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800,
                }}>
                  {/* A phone-only account has no meaningful initial — "+998…"
                      would render a literal plus sign — so it gets an icon. */}
                  {initialOf(user) ?? <Icon name="profile" size={14} color="#fff" strokeWidth={2.4} />}
                </div>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.name || user.phone}
                </span>
                <Icon name="logout" size={15} color={T.textDim} strokeWidth={2} />
              </button>
            )}

            <Toggle
              T={T}
              value={locale}
              onChange={setLocale}
              options={LOCALES.map((l) => ({ id: l.code, label: l.label }))}
            />
            <Toggle
              T={T}
              value={dark}
              onChange={setDark}
              options={[
                { id: false, label: t('theme.light') },
                { id: true, label: t('theme.dark') },
              ]}
            />
          </div>
        </aside>
      )}

      <main style={{
        flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center',
        padding: focused ? 0 : '28px 32px', minWidth: 0,
      }}>
        <div style={{
          position: 'relative', width: '100%',
          maxWidth: focused ? 820 : width,
          height: '100%', maxHeight: focused ? '100%' : 940,
          borderRadius: focused ? 0 : 28, overflow: 'hidden',
          boxShadow: focused ? 'none' : (T.dark ? '0 20px 60px rgba(0,0,0,0.5)' : '0 20px 60px rgba(0,0,0,0.12)'),
          border: focused ? 'none' : `1px solid ${T.line}`,
          transition: 'max-width 0.25s cubic-bezier(.2,.7,.3,1)',
        }}>
          {children}
        </div>
      </main>
    </div>
  );
}
