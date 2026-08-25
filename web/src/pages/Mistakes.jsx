import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useI18n } from '../i18n/index.jsx';
import { useTheme, hexA } from '../design/theme.jsx';
import { Icon } from '../design/Icon.jsx';
import { ErrorNote, Loading, PrimaryButton, Screen, ScreenHeader } from '../design/primitives.jsx';
import { daysUntilDue } from '../lib/progress.js';

// The mistake bank — questions the learner has got wrong, on a spaced
// repetition schedule. See api/src/reviews/schedule.ts for the schedule itself.

/// Days until a review comes back, as words rather than a raw timestamp.
function dueLabel(item, t) {
  if (item.mastered) return t('mistakes.mastered');
  if (item.due) return t('mistakes.dueNow');
  const days = daysUntilDue(item.dueAt);
  if (days <= 1) return t('mistakes.dueTomorrow');
  return t('mistakes.dueIn', { n: days });
}

/// Box progress as pips rather than a bar: the schedule has a small, countable
/// number of steps, and five filled dots say "two more to go" in a way a
/// percentage does not.
function Pips({ box, maxBox, color }) {
  const T = useTheme();
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {Array.from({ length: maxBox }, (_, i) => (
        <div key={i} style={{
          width: 6, height: 6, borderRadius: 3,
          background: i < box ? color : T.surface2,
        }} />
      ))}
    </div>
  );
}

function MistakeRow({ item }) {
  const T = useTheme();
  const { t } = useI18n();
  const accent = item.mastered ? T.success : item.due ? T.danger : T.warn;

  return (
    <div style={{
      background: T.surface, border: `0.5px solid ${T.stroke}`, borderRadius: 14, padding: 14,
      borderLeft: `4px solid ${accent}`,
      opacity: item.mastered ? 0.7 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 10, fontWeight: 800, color: T.textDim, letterSpacing: 0.4,
          textTransform: 'uppercase',
        }}>{item.topicTitle}</span>
        <span style={{
          marginLeft: 'auto', padding: '3px 8px', borderRadius: 8,
          background: hexA(accent, 0.15), color: accent,
          fontSize: 10, fontWeight: 800, letterSpacing: 0.3, whiteSpace: 'nowrap',
        }}>{dueLabel(item, t)}</span>
      </div>

      <div style={{ fontSize: 14, fontWeight: 700, color: T.text, lineHeight: 1.35 }}>
        {item.text}
      </div>

      <div style={{ fontSize: 12.5, color: T.success, marginTop: 8, lineHeight: 1.4 }}>
        <strong>{t('mistakes.correctAnswer')}:</strong> {item.correctAnswer}
      </div>

      <div style={{
        marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        fontSize: 11, color: T.textDim, fontWeight: 600,
      }}>
        <Pips box={item.box} maxBox={item.maxBox} color={accent} />
        <span>{t('mistakes.step', { a: item.box, b: item.maxBox })}</span>
        <span style={{ color: T.danger }}>· {t('mistakes.wrongTimes', { n: item.wrongCount })}</span>
      </div>
    </div>
  );
}

export default function Mistakes() {
  const T = useTheme();
  const { t, locale } = useI18n();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('open');
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api.reviews(locale, filter).then(setData).catch(setError);
  }, [locale, filter]);

  useEffect(load, [load]);

  async function startReview() {
    setStarting(true);
    setError(null);
    try {
      const s = await api.createSession({ mode: 'review' });
      navigate(`/session/${s.id}`);
    } catch (err) {
      setError(err);
      setStarting(false);
    }
  }

  if (error && !data) {
    return (
      <Screen scroll>
        <div style={{ padding: 24 }}>
          <ErrorNote error={error} onRetry={load} retryLabel={t('common.retry')} />
        </div>
      </Screen>
    );
  }
  if (!data) return <Loading label={t('common.loading')} />;

  const { counts, items } = data;
  const nothingEverWrong = counts.open === 0 && counts.mastered === 0;

  const filters = [
    { id: 'open', label: `${t('mistakes.filterOpen')} (${counts.open})` },
    { id: 'due', label: `${t('mistakes.filterDue')} (${counts.due})` },
    { id: 'mastered', label: `${t('mistakes.filterMastered')} (${counts.mastered})` },
    { id: 'all', label: t('mistakes.filterAll') },
  ];

  return (
    <Screen>
      <ScreenHeader
        title={t('mistakes.title')}
        eyebrow={t('mistakes.subtitle', { n: counts.open + counts.mastered }).toUpperCase()}
      />

      {nothingEverWrong ? (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', textAlign: 'center', padding: 40, gap: 16,
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20,
            background: hexA(T.success, 0.14),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="check" size={34} color={T.success} strokeWidth={2.4} />
          </div>
          <div style={{ fontSize: 14, color: T.textDim, lineHeight: 1.5, maxWidth: 380 }}>
            {t('mistakes.empty')}
          </div>
        </div>
      ) : (
        <>
          {/* Drill CTA — only when something is actually owed */}
          <div style={{ flex: 'none', padding: '14px 16px 4px' }}>
            {counts.due > 0 ? (
              <PrimaryButton onClick={startReview} disabled={starting} icon="quiz">
                {t('mistakes.start')} · {t('mistakes.startCount', { n: counts.due })}
              </PrimaryButton>
            ) : (
              <div style={{
                padding: '12px 14px', borderRadius: 14,
                background: hexA(T.success, T.dark ? 0.14 : 0.1),
                border: `0.5px solid ${hexA(T.success, 0.35)}`,
                color: T.text, fontSize: 13, lineHeight: 1.45,
                display: 'flex', gap: 10, alignItems: 'center',
              }}>
                <Icon name="check" size={18} color={T.success} strokeWidth={2.4} />
                <span>{t('mistakes.allClear')}</span>
              </div>
            )}
            <ErrorNote error={error} />
          </div>

          <div style={{ flex: 'none', padding: '10px 16px 4px', display: 'flex', gap: 6 }}>
            {filters.map((f) => (
              <button key={f.id} onClick={() => setFilter(f.id)} style={{
                flex: 1, padding: '8px 4px', border: 'none', cursor: 'pointer', borderRadius: 10,
                fontFamily: 'inherit', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                background: filter === f.id ? T.text : T.surface,
                color: filter === f.id ? T.bg : T.textDim,
              }}>{f.label}</button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: T.textDim, fontSize: 14 }}>
                {t('mistakes.emptyFiltered')}
              </div>
            ) : (
              <>
                {items.map((it) => <MistakeRow key={it.questionId} item={it} />)}
                <div style={{
                  marginTop: 6, padding: '12px 14px', borderRadius: 12,
                  background: T.surface2, color: T.textDim, fontSize: 12, lineHeight: 1.5,
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                }}>
                  <Icon name="quiz" size={15} color={T.textDim} strokeWidth={2} />
                  <span>{t('mistakes.howItWorks', { n: items[0]?.maxBox ?? 5 })}</span>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </Screen>
  );
}
