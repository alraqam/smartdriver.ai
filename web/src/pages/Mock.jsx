import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useI18n } from '../i18n/index.jsx';
import { useTheme, hexA } from '../design/theme.jsx';
import { Icon } from '../design/Icon.jsx';
import { ErrorNote, GhostButton, Loading, PrimaryButton, Ring, Screen } from '../design/primitives.jsx';

// Mock exam, ported from the prototype's MockIntro / MockRunner / MockResult /
// MockReview.
//
// The prototype ran off a 20-question array in the bundle. This runs a real
// `exam` session: the server picks the questions (spread across every topic),
// owns the clock, and scores it. Answers stay revisable until submission —
// which the API now supports specifically because this runner needs it.

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────
// Intro
// ─────────────────────────────────────────────────────────────

export function MockIntro() {
  const T = useTheme();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [exam, setExam] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { api.examConfig().then(setExam).catch(setError); }, []);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const s = await api.createSession({ mode: 'exam' });
      navigate(`/mock/run/${s.id}`, { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <Screen>
      <div style={{
        flex: 1, overflowY: 'auto', padding: '40px 28px 20px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
      }}>
        <div style={{
          width: 110, height: 110, borderRadius: 28, flex: 'none',
          background: `linear-gradient(135deg, ${T.a}, ${T.b})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 18px 40px ${hexA(T.a, 0.4)}`, marginBottom: 24,
        }}>
          <Icon name="timer" size={52} color="#fff" strokeWidth={2.2} />
        </div>

        <div style={{ fontSize: 12, fontWeight: 800, color: T.a, letterSpacing: 1 }}>
          {t('mock.title').toUpperCase()}
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, color: T.text, letterSpacing: -0.6, marginTop: 6 }}>
          {t('mock.ready')}
        </div>
        <div style={{ fontSize: 14, color: T.textDim, marginTop: 10, lineHeight: 1.5, maxWidth: 380 }}>
          {exam
            ? t('mock.brief', {
                n: exam.questionCount,
                m: Math.round(exam.timeLimitSec / 60),
                max: exam.maxErrors,
              })
            : ''}
        </div>

        <div style={{ marginTop: 24, width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[t('mock.rules1'), t('mock.rules2'), t('mock.rules3')].map((r, i) => (
            <div key={i} style={{
              padding: '12px 14px', borderRadius: 12,
              background: T.surface, border: `0.5px solid ${T.stroke}`,
              display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
            }}>
              <div style={{
                flex: '0 0 auto', width: 22, height: 22, borderRadius: 11,
                background: hexA(T.a, 0.15), color: T.a,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800,
              }}>{i + 1}</div>
              <div style={{ fontSize: 13, color: T.text, lineHeight: 1.35 }}>{r}</div>
            </div>
          ))}
        </div>

        <div style={{ width: '100%', maxWidth: 420 }}><ErrorNote error={error} /></div>
      </div>

      <div style={{ flex: 'none', padding: '12px 20px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <PrimaryButton onClick={start} disabled={busy || !exam}>{t('mock.start')}</PrimaryButton>
        <button onClick={() => navigate('/')} style={{
          width: '100%', border: 'none', background: 'transparent', color: T.textDim,
          padding: 12, borderRadius: 16, fontSize: 14, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>{t('mock.cancel')}</button>
      </div>
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────
// Sheets
// ─────────────────────────────────────────────────────────────

function Sheet({ children, onClose }) {
  const T = useTheme();
  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-end', animation: 'sdai-fade-in 0.15s ease-out',
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxHeight: '88%', background: T.bg,
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        display: 'flex', flexDirection: 'column',
        animation: 'sdai-slide-up 0.25s ease-out',
      }}>
        <div style={{ width: 36, height: 4, background: T.textFaint, borderRadius: 2, margin: '12px auto 8px', flex: 'none' }} />
        {children}
      </div>
    </div>
  );
}

function ConfirmSheet({ title, body, yes, no, onYes, onNo }) {
  const T = useTheme();
  return (
    <Sheet onClose={onNo}>
      <div style={{ padding: '8px 22px 28px' }}>
        <div style={{ fontSize: 19, fontWeight: 800, color: T.text, letterSpacing: -0.3 }}>{title}</div>
        <div style={{ fontSize: 14, color: T.textDim, marginTop: 6, lineHeight: 1.45 }}>{body}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <GhostButton onClick={onNo}>{no}</GhostButton>
          <button onClick={onYes} style={{
            flex: 1, border: 'none', background: T.aFill, color: '#fff',
            padding: 13, borderRadius: 14, fontSize: 14, fontWeight: 800,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>{yes}</button>
        </div>
      </div>
    </Sheet>
  );
}

function Legend({ color, label, hollow }) {
  const T = useTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{
        width: 12, height: 12, borderRadius: 4,
        background: hollow ? 'transparent' : color,
        border: hollow ? `1px solid ${T.stroke}` : 'none',
      }} />
      <span>{label}</span>
    </div>
  );
}

function Palette({ items, answers, marked, current, onPick, onClose, onSubmit }) {
  const T = useTheme();
  const { t } = useI18n();
  const answeredCount = items.filter((it) => answers[it.id] !== undefined).length;
  const markedCount = Object.values(marked).filter(Boolean).length;

  return (
    <Sheet onClose={onClose}>
      <div style={{ padding: '4px 18px 24px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: T.text, letterSpacing: -0.3 }}>{t('mock.jump')}</div>

        <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11, color: T.textDim, flexWrap: 'wrap' }}>
          <Legend color={T.a} label={`${answeredCount}`} />
          <Legend hollow label={`${items.length - answeredCount} ${t('mock.unanswered').toLowerCase()}`} />
          <Legend color={T.warn} label={`${markedCount} ${t('mock.marked').toLowerCase()}`} />
        </div>

        <div style={{
          marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))',
          gap: 8, overflowY: 'auto', paddingRight: 2,
        }}>
          {items.map((it, n) => {
            const answered = answers[it.id] !== undefined;
            const isCurrent = n === current;
            return (
              <button key={it.id} onClick={() => onPick(n)} style={{
                aspectRatio: '1 / 1', position: 'relative',
                border: isCurrent ? `2px solid ${T.text}` : `1px solid ${T.stroke}`,
                background: answered ? T.aFill : T.surface,
                color: answered ? '#fff' : T.text,
                borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
              }}>
                {n + 1}
                {marked[it.id] && (
                  <div style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: 4, background: T.warn }} />
                )}
              </button>
            );
          })}
        </div>

        <button onClick={onSubmit} style={{
          marginTop: 14, flex: 'none', border: 'none', background: T.successFill, color: '#fff',
          padding: 14, borderRadius: 14, fontSize: 14, fontWeight: 800, letterSpacing: 0.3,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>{t('mock.submit')}</button>
      </div>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────

export function MockRunner() {
  const { id } = useParams();
  const T = useTheme();
  const { t, locale } = useI18n();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [marked, setMarked] = useState({});
  const [secs, setSecs] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [error, setError] = useState(null);
  const submitting = useRef(false);

  const submit = useCallback(async () => {
    if (submitting.current) return;
    submitting.current = true;
    try {
      await api.finish(id);
      navigate(`/mock/result/${id}`, { replace: true });
    } catch (err) {
      submitting.current = false;
      setError(err);
    }
  }, [id, navigate]);

  useEffect(() => {
    api.getSession(id)
      .then((s) => {
        if (s.finishedAt) { navigate(`/mock/result/${id}`, { replace: true }); return; }
        setSession(s);
        setSecs(s.secondsLeft);
        // Restore what was already answered, so a refresh mid-exam does not
        // look like the paper was wiped.
        const restored = {};
        s.items.forEach((it) => { if (it.chosenOptionId) restored[it.id] = it.chosenOptionId; });
        setAnswers(restored);
        const next = s.items.findIndex((it) => !it.chosenOptionId);
        setIndex(next === -1 ? 0 : next);
      })
      .catch(setError);
  }, [id, navigate]);

  // The server is the authority on time — it refuses a late answer and closes
  // the session itself. This is the visible clock and the nudge to the result.
  useEffect(() => {
    if (secs === null || secs === undefined) return;
    if (secs <= 0) { submit(); return; }
    const timer = setInterval(() => setSecs((s) => (s === null ? null : Math.max(0, s - 1))), 1000);
    return () => clearInterval(timer);
  }, [secs, submit]);

  const items = session?.items ?? [];
  const item = items[index];
  const total = items.length;
  const answeredCount = Object.keys(answers).length;

  async function choose(optionId) {
    if (!item) return;
    // Optimistic: an exam has no per-answer feedback to wait for, and a
    // round-trip lag on every tap would make the paper feel broken.
    setAnswers((a) => ({ ...a, [item.id]: optionId }));
    setError(null);
    try {
      await api.answer(id, { itemId: item.id, optionId });
    } catch (err) {
      if (err.status === 409) { submit(); return; } // time ran out
      setError(err);
    }
  }

  if (error && !session) {
    return (
      <div style={{ position: 'absolute', inset: 0, background: T.bg, padding: 24, overflow: 'auto' }}>
        <ErrorNote error={error} />
        <GhostButton onClick={() => navigate('/mock')}>{t('common.back')}</GhostButton>
      </div>
    );
  }
  if (!session || !item) return <Loading label={t('common.loading')} />;

  const q = item.question;
  const isLow = secs !== null && secs < 60;

  return (
    <div style={{ position: 'absolute', inset: 0, background: T.bg, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        flex: 'none', padding: '18px 16px 12px', display: 'flex', alignItems: 'center', gap: 12,
        borderBottom: `0.5px solid ${T.stroke}`,
      }}>
        <button
          onClick={() => { if (confirm(t('mock.exitConfirm'))) navigate('/'); }}
          aria-label={t('common.close')}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 6, display: 'flex' }}
        >
          <Icon name="close" size={22} color={T.textDim} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: T.textDim, letterSpacing: 0.6 }}>
            {t('mock.title').toUpperCase()} · {answeredCount}/{total}
          </div>
          <div style={{ height: 4, background: T.surface2, borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
            <div style={{
              width: `${(answeredCount / total) * 100}%`, height: '100%',
              background: `linear-gradient(90deg, ${T.a}, ${T.b})`, transition: 'width 0.3s',
            }} />
          </div>
        </div>
        <div style={{
          padding: '6px 10px', borderRadius: 10, flex: 'none',
          background: isLow ? hexA(T.danger, 0.15) : T.surface,
          color: isLow ? T.danger : T.text,
          fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Icon name="timer" size={14} color={isLow ? T.danger : T.text} strokeWidth={2.2} />
          {secs === null ? '—' : fmtTime(secs)}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 24px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: T.textDim, letterSpacing: 0.5 }}>
            {t('quiz.questionXofY', { a: index + 1, b: total })}
          </div>
          <button onClick={() => setMarked((m) => ({ ...m, [item.id]: !m[item.id] }))} style={{
            border: 'none', background: marked[item.id] ? hexA(T.warn, 0.15) : 'transparent',
            color: marked[item.id] ? T.warn : T.textDim,
            padding: '4px 10px', borderRadius: 10, cursor: 'pointer',
            fontSize: 11, fontWeight: 800, letterSpacing: 0.3, fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <Icon name="star" size={12} color={marked[item.id] ? T.warn : T.textDim} strokeWidth={2.2} />
            {t('mock.marked')}
          </button>
        </div>

        <div style={{ fontSize: 21, fontWeight: 700, color: T.text, letterSpacing: -0.4, lineHeight: 1.25, marginTop: 6 }}>
          {locale === 'ru' ? q.textRu : q.textUz}
        </div>

        {q.imageUrl && (
          <div style={{
            marginTop: 16, height: 150, borderRadius: 18, overflow: 'hidden',
            background: T.surface, border: `0.5px solid ${T.stroke}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <img src={q.imageUrl} alt="" style={{ maxHeight: '100%', maxWidth: '100%' }} />
          </div>
        )}

        <ErrorNote error={error} />

        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {q.options.map((o, idx) => {
            const picked = answers[item.id] === o.id;
            return (
              <button key={o.id} onClick={() => choose(o.id)} style={{
                border: `1.5px solid ${picked ? T.a : T.stroke}`,
                background: picked ? hexA(T.a, 0.1) : T.surface,
                color: T.text, padding: '13px 14px', borderRadius: 13, textAlign: 'left',
                cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 14.5, fontWeight: 600, letterSpacing: -0.1, lineHeight: 1.3,
                display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.12s',
              }}>
                <div style={{
                  flex: '0 0 auto', width: 22, height: 22, borderRadius: 11,
                  border: `1.5px solid ${picked ? T.a : T.textFaint}`,
                  background: picked ? T.aFill : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: picked ? '#fff' : T.textDim, fontSize: 11, fontWeight: 800,
                }}>{String.fromCharCode(65 + idx)}</div>
                <span style={{ flex: 1 }}>{locale === 'ru' ? o.textRu : o.textUz}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer nav */}
      <div style={{
        flex: 'none', padding: '10px 12px 20px', borderTop: `0.5px solid ${T.stroke}`,
        background: T.surface, display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <button onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0} aria-label={t('common.back')} style={{
          border: 'none', background: T.surface2, width: 44, height: 44, borderRadius: 22, flex: 'none',
          cursor: index === 0 ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="back" size={18} color={index === 0 ? T.textFaint : T.text} />
        </button>

        <button onClick={() => setPaletteOpen(true)} style={{
          flex: 1, border: 'none', background: T.surface2, color: T.text,
          padding: 12, borderRadius: 14, fontFamily: 'inherit',
          fontSize: 13, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <Icon name="grid" size={14} color={T.text} strokeWidth={2} />
          {t('mock.jump')}
        </button>

        {index < total - 1 ? (
          <button onClick={() => setIndex(index + 1)} aria-label={t('common.next')} style={{
            border: 'none', background: T.aFill, width: 44, height: 44, borderRadius: 22, flex: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="chevron" size={18} color="#fff" strokeWidth={2.4} />
          </button>
        ) : (
          <button onClick={() => setConfirmOpen(true)} style={{
            border: 'none', background: T.successFill, color: '#fff', flex: 'none',
            padding: '0 18px', height: 44, borderRadius: 22, cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 13, fontWeight: 800, letterSpacing: 0.3,
          }}>{t('mock.submit')}</button>
        )}
      </div>

      {confirmOpen && (
        <ConfirmSheet
          title={t('mock.confirmTitle')}
          body={t('mock.confirmBody', { a: answeredCount, n: total })}
          yes={t('mock.confirmYes')}
          no={t('mock.confirmNo')}
          onYes={submit}
          onNo={() => setConfirmOpen(false)}
        />
      )}

      {paletteOpen && (
        <Palette
          items={items} answers={answers} marked={marked} current={index}
          onPick={(n) => { setIndex(n); setPaletteOpen(false); }}
          onClose={() => setPaletteOpen(false)}
          onSubmit={() => { setPaletteOpen(false); setConfirmOpen(true); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Result
// ─────────────────────────────────────────────────────────────

function Breakdown({ value, label, color }) {
  const T = useTheme();
  return (
    <div style={{
      flex: 1, minWidth: 0, padding: 10, borderRadius: 12, textAlign: 'center',
      background: T.surface, border: `0.5px solid ${T.stroke}`,
    }}>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 10, color: T.textDim, fontWeight: 700, letterSpacing: 0.3, marginTop: 2 }}>{label}</div>
    </div>
  );
}

export function MockResult() {
  const { id } = useParams();
  const T = useTheme();
  const { t } = useI18n();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [exam, setExam] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.finish(id).then(setData).catch(setError);
    api.examConfig().then(setExam).catch(() => {});
  }, [id]);

  async function retry() {
    setBusy(true);
    try {
      const s = await api.createSession({ mode: 'exam' });
      navigate(`/mock/run/${s.id}`, { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  if (error && !data) {
    return (
      <div style={{ position: 'absolute', inset: 0, background: T.bg, padding: 24, overflow: 'auto' }}>
        <ErrorNote error={error} />
        <GhostButton onClick={() => navigate('/mock')}>{t('common.back')}</GhostButton>
      </div>
    );
  }
  if (!data) return <Loading label={t('common.loading')} />;

  const total = data.questionCount;
  const correct = data.correctCount;
  const passed = !!data.passed;
  const answeredCount = data.items.filter((it) => it.chosenOptionId).length;
  const wrong = answeredCount - correct;
  const skipped = total - answeredCount;
  const need = exam ? total - exam.maxErrors : total;

  return (
    <div style={{ position: 'absolute', inset: 0, background: T.bg, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        flex: 1, overflowY: 'auto', padding: '44px 24px 16px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
      }}>
        <Ring size={170} value={total ? correct / total : 0} stroke={14} color={passed ? T.success : T.danger}>
          <div>
            <div style={{ fontSize: 42, fontWeight: 800, color: T.text, letterSpacing: -1, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {correct}<span style={{ fontSize: 22, color: T.textDim }}>/{total}</span>
            </div>
            <div style={{ fontSize: 11, color: T.textDim, fontWeight: 700, letterSpacing: 0.5, marginTop: 4 }}>
              {t('result.score')}
            </div>
          </div>
        </Ring>

        <div style={{
          marginTop: 18, padding: '6px 14px', borderRadius: 12,
          background: passed ? hexA(T.success, 0.15) : hexA(T.danger, 0.15),
          color: passed ? T.success : T.danger,
          fontSize: 12, fontWeight: 800, letterSpacing: 0.5,
        }}>
          {passed ? `✓ ${t('mock.passed').toUpperCase()}` : `✗ ${t('mock.failed').toUpperCase()}`}
        </div>

        <div style={{ fontSize: 24, fontWeight: 800, color: T.text, letterSpacing: -0.5, marginTop: 12 }}>
          {passed ? t('mock.passed') : t('mock.failed')}
        </div>
        <div style={{ fontSize: 14, color: T.textDim, marginTop: 6, lineHeight: 1.45, maxWidth: 380 }}>
          {passed
            ? t('mock.passedBody', { c: correct, n: total })
            : t('mock.failedBody', { c: correct, n: total, need })}
        </div>

        <div style={{ marginTop: 22, width: '100%', maxWidth: 420, display: 'flex', gap: 8 }}>
          <Breakdown value={correct} label={t('result.correct')} color={T.success} />
          <Breakdown value={wrong} label={t('review.wrong')} color={T.danger} />
          <Breakdown value={skipped} label={t('review.skipped')} color={T.warn} />
        </div>

        {data.readiness && (
          <div style={{
            marginTop: 14, width: '100%', maxWidth: 420, padding: 14, borderRadius: 14,
            background: T.surface, border: `0.5px solid ${T.stroke}`,
            display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
          }}>
            <Ring size={44} value={data.readiness.percent / 100} stroke={5}>
              <span style={{ fontSize: 11, fontWeight: 800, color: T.text }}>{data.readiness.percent}%</span>
            </Ring>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{t('result.readinessNow')}</div>
          </div>
        )}

        <ErrorNote error={error} />
      </div>

      <div style={{ flex: 'none', padding: '10px 20px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <PrimaryButton onClick={() => navigate(`/review/${id}`)}>{t('mock.review')}</PrimaryButton>
        <div style={{ display: 'flex', gap: 8 }}>
          <GhostButton onClick={retry} disabled={busy}>{t('mock.retry')}</GhostButton>
          <GhostButton onClick={() => navigate('/')}>{t('mock.backHome')}</GhostButton>
        </div>
      </div>
    </div>
  );
}
