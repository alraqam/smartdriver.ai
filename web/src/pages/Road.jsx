import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n/index.jsx';
import { useTheme, hexA } from '../design/theme.jsx';
import { Icon } from '../design/Icon.jsx';
import { RoadSign, signForTopic } from '../design/RoadSign.jsx';
import { ErrorNote, Loading, StatChip } from '../design/primitives.jsx';

// Home — "The Road Ahead", ported from the prototype's HomeRoad.
//
// The prototype drew nine hardcoded nodes. Here each node is a real topic, and
// its state comes from the learner's actual mastery, so the road is a picture
// of where they are rather than a fixed illustration:
//
//   done     mastery at or above MASTERED_AT
//   current  the first topic they have started but not mastered
//   next     the first untouched topic after that
//   locked   nothing — every topic stays open
//
// Nothing is ever truly locked: this is exam prep for adults, and refusing to
// let someone practise pedestrians until they finish signals would be
// gamification getting in the way of studying.

const MASTERED_AT = 0.85;

/// The path the road follows. Hand-tuned S-curves from the prototype, with the
/// height derived from the node count so twelve topics do not pile up on a
/// path drawn for nine.
function buildPath(count) {
  const W = 360;
  const segment = 150;
  const H = Math.max(760, count * segment + 220);
  const amp = 110; // how far the road swings from the centre
  const mid = W / 2;

  let d = `M ${mid} 90`;
  let y = 90;
  for (let i = 0; i < count + 1; i++) {
    const dir = i % 2 === 0 ? -1 : 1;
    const nextY = y + segment;
    // Alternating cubic segments give a continuous serpentine without the
    // cusps a naive quadratic chain produces.
    d += ` C ${mid + dir * amp} ${y + segment * 0.45}, ${mid + dir * amp} ${nextY - segment * 0.45}, ${mid} ${nextY}`;
    y = nextY;
  }
  return { d, W, H: y + 130 };
}

const DECOS = [
  { xPct: 0.06, yPct: 0.12, size: 40 },
  { xPct: 0.78, yPct: 0.2, size: 36 },
  { xPct: 0.08, yPct: 0.34, size: 48 },
  { xPct: 0.76, yPct: 0.48, size: 42 },
  { xPct: 0.06, yPct: 0.6, size: 38 },
  { xPct: 0.76, yPct: 0.74, size: 44 },
  { xPct: 0.07, yPct: 0.86, size: 36 },
];

function CarIcon({ color }) {
  return (
    <svg width="38" height="52" viewBox="0 0 38 52" style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.3))' }}>
      <rect x="6" y="6" width="26" height="40" rx="8" fill={color} />
      <path d="M8 14 L30 14 L27 22 L11 22 Z" fill="rgba(255,255,255,0.35)" />
      <path d="M10 42 L28 42 L26 34 L12 34 Z" fill="rgba(255,255,255,0.2)" />
      <rect x="8" y="7" width="5" height="2" rx="1" fill="#FFE8A8" />
      <rect x="25" y="7" width="5" height="2" rx="1" fill="#FFE8A8" />
      <rect x="3" y="17" width="4" height="3" rx="1" fill={color} />
      <rect x="31" y="17" width="4" height="3" rx="1" fill={color} />
    </svg>
  );
}

