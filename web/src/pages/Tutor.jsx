import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useI18n } from '../i18n/index.jsx';
import { useTheme, hexA } from '../design/theme.jsx';
import { Icon } from '../design/Icon.jsx';
import { ErrorNote, Loading, Screen, ScreenHeader, Spinner } from '../design/primitives.jsx';

// AI tutor. The prototype had no screen for this — it is this app's own
// feature — so it is built in the design's language rather than ported.

const EXAMPLES = {
  uz: [
    "Chorrahada kim birinchi o'tadi?",
    'Aholi punktida ruxsat etilgan eng yuqori tezlik qancha?',
    "Piyodalar o'tish joyida quvib o'tish mumkinmi?",
  ],
  ru: [
    'Кому уступить дорогу на перекрёстке равнозначных дорог?',
    'Какая максимальная скорость в населённых пунктах?',
    'Когда запрещён обгон?',
  ],
};

function Citations({ codes }) {
  const T = useTheme();
  if (!codes?.length) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      {codes.map((c) => (
        <span key={c} style={{
          fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
          background: hexA(T.a, 0.12), color: T.a, fontVariantNumeric: 'tabular-nums',
        }}>{c}</span>
      ))}
    </div>
  );
}

export default function Tutor() {
  const { threadId } = useParams();
  const [params, setParams] = useSearchParams();
  const T = useTheme();
  const { t, locale } = useI18n();
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [pending, setPending] = useState(null);
  const [quota, setQuota] = useState(null);
  const [error, setError] = useState(null);
  const bottom = useRef(null);
  const prefilled = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (threadId) {
          const th = await api.getThread(threadId);
          if (!alive) return;
          setMessages(th.messages);
        } else {
          const list = await api.tutorThreads();
          if (!alive) return;
          const target = list.length ? list[0].id : (await api.createThread(locale)).id;
          if (!alive) return;
          navigate(`/tutor/${target}${params.get('q') ? `?q=${encodeURIComponent(params.get('q'))}` : ''}`, { replace: true });
        }
        api.tutorQuota().then((q) => alive && setQuota(q)).catch(() => {});
      } catch (err) {
        if (alive) setError(err);
      }
    })();
    return () => { alive = false; };
  }, [threadId, locale, navigate, params]);

  // A sign's "ask the tutor" button arrives with ?q= — drop it in the box
  // rather than sending it, so the learner can shape the question first.
  useEffect(() => {
    const q = params.get('q');
    if (!q || prefilled.current || !threadId) return;
    prefilled.current = true;
    setDraft(q);
    setParams({}, { replace: true });
  }, [params, setParams, threadId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, pending]);

  async function send(question) {
    const q = (question ?? draft).trim();
    if (!q || streaming || !threadId) return;

    setDraft('');
    setError(null);
    setStreaming(true);
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: 'user', content: q }]);
    setPending({ content: '', citations: [] });

    try {
      await api.askTutor(threadId, q, (event, data) => {
        if (event === 'citations') setPending((p) => ({ ...p, citations: data.citations ?? [] }));
        else if (event === 'delta') setPending((p) => ({ ...p, content: p.content + data.text }));
        else if (event === 'done') {
          setPending((p) => {
            setMessages((m) => [...m, { id: data.messageId, role: 'assistant', content: p.content, citations: p.citations }]);
            return null;
          });
        } else if (event === 'error') {
          setError(new Error(data.message));
          setPending(null);
        }
      });
      api.tutorQuota().then(setQuota).catch(() => {});
    } catch (err) {
      setError(err);
    } finally {
      setStreaming(false);
      // If the stream ended without a `done` frame, keep whatever arrived
      // rather than discarding the learner's answer.
      setPending((p) => {
        if (p?.content) {
          setMessages((m) => [...m, { id: `partial-${Date.now()}`, role: 'assistant', content: p.content, citations: p.citations }]);
        }
        return null;
      });
    }
  }

  async function newThread() {
    try {
      const th = await api.createThread(locale);
      setMessages([]);
      navigate(`/tutor/${th.id}`, { replace: true });
    } catch (err) {
      setError(err);
    }
  }

  if (!threadId && !error) return <Loading label={t('common.loading')} />;

  const empty = messages.length === 0 && !pending;
  const outOfQuota = quota?.remaining === 0;

  return (
    <Screen>
      <ScreenHeader
        title={t('tutor.title')}
        eyebrow={quota ? (outOfQuota ? t('tutor.quotaOver') : t('tutor.quota', { remaining: quota.remaining, limit: quota.limit })) : undefined}
        right={(
          <button onClick={newThread} style={{
            border: `0.5px solid ${T.stroke}`, background: T.surface, color: T.text,
            padding: '8px 12px', borderRadius: 12, cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
          }}>{t('tutor.newThread')}</button>
        )}
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 8px' }}>
        <ErrorNote error={error} />

        {empty ? (
          <div>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              textAlign: 'center', padding: '20px 0 8px',
            }}>
              <div style={{
                width: 72, height: 72, borderRadius: 20, marginBottom: 14,
                background: `linear-gradient(135deg, ${T.a}, ${T.b})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 12px 30px ${hexA(T.a, 0.35)}`,
              }}>
                <Icon name="sparkle" size={34} color="#fff" strokeWidth={2} />
              </div>
              <div style={{ fontSize: 14, color: T.textDim, lineHeight: 1.5, maxWidth: 380 }}>
                {t('tutor.empty')}
              </div>
            </div>

            <div style={{
              fontSize: 11, fontWeight: 800, color: T.textFaint,
              letterSpacing: 0.6, textTransform: 'uppercase', margin: '20px 0 8px',
            }}>{t('tutor.examples')}</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(EXAMPLES[locale] ?? EXAMPLES.uz).map((ex) => (
                <button key={ex} onClick={() => send(ex)} style={{
                  textAlign: 'left', padding: '13px 14px', borderRadius: 14,
                  border: `0.5px solid ${T.stroke}`, background: T.surface, color: T.text,
                  cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', lineHeight: 1.35,
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <Icon name="quiz" size={16} color={T.textDim} strokeWidth={2} />
                  <span style={{ flex: 1 }}>{ex}</span>
                  <Icon name="chevron" size={16} color={T.textFaint} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.map((m) => (
              <div key={m.id} style={{
                maxWidth: '86%', padding: '12px 14px', borderRadius: 16,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                fontSize: 14, lineHeight: 1.5,
                ...(m.role === 'user'
                  ? { alignSelf: 'flex-end', background: T.a, color: '#fff', borderBottomRightRadius: 4 }
                  : { alignSelf: 'flex-start', background: T.surface, color: T.text, border: `0.5px solid ${T.stroke}`, borderBottomLeftRadius: 4 }),
              }}>
                {m.content}
                {m.role === 'assistant' && <Citations codes={m.citations} />}
              </div>
            ))}

            {pending && (
              <div style={{
                alignSelf: 'flex-start', maxWidth: '86%', padding: '12px 14px', borderRadius: 16,
                borderBottomLeftRadius: 4, background: T.surface, border: `0.5px solid ${T.stroke}`,
                color: T.text, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap',
              }}>
                {pending.content || (
                  <span style={{ color: T.textDim, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Spinner size={14} /> {t('tutor.thinking')}
                  </span>
                )}
                <Citations codes={pending.citations} />
              </div>
            )}
            <div ref={bottom} />
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        style={{
          flex: 'none', padding: '12px 20px 20px', borderTop: `0.5px solid ${T.stroke}`,
          background: T.surface, display: 'flex', gap: 8,
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('tutor.placeholder')}
          disabled={streaming || outOfQuota}
          maxLength={1000}
          style={{
            flex: 1, minWidth: 0, padding: '13px 16px', borderRadius: 14,
            border: `1px solid ${T.stroke}`, background: T.bg, color: T.text,
            fontSize: 14, outline: 'none',
          }}
        />
        <button type="submit" disabled={streaming || !draft.trim() || outOfQuota} aria-label={t('tutor.title')} style={{
          border: 'none', width: 48, height: 48, borderRadius: 14, flex: 'none',
          background: streaming || !draft.trim() || outOfQuota ? T.surface2 : T.a,
          color: '#fff', cursor: streaming || !draft.trim() || outOfQuota ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {streaming
            ? <Spinner size={18} color="#fff" />
            : <Icon name="chevron" size={20} color={!draft.trim() || outOfQuota ? T.textFaint : '#fff'} strokeWidth={2.6} />}
        </button>
      </form>
    </Screen>
  );
}
