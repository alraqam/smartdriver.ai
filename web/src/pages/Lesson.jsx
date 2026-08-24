import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useI18n } from '../i18n/index.jsx';
import { useTheme, hexA } from '../design/theme.jsx';
import { Icon } from '../design/Icon.jsx';
import { RoadSign, signForTopic } from '../design/RoadSign.jsx';
import { BackButton, ErrorNote, Loading, PrimaryButton } from '../design/primitives.jsx';

// Lesson detail, ported from the prototype's LessonScreen.
//
// The prototype hardcoded three rules of body copy. Here the rules are the real
// RuleSection rows the topic's questions cite, newest-first by how many
// questions lean on each — so the rule that actually defines the topic leads,
// and importing more questions deepens the lesson without anyone rewriting it.

function Rule({ num, code, title, body, count, countLabel }) {
  const T = useTheme();
  return (
    <div style={{
      marginTop: 12, padding: 14, borderRadius: 16,
      background: T.surface, border: `0.5px solid ${T.stroke}`,
      display: 'flex', gap: 12,
    }}>
      <div style={{
        flex: '0 0 auto', width: 32, height: 32, borderRadius: 8,
        background: hexA(T.a, 0.12), color: T.a,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 800, letterSpacing: 0.2,
      }}>{num}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, letterSpacing: -0.2 }}>{title}</div>
          <span style={{
            fontSize: 10, fontWeight: 700, color: T.textDim, fontVariantNumeric: 'tabular-nums',
            padding: '2px 6px', borderRadius: 6, background: T.surface2,
          }}>{code}</span>
        </div>
        <div style={{ fontSize: 13, color: T.textDim, marginTop: 5, lineHeight: 1.5 }}>{body}</div>
        {count > 0 && (
          <div style={{ fontSize: 11, color: T.textFaint, marginTop: 6, fontWeight: 600 }}>
            {countLabel}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Lesson() {
  const { id } = useParams();
  const T = useTheme();
  const { t, locale } = useI18n();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [topic, setTopic] = useState(null);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(() => {
    setError(null);
    Promise.all([api.topicRules(id, locale), api.topics(locale)])
      .then(([rules, topics]) => {
        setData(rules);
        setTopic(topics.find((x) => x.id === id) ?? null);
      })
      .catch(setError);
  }, [id, locale]);

  useEffect(load, [load]);

  async function startPractice() {
    setStarting(true);
    setError(null);
    try {
      const s = await api.createSession({ mode: 'practice', topicId: id, count: 10 });
      navigate(`/session/${s.id}`);
    } catch (err) {
      setError(err);
      setStarting(false);
    }
  }

  if (error && !data) {
    return (
      <div style={{ position: 'absolute', inset: 0, background: T.bg, padding: 24, overflow: 'auto' }}>
        <BackButton onClick={() => navigate(-1)} />
        <ErrorNote error={error} onRetry={load} retryLabel={t('common.retry')} />
      </div>
    );
  }
  if (!data) return <Loading label={t('common.loading')} />;

  const sign = signForTopic(data.topic.slug, topic?.order ?? 0);
  const p = topic?.progress;

  return (
    <div style={{ position: 'absolute', inset: 0, background: T.bg, display: 'flex', flexDirection: 'column' }}>
      {/* Hero */}
      <div style={{
        flex: 'none', padding: '22px 20px 20px',
        background: `linear-gradient(160deg, ${hexA(T.a, T.dark ? 0.3 : 0.14)}, transparent)`,
      }}>
        <BackButton onClick={() => navigate(-1)} />
        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 80, height: 80, borderRadius: 18, flex: 'none', background: T.surface,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 6px 18px rgba(0,0,0,0.1)',
          }}>
            <RoadSign kind={sign} size={60} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.a, letterSpacing: 0.6 }}>
              {t('lesson.eyebrow')}
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: T.text, letterSpacing: -0.5, marginTop: 2 }}>
              {data.topic.title}
            </div>
            <div style={{ fontSize: 13, color: T.textDim, marginTop: 3 }}>
              {t('lesson.questionsAvailable', { n: data.questionCount })}
              {p && p.attempts > 0 && ` · ${Math.round(p.score * 100)}%`}
            </div>
          </div>
        </div>
      </div>

      {/* Rules */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
        <ErrorNote error={error} />
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: -0.2, marginTop: 4 }}>
          {t('lesson.rulesTitle')}
        </div>

        {data.rules.length === 0 ? (
          <div style={{
            marginTop: 12, padding: 16, borderRadius: 16,
            background: T.surface, border: `0.5px dashed ${T.stroke}`,
            color: T.textDim, fontSize: 13, lineHeight: 1.5,
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <Icon name="book" size={18} color={T.textDim} />
            <span>{t('lesson.noRules')}</span>
          </div>
        ) : (
          data.rules.map((r, i) => (
            <Rule
              key={r.code}
              num={String(i + 1).padStart(2, '0')}
              code={r.code}
              title={r.title}
              body={r.body}
              count={r.questionCount}
              countLabel={t('lesson.ruleQuestions', { n: r.questionCount })}
            />
          ))
        )}
      </div>

      {/* CTA */}
      <div style={{ flex: 'none', padding: '12px 16px 20px', borderTop: `0.5px solid ${T.stroke}`, background: T.surface }}>
        <PrimaryButton onClick={startPractice} disabled={starting || data.questionCount === 0} icon="quiz">
          {t('lesson.startPractice')}
        </PrimaryButton>
      </div>
    </div>
  );
}
