import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useI18n } from '../i18n/index.jsx';
import { useTheme, hexA } from '../design/theme.jsx';
import { Icon } from '../design/Icon.jsx';
import { ErrorNote, Loading, Screen, ScreenHeader, Segmented, Spinner } from '../design/primitives.jsx';

// Answer review, ported from the prototype's MockReview and extended to cover
// practice sessions too — the screen is the same job either way.
//
// Explanations are fetched per question on tap, not up front: generating
// twenty of them would be slow and would spend money on the nineteen nobody
// opens.

function ReviewItem({ item, sessionId }) {
  const T = useTheme();
  const { t, locale } = useI18n();
  const [explain, setExplain] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const q = item.question;
  const correctOption = q.options.find((o) => o.isCorrect);
  const chosen = q.options.find((o) => o.id === item.chosenOptionId);
  const skipped = !item.chosenOptionId;
  const ok = item.isCorrect === true;
  const note = locale === 'ru' ? q.sourceNoteRu : q.sourceNoteUz;
  const label = (o) => (locale === 'ru' ? o?.textRu : o?.textUz);

  async function askWhy() {
    setBusy(true);
    setError(null);
    try {
      setExplain(await api.explain(q.id, {
        locale,
        wrongOptionId: ok || skipped ? undefined : item.chosenOptionId,
      }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const accent = ok ? T.success : skipped ? T.warn : T.danger;

  return (
    <div style={{
      background: T.surface, border: `0.5px solid ${T.stroke}`, borderRadius: 14, padding: 14,
      borderLeft: `4px solid ${accent}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: T.textDim, letterSpacing: 0.4, fontVariantNumeric: 'tabular-nums' }}>
          Q{item.order + 1}
        </div>
        <div style={{
          marginLeft: 'auto', padding: '3px 8px', borderRadius: 8,
          background: hexA(accent, 0.15), color: accent,
          fontSize: 10, fontWeight: 800, letterSpacing: 0.3,
        }}>
          {ok ? t('common.correct') : skipped ? t('mock.unanswered') : t('common.notQuite')}
        </div>
      </div>

      <div style={{ fontSize: 14, fontWeight: 700, color: T.text, lineHeight: 1.35 }}>
        {locale === 'ru' ? q.textRu : q.textUz}
      </div>

      {!skipped && !ok && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: T.danger, lineHeight: 1.4 }}>
          <strong>{t('mock.yourAnswer')}:</strong> {label(chosen)}
        </div>
      )}
      <div style={{ marginTop: 8, fontSize: 12.5, color: T.success, lineHeight: 1.4 }}>
        <strong>{t('mock.correctAnswer')}:</strong> {label(correctOption)}
      </div>

      {note && (
        <div style={{
          marginTop: 8, fontSize: 12.5, color: T.textDim, lineHeight: 1.45,
          padding: 10, background: T.surface2, borderRadius: 10,
        }}>{note}</div>
      )}

      {explain && (
        <div style={{ marginTop: 8, padding: 10, background: T.surface2, borderRadius: 10 }}>
          <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.5 }}>{explain.explanation}</div>
          {explain.keyRule && (
            <div style={{ fontSize: 12, color: T.textDim, marginTop: 6, lineHeight: 1.45 }}>
              <strong>{t('quiz.keyRule')}:</strong> {explain.keyRule}
            </div>
          )}
          {explain.commonMistake && !ok && (
            <div style={{ fontSize: 12, color: T.textDim, marginTop: 6, lineHeight: 1.45 }}>
              <strong>{t('quiz.commonMistake')}:</strong> {explain.commonMistake}
            </div>
          )}
          {explain.sources?.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {explain.sources.map((c) => (
                <span key={c} style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                  background: T.surface, border: `0.5px solid ${T.stroke}`, color: T.textDim,
                }}>{c}</span>
              ))}
            </div>
          )}
        </div>
      )}

      <ErrorNote error={error} />

      {!explain && (
        <button onClick={askWhy} disabled={busy} style={{
          marginTop: 10, border: 'none', background: 'transparent', color: T.a,
          fontSize: 12.5, fontWeight: 800, cursor: busy ? 'default' : 'pointer',
          fontFamily: 'inherit', padding: 0, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {busy ? <Spinner size={13} /> : <Icon name="sparkle" size={14} color={T.a} strokeWidth={2.2} />}
          {busy ? t('quiz.explaining') : t('quiz.explain')}
        </button>
      )}
    </div>
  );
}

export default function Review() {
  const { id } = useParams();
  const T = useTheme();
  const { t } = useI18n();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('wrong');

  useEffect(() => { api.getSession(id).then(setSession).catch(setError); }, [id]);

  const items = useMemo(() => {
    if (!session) return [];
    return session.items.filter((it) => {
      const skipped = !it.chosenOptionId;
      if (filter === 'wrong') return !it.isCorrect && !skipped;
      if (filter === 'skipped') return skipped;
      return true;
    });
  }, [session, filter]);

  if (error && !session) {
    return (
      <Screen scroll>
        <div style={{ padding: 24 }}><ErrorNote error={error} /></div>
      </Screen>
    );
  }
  if (!session) return <Loading label={t('common.loading')} />;

  const wrongCount = session.items.filter((it) => !it.isCorrect && it.chosenOptionId).length;
  const skippedCount = session.items.filter((it) => !it.chosenOptionId).length;

  return (
    <Screen>
      <ScreenHeader title={t('review.title')} onBack={() => navigate(-1)} />

      <div style={{ padding: '12px 16px 4px', flex: 'none' }}>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'all', label: `${t('review.all')} (${session.items.length})` },
            { id: 'wrong', label: `${t('review.wrong')} (${wrongCount})` },
            { id: 'skipped', label: `${t('review.skipped')} (${skippedCount})` },
          ]}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: T.textDim, fontSize: 14 }}>
            {t('review.empty')}
          </div>
        ) : (
          items.map((it) => <ReviewItem key={it.id} item={it} sessionId={id} />)
        )}
      </div>
    </Screen>
  );
}
