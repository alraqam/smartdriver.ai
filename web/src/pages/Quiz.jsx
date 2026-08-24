import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useI18n } from '../i18n/index.jsx';
import { useTheme, hexA } from '../design/theme.jsx';
import { Icon } from '../design/Icon.jsx';
import { RoadSign } from '../design/RoadSign.jsx';
import { ErrorNote, Loading, Spinner } from '../design/primitives.jsx';

// Practice quiz, ported from the prototype's QuizScreen.
//
// Differences from the prototype, all forced by this being a real app:
//   · questions come from the session the server built, not a literal array
//   · there are no "hearts" — a lives mechanic that ends a study session early
//     is hostile in exam prep, and there is nothing behind it in the data
//   · "Why?" calls the real explanation endpoint

export default function Quiz() {
  const { id } = useParams();
  const T = useTheme();
  const { t, locale } = useI18n();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [explain, setExplain] = useState(null);
  const [explaining, setExplaining] = useState(false);
  const startedAt = useRef(Date.now());

  const load = useCallback(() => {
    api.getSession(id)
      .then((s) => {
        if (s.finishedAt) { navigate(`/result/${id}`, { replace: true }); return; }
        setSession(s);
        const next = s.items.findIndex((it) => !it.answeredAt);
        setIndex(next === -1 ? s.items.length - 1 : next);
      })
      .catch(setError);
  }, [id, navigate]);

  useEffect(load, [load]);

  const item = session?.items[index];
  const total = session?.items.length ?? 0;
  const answered = !!feedback;

  async function choose(opt) {
    if (busy || answered) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.answer(id, {
        itemId: item.id,
        optionId: opt.id,
        msSpent: Date.now() - startedAt.current,
      });
      setFeedback({ ...res, chosenOptionId: opt.id });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    if (index + 1 >= total) {
      setBusy(true);
      try {
        await api.finish(id);
        navigate(`/result/${id}`, { replace: true });
      } catch (err) {
        setError(err);
        setBusy(false);
      }
      return;
    }
    setFeedback(null);
    setExplain(null);
    startedAt.current = Date.now();
    setIndex((i) => i + 1);
  }

  async function askWhy() {
    setExplaining(true);
    setError(null);
    try {
      setExplain(await api.explain(item.question.id, {
        locale,
        wrongOptionId: feedback?.isCorrect ? undefined : feedback?.chosenOptionId,
      }));
    } catch (err) {
      setError(err);
    } finally {
      setExplaining(false);
    }
  }

  if (error && !session) {
    return (
      <div style={{ position: 'absolute', inset: 0, background: T.bg, padding: 24, overflow: 'auto' }}>
        <ErrorNote error={error} onRetry={load} retryLabel={t('common.retry')} />
      </div>
    );
  }
  if (!session || !item) return <Loading label={t('common.loading')} />;

  const q = item.question;
  const text = locale === 'ru' ? q.textRu : q.textUz;
  const note = locale === 'ru' ? q.sourceNoteRu : q.sourceNoteUz;
  const isCorrect = feedback?.isCorrect;

  return (
    <div style={{ position: 'absolute', inset: 0, background: T.bg, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ flex: 'none', padding: '20px 16px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => { if (confirm(t('quiz.exitConfirm'))) navigate('/'); }}
          aria-label={t('common.close')}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 6, display: 'flex' }}
        >
          <Icon name="close" size={24} color={T.textDim} />
        </button>
        <div style={{ flex: 1, height: 10, background: T.surface2, borderRadius: 5, overflow: 'hidden' }}>
          <div style={{
            width: `${((index + (answered ? 1 : 0)) / total) * 100}%`, height: '100%', borderRadius: 5,
            background: `linear-gradient(90deg, ${T.a}, ${T.b})`, transition: 'width 0.4s',
          }} />
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, color: T.textDim, fontVariantNumeric: 'tabular-nums' }}>
          {index + 1}/{total}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px 24px' }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: T.textDim, letterSpacing: 0.5 }}>
          {t('quiz.questionXofY', { a: index + 1, b: total })}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: T.text, letterSpacing: -0.4, lineHeight: 1.25, marginTop: 6 }}>
          {text}
        </div>

        {q.imageUrl && (
          <div style={{
            marginTop: 18, height: 170, borderRadius: 20, overflow: 'hidden',
            background: T.surface, border: `0.5px solid ${T.stroke}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
          }}>
            <div style={{
              position: 'absolute', inset: 0, opacity: 0.35,
              backgroundImage: `radial-gradient(${T.textFaint} 1px, transparent 1px)`,
              backgroundSize: '16px 16px',
            }} />
            <img src={q.imageUrl} alt="" style={{ maxHeight: '100%', maxWidth: '100%', position: 'relative' }} />
          </div>
        )}

        <ErrorNote error={error} />

        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {q.options.map((o, idx) => {
            const picked = feedback?.chosenOptionId === o.id;
            const correct = answered && (o.isCorrect || o.id === feedback?.correctOptionId);
            let bg = T.surface, bc = T.stroke, ind = null;
            if (answered) {
              if (correct) { bg = hexA(T.success, T.dark ? 0.18 : 0.1); bc = T.success; ind = 'check'; }
              else if (picked) { bg = hexA(T.danger, T.dark ? 0.18 : 0.1); bc = T.danger; ind = 'close'; }
            } else if (picked) { bg = hexA(T.a, 0.1); bc = T.a; }

            return (
              <button key={o.id} onClick={() => choose(o)} disabled={answered || busy} style={{
                border: `1.5px solid ${bc}`, background: bg, color: T.text,
                padding: 14, borderRadius: 14, textAlign: 'left',
                cursor: answered ? 'default' : 'pointer', fontFamily: 'inherit',
                fontSize: 15, fontWeight: 600, letterSpacing: -0.15, lineHeight: 1.3,
                display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.15s',
              }}>
                <div style={{
                  flex: '0 0 auto', width: 24, height: 24, borderRadius: 12,
                  border: `1.5px solid ${ind ? (correct ? T.success : T.danger) : T.textFaint}`,
                  background: ind ? (correct ? T.success : T.danger) : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: ind ? '#fff' : T.textDim,
                }}>
                  {ind ? <Icon name={ind} size={14} color="#fff" strokeWidth={3} /> : String.fromCharCode(65 + idx)}
                </div>
                <span style={{ flex: 1 }}>{locale === 'ru' ? o.textRu : o.textUz}</span>
              </button>
            );
          })}
        </div>

        {answered && (
          <div style={{
            marginTop: 16, padding: 14, borderRadius: 14,
            background: isCorrect ? hexA(T.success, 0.1) : hexA(T.warn, 0.12),
            border: `0.5px solid ${isCorrect ? T.success : T.warn}`,
            display: 'flex', gap: 10,
          }}>
            <div style={{
              flex: '0 0 auto', width: 22, height: 22, borderRadius: 11,
              background: isCorrect ? T.success : T.warn,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name={isCorrect ? 'check' : 'quiz'} size={13} color="#fff" strokeWidth={3} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: T.text, letterSpacing: -0.1 }}>
                {isCorrect ? t('common.correct') : t('common.notQuite')}
              </div>
              {note && (
                <div style={{ fontSize: 13, color: T.textDim, marginTop: 3, lineHeight: 1.45 }}>{note}</div>
              )}

              {explain && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `0.5px solid ${T.stroke}` }}>
                  <div style={{ fontSize: 13, color: T.text, lineHeight: 1.5 }}>{explain.explanation}</div>
                  {explain.keyRule && (
                    <>
                      <div style={{ fontSize: 10, fontWeight: 800, color: T.textFaint, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 10 }}>
                        {t('quiz.keyRule')}
                      </div>
                      <div style={{ fontSize: 13, color: T.textDim, marginTop: 2, lineHeight: 1.45 }}>{explain.keyRule}</div>
                    </>
                  )}
                  {explain.commonMistake && !isCorrect && (
                    <>
                      <div style={{ fontSize: 10, fontWeight: 800, color: T.textFaint, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 10 }}>
                        {t('quiz.commonMistake')}
                      </div>
                      <div style={{ fontSize: 13, color: T.textDim, marginTop: 2, lineHeight: 1.45 }}>{explain.commonMistake}</div>
                    </>
                  )}
                  {explain.sources?.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
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

              {!explain && (
                <button onClick={askWhy} disabled={explaining} style={{
                  marginTop: 8, border: 'none', background: 'transparent', color: T.a,
                  fontSize: 13, fontWeight: 800, cursor: explaining ? 'default' : 'pointer',
                  fontFamily: 'inherit', padding: 0, display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {explaining ? <Spinner size={13} /> : <Icon name="sparkle" size={14} color={T.a} strokeWidth={2.2} />}
                  {explaining ? t('quiz.explaining') : t('quiz.explain')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ flex: 'none', padding: '12px 16px 20px', borderTop: `0.5px solid ${T.stroke}`, background: T.surface }}>
        <button onClick={answered ? next : undefined} disabled={!answered || busy} style={{
          width: '100%', border: 'none',
          background: answered ? T.a : T.surface2,
          color: answered ? '#fff' : T.textFaint,
          padding: 15, borderRadius: 14, fontSize: 15, fontWeight: 800, letterSpacing: 0.3,
          cursor: answered ? 'pointer' : 'default', fontFamily: 'inherit',
          boxShadow: answered ? `0 8px 20px ${hexA(T.a, 0.35)}` : 'none',
        }}>
          {!answered ? t('common.selectAnswer') : index + 1 >= total ? t('common.finish') : t('common.continue')}
        </button>
      </div>
    </div>
  );
}