/// Consecutive days, counting back from today, on which the learner practised.
/// Derived from real session history rather than stored — the sessions already
/// say when someone studied, so a streak column would just be a cache that can
/// disagree with them.
export function computeStreak(sessions) {
  if (!sessions?.length) return 0;
  const days = new Set(
    sessions.map((s) => {
      const d = new Date(s.startedAt);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }),
  );
  const key = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const cursor = new Date();
  // A streak survives "not yet today": it only breaks once a full day is
  // missed, otherwise it would read 0 every morning until the first session.
  if (!days.has(key(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(key(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export default function Road() {
  const T = useTheme();
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const scrollRef = useRef(null);
  const didScroll = useRef(false);

  const [topics, setTopics] = useState(null);
  const [progress, setProgress] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [points, setPoints] = useState([]);

  const load = useCallback(() => {
    setError(null);
    Promise.all([api.topics(locale), api.progress(locale), api.sessions()])
      .then(([tp, pr, ss]) => {
        setTopics(tp);
        setProgress(pr);
        setSessions(ss);
      })
      .catch(setError);
  }, [locale]);

  useEffect(load, [load]);

  const nodes = useMemo(() => {
    if (!topics) return [];
    let currentTaken = false;
    let nextTaken = false;
    return topics.map((tp, i) => {
      const p = tp.progress;
      const score = p?.score ?? 0;
      const started = (p?.attempts ?? 0) > 0;
      let status;
      if (started && score >= MASTERED_AT) status = 'done';
      else if (started && !currentTaken) { status = 'current'; currentTaken = true; }
      else if (!started && !nextTaken && currentTaken) { status = 'next'; nextTaken = true; }
      else status = started ? 'open' : 'untouched';
      return { ...tp, status, sign: signForTopic(tp.slug, i), score };
    });
  }, [topics]);

  // Nobody has started: make the first topic the current one so the road has a
  // "you are here" instead of a car parked at nothing.
  const nodesWithStart = useMemo(() => {
    if (!nodes.length) return nodes;
    if (nodes.some((n) => n.status === 'current')) return nodes;
    return nodes.map((n, i) => (i === 0 ? { ...n, status: 'current' } : n));
  }, [nodes]);

  const geom = useMemo(() => buildPath(nodesWithStart.length || 1), [nodesWithStart.length]);

  // Sample the SVG path so nodes sit exactly on the tarmac. Done from the real
  // path element rather than re-deriving the bezier by hand.
  useEffect(() => {
    if (!nodesWithStart.length) return;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', geom.d);
    svg.appendChild(path);
    document.body.appendChild(svg);
    const total = path.getTotalLength();
    const n = nodesWithStart.length;
    const pts = nodesWithStart.map((_, i) => {
      // Inset from both ends so the first node clears the header and the last
      // clears the finish flag.
      const tt = n === 1 ? 0.5 : 0.04 + (i / (n - 1)) * 0.88;
      const pt = path.getPointAtLength(tt * total);
      return { x: pt.x, y: pt.y };
    });
    document.body.removeChild(svg);
    setPoints(pts);
  }, [geom.d, nodesWithStart.length]);

  const currentIndex = nodesWithStart.findIndex((n) => n.status === 'current');
  const carPt = points[currentIndex] || null;

  // Scroll the car into view once, on first paint — not on every data refresh,
  // which would yank the page while someone is reading further down.
  useEffect(() => {
    if (didScroll.current || !scrollRef.current || !carPt) return;
    scrollRef.current.scrollTop = Math.max(0, carPt.y - 360);
    didScroll.current = true;
  }, [carPt]);

  async function startCurrent() {
    const node = nodesWithStart[currentIndex] || nodesWithStart[0];
    if (!node) return;
    setStarting(true);
    setError(null);
    try {
      const s = await api.createSession({ mode: 'practice', topicId: node.id, count: 10 });
      navigate(`/session/${s.id}`);
    } catch (err) {
      setError(err);
      setStarting(false);
    }
  }

  if (error && !topics) {
    return (
      <div style={{ position: 'absolute', inset: 0, background: T.bg, padding: 24, overflow: 'auto' }}>
        <ErrorNote error={error} onRetry={load} retryLabel={t('common.retry')} />
      </div>
    );
  }
  if (!topics || !progress) return <Loading label={t('common.loading')} />;

  const doneCount = nodesWithStart.filter((n) => n.status === 'done').length;
  const streak = computeStreak(sessions);
  const totalAnswers = progress.topics.reduce((sum, x) => sum + x.attempts, 0);

  return (
    <div style={{ position: 'absolute', inset: 0, background: T.bg, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Header — fades into the road rather than cutting it with a hard rule */}
      <div style={{
        position: 'relative', zIndex: 5, flex: 'none', padding: '24px 20px 14px',
        background: T.dark
          ? 'linear-gradient(180deg, rgba(14,17,22,0.96) 62%, rgba(14,17,22,0) 100%)'
          : 'linear-gradient(180deg, rgba(246,243,236,0.98) 62%, rgba(246,243,236,0) 100%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.textDim, letterSpacing: 0.4, textTransform: 'uppercase' }}>
              {t('road.greeting')}{user?.name ? `, ${user.name}` : ''}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: T.text, letterSpacing: -0.4, marginTop: 2 }}>
              {t('road.progress')}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {streak > 0 && <StatChip icon="flame" value={streak} label={t('common.day')} color={T.b} />}
            <StatChip icon="target" value={`${progress.readiness.percent}%`} label={t('road.readiness')} color={T.a} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            flex: 1, height: 6, borderRadius: 3, overflow: 'hidden',
            background: T.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
          }}>
            <div style={{
              width: `${nodesWithStart.length ? (doneCount / nodesWithStart.length) * 100 : 0}%`,
              height: '100%', borderRadius: 3,
              background: `linear-gradient(90deg, ${T.a}, ${T.b})`,
              transition: 'width 0.5s cubic-bezier(.2,.7,.3,1)',
            }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' }}>
            {doneCount}/{nodesWithStart.length}
          </span>
        </div>
      </div>

      {/* The road */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        <div style={{ position: 'relative', width: geom.W, height: geom.H, margin: '0 auto', paddingBottom: 40 }}>
          <svg width={geom.W} height={geom.H} style={{ position: 'absolute', inset: 0 }} aria-hidden="true">
            <defs>
              <linearGradient id="sdai-asphalt" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={T.asphalt} />
                <stop offset="1" stopColor={T.asphaltEdge} />
              </linearGradient>
              <filter id="sdai-road-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" />
              </filter>
            </defs>
            <path d={geom.d} fill="none" stroke={T.asphaltEdge} strokeWidth="56" strokeLinecap="round" opacity={T.dark ? 0.6 : 0.35} filter="url(#sdai-road-shadow)" />
            <path d={geom.d} fill="none" stroke="url(#sdai-asphalt)" strokeWidth="48" strokeLinecap="round" />
            <path d={geom.d} fill="none" stroke={T.dark ? '#D8C06A' : '#E8C240'} strokeWidth="2.5" strokeDasharray="10 14" strokeLinecap="round" opacity={0.85} />
          </svg>

          {DECOS.map((d, i) => (
            <div key={i} aria-hidden="true" style={{
              position: 'absolute', left: d.xPct * geom.W, top: d.yPct * geom.H, pointerEvents: 'none',
              color: T.dark ? 'rgba(255,255,255,0.14)' : 'rgba(20,22,28,0.1)',
            }}>
              <Icon name="mountain" size={d.size} />
            </div>
          ))}

          {points.map((pt, i) => {
            const n = nodesWithStart[i];
            if (!n) return null;
            const isDone = n.status === 'done';
            const isCurrent = n.status === 'current';
            const isNext = n.status === 'next';
            const leftSide = i % 2 === 0;
            const empty = n.questionCount === 0;
            return (
              <button
                key={n.id}
                onClick={() => !empty && navigate(`/lesson/${n.id}`)}
                disabled={empty}
                title={n.title}
                style={{
                  position: 'absolute', left: pt.x, top: pt.y,
                  transform: 'translate(-50%, -50%)',
                  background: 'transparent', border: 'none', padding: 0,
                  cursor: empty ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center',
                  flexDirection: leftSide ? 'row-reverse' : 'row',
                  gap: 10,
                }}
              >
                <div style={{
                  width: 64, height: 64, borderRadius: 12, flex: 'none', position: 'relative',
                  background: empty ? (T.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)') : T.surface,
                  boxShadow: isCurrent
                    ? `0 0 0 3px ${T.a}, 0 10px 30px ${hexA(T.a, 0.45)}`
                    : '0 4px 14px rgba(0,0,0,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: empty ? 0.5 : 1,
                  filter: empty ? 'grayscale(1)' : 'none',
                }}>
                  {empty ? <Icon name="lock" size={22} color={T.textDim} /> : <RoadSign kind={n.sign} size={48} />}

                  {isDone && (
                    <div style={{
                      position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11,
                      background: T.success, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                    }}>
                      <Icon name="check" size={14} color="#fff" strokeWidth={3} />
                    </div>
                  )}

                  {isCurrent && (
                    <div style={{
                      position: 'absolute', top: -7, left: '50%',
                      transform: 'translateX(-50%) translateY(-100%)',
                      background: T.a, color: '#fff', padding: '3px 8px', borderRadius: 6,
                      fontSize: 10, fontWeight: 800, letterSpacing: 0.3, whiteSpace: 'nowrap',
                      boxShadow: `0 4px 10px ${hexA(T.a, 0.4)}`,
                    }}>
                      {t('road.youreHere')}
                    </div>
                  )}
                </div>

                <div style={{
                  textAlign: leftSide ? 'right' : 'left', maxWidth: 104,
                  fontSize: 13, fontWeight: 600, letterSpacing: -0.1, lineHeight: 1.15,
                  color: empty ? T.textFaint : isCurrent ? T.text : T.textDim,
                }}>
                  {n.title}
                  {isNext && (
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.b, marginTop: 2, letterSpacing: 0.5 }}>
                      {t('road.nextUp')}
                    </div>
                  )}
                  {n.attempts > 0 && (
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.textFaint, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                      {Math.round(n.score * 100)}%
                    </div>
                  )}
                </div>
              </button>
            );
          })}

          {carPt && (
            <div aria-hidden="true" style={{
              position: 'absolute', left: carPt.x, top: carPt.y + 48,
              transform: 'translate(-50%, 0)', pointerEvents: 'none',
            }}>
              <CarIcon color={T.a} />
              <div style={{
                position: 'absolute', inset: -20, borderRadius: '50%',
                background: `radial-gradient(circle, ${hexA(T.a, 0.3)} 0%, transparent 70%)`,
                animation: 'sdai-pulse 2.4s ease-in-out infinite',
              }} />
            </div>
          )}

          {/* Finish flag — the real exam at the end of the road */}
          <button onClick={() => navigate('/mock')} style={{
            position: 'absolute', left: geom.W / 2, top: geom.H - 70,
            transform: 'translate(-50%, -100%)', background: 'transparent', border: 'none',
            cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 0,
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.textDim, letterSpacing: 0.4, marginBottom: 6 }}>
              {t('road.finalExam')}
            </div>
            <div style={{
              width: 48, height: 48, borderRadius: 10, background: T.surface,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            }}>
              <Icon name="trophy" size={28} color={T.b} />
            </div>
          </button>
        </div>
      </div>

      {/* Floating continue bar */}
      {nodesWithStart.length > 0 && (
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 18, zIndex: 30 }}>
          {error && <ErrorNote error={error} />}
          <button onClick={startCurrent} disabled={starting} style={{
            width: '100%', border: 'none', background: T.a, color: '#fff',
            borderRadius: 18, padding: '14px 18px', cursor: starting ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            boxShadow: `0 10px 28px ${hexA(T.a, 0.45)}`, fontFamily: 'inherit',
          }}>
            <div style={{ textAlign: 'left', minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.8, letterSpacing: 0.3 }}>
                {totalAnswers === 0 ? t('road.startHere') : t('road.continueLesson')}
              </div>
              <div style={{
                fontSize: 16, fontWeight: 700, marginTop: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {nodesWithStart[currentIndex]?.title ?? nodesWithStart[0]?.title}
              </div>
            </div>
            <div style={{
              width: 40, height: 40, borderRadius: 20, flex: 'none',
              background: 'rgba(255,255,255,0.22)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name={starting ? 'timer' : 'chevron'} size={22} color="#fff" strokeWidth={2.4} />
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
