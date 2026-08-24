import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useI18n } from '../i18n/index.jsx';
import { useTheme } from '../design/theme.jsx';
import { Icon } from '../design/Icon.jsx';
import { ErrorNote, GhostButton, Loading, PrimaryButton, Ring } from '../design/primitives.jsx';

// Practice result, ported from the prototype's ResultScreen.
//
// The prototype's three stat tiles were "+15 XP / +1 streak / accuracy". Two of
// those have nothing behind them here, so the tiles report what is actually
// known: right, wrong, and the readiness the session moved.

function Stat({ icon, value, label, color }) {
  const T = useTheme();
  return (
    <div style={{
      flex: 1, minWidth: 0, padding: '12px 10px', borderRadius: 14,
      background: T.surface, border: `0.5px solid ${T.stroke}`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    }}>
      <Icon name={icon} size={18} color={color} strokeWidth={2.2} />
      <div style={{ fontSize: 18, fontWeight: 800, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 10, color: T.textDim, fontWeight: 600, letterSpacing: 0.3, textAlign: 'center' }}>{label}</div>
    </div>
  );
}

export default function Result() {
  const { id } = useParams();
  const T = useTheme();
  const { t } = useI18n();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [again, setAgain] = useState(false);

  useEffect(() => {
    // finish() is idempotent, so this also covers a reload straight onto the URL.
    api.finish(id).then(setData).catch(setError);
  }, [id]);

  async function retry() {
    setAgain(true);
    try {
      const s = await api.createSession({
        mode: data.mode,
        ...(data.mode === 'practice' ? { topicId: data.topicId } : {}),
        ...(data.mode !== 'exam' ? { count: data.questionCount } : {}),
      });
      navigate(`/session/${s.id}`, { replace: true });
    } catch (err) {
      setError(err);
      setAgain(false);
    }
  }

  if (error && !data) {
    return (
      <div style={{ position: 'absolute', inset: 0, background: T.bg, padding: 24, overflow: 'auto' }}>
        <ErrorNote error={error} />
        <GhostButton onClick={() => navigate('/')}>{t('result.home')}</GhostButton>
      </div>
    );
  }
  if (!data) return <Loading label={t('common.loading')} />;

  const pct = data.questionCount ? data.correctCount / data.questionCount : 0;
  const good = pct >= 0.6;
  const wrong = data.questionCount - data.correctCount;

  return (
    <div style={{ position: 'absolute', inset: 0, background: T.bg, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        flex: 1, overflowY: 'auto', padding: '48px 24px 20px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
      }}>
        <Ring size={160} value={pct} stroke={14} color={good ? T.success : T.warn}>
          <div>
            <div style={{ fontSize: 40, fontWeight: 800, color: T.text, letterSpacing: -1, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(pct * 100)}%
            </div>
            <div style={{ fontSize: 11, color: T.textDim, fontWeight: 700, letterSpacing: 0.5, marginTop: 3 }}>
              {t('result.score')}
            </div>
          </div>
        </Ring>

        <div style={{ fontSize: 26, fontWeight: 800, color: T.text, letterSpacing: -0.6, marginTop: 20 }}>
          {good ? t('result.complete') : t('result.almostThere')}
        </div>
        <div style={{ fontSize: 15, color: T.textDim, marginTop: 6, lineHeight: 1.45, maxWidth: 320 }}>
          {t('result.summary', { c: data.correctCount, t: data.questionCount })}
        </div>

        <div style={{ marginTop: 22, display: 'flex', gap: 8, width: '100%', maxWidth: 380 }}>
          <Stat icon="check" value={data.correctCount} label={t('result.correct')} color={T.success} />
          <Stat icon="close" value={wrong} label={t('result.wrong')} color={T.danger} />
          {data.readiness && (
            <Stat icon="target" value={`${data.readiness.percent}%`} label={t('result.readinessNow')} color={T.a} />
          )}
        </div>

        <ErrorNote error={error} />
      </div>

      <div style={{ flex: 'none', padding: '12px 16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <PrimaryButton onClick={() => navigate(`/review/${id}`)}>{t('result.review')}</PrimaryButton>
        <div style={{ display: 'flex', gap: 8 }}>
          <GhostButton onClick={retry} disabled={again}>{t('result.again')}</GhostButton>
          <GhostButton onClick={() => navigate('/')}>{t('result.home')}</GhostButton>
        </div>
      </div>
    </div>
  );
}
