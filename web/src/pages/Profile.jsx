import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth.jsx';
import { useI18n, LOCALES } from '../i18n/index.jsx';
import { useTheme, hexA } from '../design/theme.jsx';
import { Icon } from '../design/Icon.jsx';
import { RoadSign, signForTopic } from '../design/RoadSign.jsx';
import { ErrorNote, GhostButton, Loading, PrimaryButton, Ring, Screen, ScreenHeader, StatCard } from '../design/primitives.jsx';
import { useIsMobile } from '../design/useMedia.js';
import { OfflineCard } from '../design/OfflineCard.jsx';
import { computeStreak, initialOf } from '../lib/progress.js';

// Profile, ported from the prototype's ProfileScreen.
//
// The prototype's tiles were streak / XP / "Lv 4". Streak is real (derived from
// session dates); XP and rank are not, so they are replaced with figures the
// data actually supports: answers given, sessions, and topic coverage.

export default function Profile({ dark, setDark }) {
  const T = useTheme();
  const { t, locale, setLocale } = useI18n();
  const { user, setUser, signOut } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [progress, setProgress] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([api.progress(locale), api.sessions()])
      .then(([p, s]) => { setProgress(p); setSessions(s); })
      .catch(setError);
  }, [locale]);

  useEffect(load, [load]);
  useEffect(() => { setName(user?.name ?? ''); }, [user?.name]);

  async function save(patch) {
    setSaving(true);
    setError(null);
    try {
      setUser(await api.updateMe(patch));
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  function changeLocale(code) {
    setLocale(code);
    save({ locale: code });
  }

  if (error && !progress) {
    return (
      <Screen scroll>
        <div style={{ padding: 24 }}>
          <ErrorNote error={error} onRetry={load} retryLabel={t('common.retry')} />
        </div>
      </Screen>
    );
  }
  if (!progress) return <Loading label={t('common.loading')} />;

  const r = progress.readiness;
  const answers = progress.topics.reduce((sum, x) => sum + x.attempts, 0);
  const exams = sessions.filter((s) => s.mode === 'exam' && s.finishedAt).length;
  const streak = computeStreak(sessions);
  const initial = initialOf(user);

  return (
    <Screen>
      <ScreenHeader title={t('profile.title')} />

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 28px' }}>
        {/* Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 36, flex: 'none',
            background: `linear-gradient(135deg, ${T.a}, ${T.b})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, fontWeight: 800, color: '#fff',
          }}>
            {initial ?? <Icon name="profile" size={32} color="#fff" strokeWidth={2} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: -0.4 }}>
              {user?.name || user?.phone}
            </div>
            <div style={{ fontSize: 13, color: T.textDim, marginTop: 2 }}>
              {user?.phone}
              {streak > 0 && ` · ${streak} ${t('road.dayStreak')}`}
            </div>
          </div>
        </div>

        {/* Real figures only */}
        <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
          <StatCard icon="check" color={T.a} value={answers} label={t('profile.answers')} />
          <StatCard icon="book" color={T.b} value={sessions.length} label={t('profile.sessions')} />
          <StatCard icon="timer" color={T.success} value={exams} label={t('profile.exams')} />
        </div>

        {/* Readiness */}
        <div style={{
          marginTop: 14, padding: 16, borderRadius: 18,
          background: T.surface, border: `0.5px solid ${T.stroke}`,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <Ring size={68} value={r.percent / 100} stroke={7} color={r.percent >= 80 ? T.success : r.percent >= 40 ? T.a : T.warn}>
            <span style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{r.percent}%</span>
          </Ring>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: -0.2 }}>
              {t('profile.examReadiness')}
            </div>
            <div style={{ fontSize: 12, color: T.textDim, marginTop: 3, lineHeight: 1.45 }}>
              {answers === 0
                ? t('profile.readinessEmpty')
                : t('profile.readinessDesc', { n: answers, c: Math.round(r.confidence * 100) })}
            </div>
          </div>
        </div>

        {/* Weak spots */}
        <div style={{ fontSize: 17, fontWeight: 700, color: T.text, letterSpacing: -0.3, margin: '22px 0 8px' }}>
          {t('profile.weakSpots')}
        </div>
        {progress.weakest.length === 0 ? (
          <div style={{ fontSize: 13, color: T.textDim, padding: '4px 0' }}>{t('profile.weakEmpty')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {progress.weakest.map((w, i) => (
              <button key={w.topicId} onClick={() => navigate(`/lesson/${w.topicId}`)} style={{
                background: T.surface, borderRadius: 14, padding: 12, width: '100%',
                display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                border: `0.5px solid ${T.stroke}`, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 10, flex: 'none', background: T.surface2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <RoadSign kind={signForTopic(w.slug, i)} size={32} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{w.title}</div>
                  <div style={{ fontSize: 12, color: T.textDim, marginTop: 2 }}>
                    {Math.round(w.score * 100)}%
                  </div>
                </div>
                <div style={{
                  padding: '6px 12px', borderRadius: 10, flex: 'none',
                  background: hexA(T.a, 0.12), color: T.a, fontSize: 12, fontWeight: 800,
                }}>{t('common.practice')}</div>
              </button>
            ))}
          </div>
        )}

        {/* Settings */}
        <div style={{ fontSize: 17, fontWeight: 700, color: T.text, letterSpacing: -0.3, margin: '22px 0 8px' }}>
          {t('profile.title')}
        </div>

        <ErrorNote error={error} />

        <div style={{ padding: 16, borderRadius: 18, background: T.surface, border: `0.5px solid ${T.stroke}` }}>
          <label style={{ display: 'block', fontSize: 12, color: T.textDim, fontWeight: 600, marginBottom: 6 }}>
            {t('profile.name')}
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('profile.namePlaceholder')}
            maxLength={80}
            style={{
              width: '100%', padding: '12px 14px', borderRadius: 12,
              border: `1px solid ${T.stroke}`, background: T.bg, color: T.text,
              fontSize: 15, outline: 'none',
            }}
          />

          <div style={{ fontSize: 12, color: T.textDim, fontWeight: 600, margin: '14px 0 6px' }}>
            {t('profile.language')}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {LOCALES.map((l) => (
              <button key={l.code} onClick={() => changeLocale(l.code)} style={{
                flex: 1, padding: 10, border: 'none', cursor: 'pointer', borderRadius: 10,
                fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                background: locale === l.code ? T.text : T.surface2,
                color: locale === l.code ? T.bg : T.textDim,
              }}>{l.label}</button>
            ))}
          </div>

          {/* The theme lived only in the desktop sidebar, which a phone does
              not have. A settings screen is where it belonged anyway, so it
              moves here for everyone rather than being duplicated. */}
          <div style={{ fontSize: 12, color: T.textDim, fontWeight: 600, margin: '14px 0 6px' }}>
            {t('profile.appearance')}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[{ id: false, label: t('theme.light') }, { id: true, label: t('theme.dark') }].map((o) => (
              <button key={String(o.id)} onClick={() => setDark?.(o.id)} style={{
                flex: 1, padding: 10, border: 'none', cursor: 'pointer', borderRadius: 10,
                fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                background: dark === o.id ? T.text : T.surface2,
                color: dark === o.id ? T.bg : T.textDim,
              }}>{o.label}</button>
            ))}
          </div>

          <div style={{ marginTop: 14 }}>
            <PrimaryButton
              onClick={() => save({ name: name.trim() })}
              disabled={saving || !name.trim() || name.trim() === (user?.name ?? '')}
            >
              {saved ? t('profile.saved') : t('profile.save')}
            </PrimaryButton>
          </div>
        </div>

        {/* Offline practice. Below the settings card because it is a choice
            about this device rather than about the account. */}
        <div style={{ marginTop: 14 }}>
          <OfflineCard />
        </div>

        {/* Admin has a sidebar entry on desktop and no tab on a phone, so the
            content team reaches it from here. The server's AdminGuard is still
            what enforces the boundary — this only keeps it out of the way. */}
        {isMobile && user?.role === 'admin' && (
          <button onClick={() => navigate('/admin')} style={{
            marginTop: 14, width: '100%', padding: 14, borderRadius: 14,
            background: T.surface, border: `0.5px solid ${T.stroke}`, cursor: 'pointer',
            fontFamily: 'inherit', textAlign: 'left',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flex: 'none', background: T.surface2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name="grid" size={18} color={T.textDim} strokeWidth={2.2} />
            </div>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: T.text }}>
              {t('profile.admin')}
            </span>
            <Icon name="chevron" size={18} color={T.textFaint} />
          </button>
        )}

        <div style={{ marginTop: 14 }}>
          <GhostButton onClick={signOut} style={{ color: T.danger }}>
            {t('profile.logout')}
          </GhostButton>
        </div>
      </div>
    </Screen>
  );
}
