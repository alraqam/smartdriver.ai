import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth.jsx';
import { useI18n, LOCALES } from '../i18n/index.jsx';
import { useTheme, hexA } from '../design/theme.jsx';
import { Icon } from '../design/Icon.jsx';
import { RoadSign } from '../design/RoadSign.jsx';
import { ErrorNote, PrimaryButton } from '../design/primitives.jsx';

// Sign-in. The prototype had no auth at all, so this is built in the design's
// language rather than ported: the same warm background, accent gradient and
// sign vocabulary, split into a marketing panel and the form.

function formatUz(raw) {
  const d = raw.replace(/\D/g, '').replace(/^998/, '').slice(0, 9);
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
  return parts.length ? `+998 ${parts.join(' ')}` : '';
}

const HERO_SIGNS = ['priority', 'yield', 'stop', 'speed', 'roundabout', 'crossing'];

export default function Login({ dark, setDark }) {
  const T = useTheme();
  const { t, locale, setLocale } = useI18n();
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [mock, setMock] = useState(false);
  // DEMO ONLY: the API returns the OTP in mock mode so a demo needs no server
  // log. It is absent the moment real SMS is configured.
  const [devCode, setDevCode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const codeRef = useRef(null);

  const digits = phone.replace(/\D/g, '').replace(/^998/, '');
  const phoneReady = digits.length === 9;

  async function sendCode(e) {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api.requestOtp(phone);
      setMock(!!r.mock);
      setDevCode(r.devCode ?? null);
      setStep('code');
      setCode(r.devCode ?? '');
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e) {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api.verifyOtp(phone, code);
      signIn(r.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err);
      setCode('');
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  const input = {
    width: '100%', padding: '14px 16px', borderRadius: 14,
    border: `1px solid ${T.stroke}`, background: T.surface, color: T.text,
    fontSize: 16, outline: 'none',
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: T.shellBg }}>
      {/* Brand panel — hidden on narrow windows, where it is just a wall */}
      <div style={{
        flex: 1, minWidth: 0, display: 'none', flexDirection: 'column', justifyContent: 'center',
        padding: 56, background: `linear-gradient(150deg, ${hexA(T.a, T.dark ? 0.28 : 0.16)}, transparent 65%)`,
      }} className="sdai-login-hero">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 36 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 16,
            background: `linear-gradient(135deg, ${T.a}, ${T.b})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="map" size={28} color="#fff" strokeWidth={2} />
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.6, color: T.text }}>{t('app.name')}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.textDim }}>{t('app.tagline')}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', maxWidth: 420 }}>
          {HERO_SIGNS.map((k) => (
            <div key={k} style={{
              width: 84, height: 84, borderRadius: 20, background: T.surface,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            }}>
              <RoadSign kind={k} size={56} />
            </div>
          ))}
        </div>
      </div>

      {/* Form panel */}
      <div style={{
        width: 460, maxWidth: '100%', flex: 'none', background: T.bg,
        display: 'flex', flexDirection: 'column', padding: '32px 40px',
        overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 'auto' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {LOCALES.map((l) => (
              <button key={l.code} onClick={() => setLocale(l.code)} style={{
                padding: '6px 12px', border: 'none', cursor: 'pointer', borderRadius: 10,
                fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                background: locale === l.code ? T.text : T.surface2,
                color: locale === l.code ? T.bg : T.textDim,
              }}>{l.code.toUpperCase()}</button>
            ))}
          </div>
          <button onClick={() => setDark(!dark)} aria-label={dark ? t('theme.light') : t('theme.dark')} style={{
            border: 'none', background: T.surface2, width: 34, height: 34, borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            <Icon name={dark ? 'sun' : 'moon'} size={17} color={T.textDim} strokeWidth={2} />
          </button>
        </div>

        <div style={{ margin: 'auto 0' }}>
          {step === 'phone' ? (
            <form onSubmit={sendCode}>
              <h1 style={{ fontSize: 30, fontWeight: 800, color: T.text, letterSpacing: -0.8, margin: '0 0 6px' }}>
                {t('login.title')}
              </h1>
              <p style={{ fontSize: 14, color: T.textDim, margin: '0 0 22px', lineHeight: 1.5 }}>
                {t('login.subtitle')}
              </p>

              <ErrorNote error={error} />

              <label style={{ display: 'block', fontSize: 12, color: T.textDim, fontWeight: 600, marginBottom: 6 }} htmlFor="phone">
                {t('login.phone')}
              </label>
              <input
                id="phone" type="tel" inputMode="numeric" autoComplete="tel"
                placeholder="+998 90 123 45 67" value={phone}
                onChange={(e) => setPhone(formatUz(e.target.value))}
                style={{ ...input, marginBottom: 16 }}
              />

              <PrimaryButton disabled={!phoneReady || busy}>
                {busy ? t('login.sending') : t('login.sendCode')}
              </PrimaryButton>
            </form>
          ) : (
            <form onSubmit={verify}>
              <h1 style={{ fontSize: 30, fontWeight: 800, color: T.text, letterSpacing: -0.8, margin: '0 0 6px' }}>
                {t('login.codeTitle')}
              </h1>
              <p style={{ fontSize: 14, color: T.textDim, margin: '0 0 22px', lineHeight: 1.5 }}>
                {t('login.codeSubtitle', { phone })}
              </p>

              <ErrorNote error={error} />

              <label style={{ display: 'block', fontSize: 12, color: T.textDim, fontWeight: 600, marginBottom: 6 }} htmlFor="code">
                {t('login.code')}
              </label>
              <input
                id="code" ref={codeRef} type="text" inputMode="numeric" autoComplete="one-time-code"
                maxLength={6} placeholder="······" value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                style={{
                  ...input, marginBottom: 16, textAlign: 'center',
                  letterSpacing: 10, fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                }}
              />

              <PrimaryButton disabled={code.length !== 6 || busy}>
                {busy ? t('login.verifying') : t('login.verify')}
              </PrimaryButton>

              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" onClick={() => { setStep('phone'); setError(null); }} style={{
                  flex: 1, border: 'none', background: 'transparent', color: T.textDim,
                  padding: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}>{t('login.changePhone')}</button>
                <button type="button" onClick={sendCode} disabled={busy} style={{
                  flex: 1, border: 'none', background: 'transparent', color: T.textDim,
                  padding: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}>{t('login.resend')}</button>
              </div>

              {devCode ? (
                <div style={{
                  marginTop: 16, padding: '12px 14px', borderRadius: 12,
                  border: `1px dashed ${T.warn}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                }}>
                  <span style={{ fontSize: 12, color: T.textDim, lineHeight: 1.35 }}>{t('login.demoCode')}</span>
                  <button type="button" onClick={() => setCode(devCode)} title={devCode} style={{
                    border: 'none', background: 'none', cursor: 'pointer', color: T.warn,
                    fontSize: 22, fontWeight: 700, letterSpacing: 3, padding: '4px 6px',
                    fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit',
                  }}>{devCode}</button>
                </div>
              ) : (
                mock && (
                  <p style={{ fontSize: 12, color: T.textFaint, marginTop: 14 }}>{t('login.mockHint')}</p>
                )
              )}
            </form>
          )}
        </div>

        <div style={{ marginTop: 'auto', fontSize: 11, color: T.textFaint, textAlign: 'center' }}>
          {t('app.name')} · {t('app.tagline')}
        </div>
      </div>

      <style>{`
        @media (min-width: 900px) { .sdai-login-hero { display: flex !important; } }
      `}</style>
    </div>
  );
}
