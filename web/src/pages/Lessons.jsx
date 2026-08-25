import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useI18n } from '../i18n/index.jsx';
import { useTheme } from '../design/theme.jsx';
import { Icon } from '../design/Icon.jsx';
import { RoadSign, signForTopic } from '../design/RoadSign.jsx';
import { ErrorNote, Loading, Screen, ScreenHeader } from '../design/primitives.jsx';
import { MASTERED_AT } from '../lib/progress.js';

// Topic list, ported from the prototype's LessonsList + ModuleRow. The
// prototype's six hardcoded modules are the real topics with real mastery.
// MASTERED_AT is shared with the road so a topic cannot read "done" on one
// screen and "in progress" on the other.

export function ModuleRow({ topic, onClick }) {
  const T = useTheme();
  const { t } = useI18n();
  const p = topic.progress;
  const started = (p?.attempts ?? 0) > 0;
  const score = p?.score ?? 0;
  const done = started && score >= MASTERED_AT;
  const empty = topic.questionCount === 0;

  return (
    <button onClick={onClick} disabled={empty} style={{
      background: T.surface, borderRadius: 16, padding: 12,
      display: 'flex', alignItems: 'center', gap: 12,
      cursor: empty ? 'default' : 'pointer', fontFamily: 'inherit', textAlign: 'left',
      border: `0.5px solid ${T.stroke}`, opacity: empty ? 0.55 : 1, width: '100%',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12, flex: 'none',
        background: T.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center',
        filter: empty ? 'grayscale(1)' : 'none',
      }}>
        {empty
          ? <Icon name="lock" size={18} color={T.textDim} />
          : <RoadSign kind={signForTopic(topic.slug, topic.order)} size={36} />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: -0.2 }}>{topic.title}</div>
        <div style={{ fontSize: 12, color: T.textDim, marginTop: 2 }}>
          {done
            ? t('lessons.completed')
            : started
              ? `${Math.round(score * 100)}% · ${t('lessons.inProgress')}`
              : t('lessons.count', { n: topic.questionCount })}
          {p?.weak && !done && ` · ${t('lessons.weak')}`}
        </div>
        {started && (
          <div style={{ marginTop: 6, height: 4, background: T.surface2, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: `${score * 100}%`, height: '100%', borderRadius: 2,
              background: done ? T.success : p?.weak ? T.warn : T.a,
            }} />
          </div>
        )}
      </div>

      {done ? (
        <div style={{
          width: 22, height: 22, borderRadius: 11, flex: 'none', background: T.success,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="check" size={13} color="#fff" strokeWidth={3} />
        </div>
      ) : (
        <Icon name="chevron" size={18} color={T.textFaint} />
      )}
    </button>
  );
}

export default function Lessons() {
  const T = useTheme();
  const { t, locale } = useI18n();
  const navigate = useNavigate();

  const [topics, setTopics] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  const load = useCallback(() => {
    setError(null);
    api.topics(locale).then(setTopics).catch(setError);
  }, [locale]);

  useEffect(load, [load]);

  const filters = [
    { id: 'all', label: t('lessons.filterAll') },
    { id: 'progress', label: t('lessons.filterInProgress') },
    { id: 'new', label: t('lessons.filterNotStarted') },
    { id: 'weak', label: t('lessons.filterWeak') },
  ];

  const shown = useMemo(() => {
    if (!topics) return [];
    return topics.filter((tp) => {
      const p = tp.progress;
      const started = (p?.attempts ?? 0) > 0;
      const done = started && (p?.score ?? 0) >= MASTERED_AT;
      if (filter === 'progress') return started && !done;
      if (filter === 'new') return !started;
      if (filter === 'weak') return !!p?.weak;
      return true;
    });
  }, [topics, filter]);

  if (error && !topics) {
    return (
      <Screen scroll>
        <div style={{ padding: 24 }}>
          <ErrorNote error={error} onRetry={load} retryLabel={t('common.retry')} />
        </div>
      </Screen>
    );
  }
  if (!topics) return <Loading label={t('common.loading')} />;

  const totalQuestions = topics.reduce((sum, x) => sum + x.questionCount, 0);

  return (
    <Screen>
      <ScreenHeader
        title={t('lessons.title')}
        eyebrow={t('lessons.summary', { lessons: totalQuestions, modules: topics.length }).toUpperCase()}
      />

      <div style={{ padding: '12px 16px 4px', display: 'flex', gap: 6, flex: 'none' }}>
        {filters.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            flex: 1, padding: '8px 4px', border: 'none', cursor: 'pointer', borderRadius: 10,
            fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
            background: filter === f.id ? T.text : T.surface,
            color: filter === f.id ? T.bg : T.textDim,
          }}>{f.label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shown.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: T.textDim, fontSize: 14 }}>
            {t('lessons.none')}
          </div>
        ) : (
          shown.map((tp) => (
            <ModuleRow key={tp.id} topic={tp} onClick={() => navigate(`/lesson/${tp.id}`)} />
          ))
        )}
      </div>
    </Screen>
  );
}
