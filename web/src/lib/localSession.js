// Practice, run on the device.
//
// The contract this file has to keep is narrow and strict: everything it
// returns must be shaped exactly like the server's `/sessions` responses, so
// Quiz.jsx and Result.jsx never learn that a drill happened offline. The moment
// those screens need an `if (offline)` branch, every future change has to be
// made twice and one of the two will rot.
//
// Only PRACTICE runs here. An exam whose paper, clock and score lived on the
// learner's phone is not an exam, and the sync endpoint refuses to create one
// no matter what this file sends.

import { lastKnownReadiness, questionsForTopic } from './offlinePack.js';

const SESSIONS_KEY = 'sdai.localSessions';
export const LOCAL_PREFIX = 'local:';

export const isLocalSessionId = (id) => typeof id === 'string' && id.startsWith(LOCAL_PREFIX);

// ── storage ─────────────────────────────────────────────────

function readAll() {
  try {
    const all = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '{}');
    return all && typeof all === 'object' ? all : {};
  } catch {
    return {};
  }
}

function writeAll(all) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(all));
}

export function loadLocalSession(id) {
  return readAll()[id] ?? null;
}

function store(session) {
  const all = readAll();
  all[session.id] = session;
  writeAll(all);
  return session;
}

/// Drop drills that have already been synced, so an in-progress session
/// surviving a reload does not mean keeping every finished one forever.
export function forgetLocalSession(id) {
  const all = readAll();
  delete all[id];
  writeAll(all);
}

// ── deterministic ordering ──────────────────────────────────

/// FNV-1a, the same hash and the same use as the server's `shuffle.ts`.
///
/// Duplicated rather than shared because there is no build step between the two
/// packages, and this is twelve lines that will not change. What matters is
/// that a question looks the same whether it was served or practised offline:
/// content authors put the correct answer first far more often than chance, so
/// stored order makes "always pick the first one" a working strategy.
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function shuffleOptions(itemId, options) {
  return [...options]
    .map((o) => ({ o, k: hash(`${itemId}:${o.id}`) }))
    .sort((a, b) => a.k - b.k || a.o.id.localeCompare(b.o.id))
    .map((x) => x.o);
}

/// Which questions this drill asks.
///
/// Simpler than the server's selection, which balances difficulty and weighs
/// how recently each question was seen using the learner's full history. The
/// device has neither, so it does the one thing that genuinely matters and is
/// available locally: prefer questions this device has not just asked, then
/// order by a per-drill seed so two drills in a row are not the same paper.
export function pickQuestions(questions, count, { seed = '0', recent = [] } = {}) {
  const seen = new Set(recent);
  const scored = questions.map((q) => ({
    q,
    // Fresh questions all sort ahead of recently-seen ones; ties broken by the
    // seeded hash, which is what makes the order vary between drills.
    fresh: seen.has(q.id) ? 1 : 0,
    k: hash(`${seed}:${q.id}`),
  }));
  scored.sort((a, b) => a.fresh - b.fresh || a.k - b.k || a.q.id.localeCompare(b.q.id));
  return scored.slice(0, Math.max(1, count)).map((s) => s.q);
}

/// The last questions this device asked, newest first, across local drills.
function recentlyAsked(limit = 60) {
  const all = Object.values(readAll());
  const ordered = all
    .filter((s) => s.startedAt)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  const out = [];
  for (const s of ordered) {
    for (const it of s.items) {
      if (!out.includes(it.questionId)) out.push(it.questionId);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

// ── the session ─────────────────────────────────────────────

/// A client-minted id, used both as the local session key and as the sync
/// idempotency key. crypto.randomUUID is available in every browser that has a
/// service worker; the fallback is there for old WebViews.
export function newClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createLocalSession(pack, { topicId, count = 10 }, now = new Date()) {
  const pool = questionsForTopic(pack, topicId);
  if (pool.length === 0) {
    const err = new Error('offline: no questions for topic');
    err.code = 'no-questions';
    throw err;
  }

  const clientId = newClientId();
  const chosen = pickQuestions(pool, Math.min(count, pool.length), {
    seed: clientId,
    recent: recentlyAsked(),
  });

  return store({
    id: LOCAL_PREFIX + clientId,
    clientId,
    mode: 'practice',
    topicId,
    startedAt: now.toISOString(),
    finishedAt: null,
    questionCount: chosen.length,
    correctCount: 0,
    items: chosen.map((q, order) => ({
      id: `${clientId}:${order}`,
      order,
      questionId: q.id,
      chosenOptionId: null,
      isCorrect: null,
      answeredAt: null,
      msSpent: null,
    })),
  });
}

function questionById(pack, id) {
  return pack?.questions.find((q) => q.id === id) ?? null;
}

/// Render a stored session in the shape `GET /api/sessions/:id` returns.
///
/// The reveal rule is the server's, per item rather than per session: an
/// unanswered question does not ship its correct option. That matters less
/// offline — the device is holding the whole answer key anyway — but keeping
/// the same rule means the screens behave identically, and the screens are what
/// this is for.
export function toSessionShape(session, pack, topicsById = new Map()) {
  const finished = session.finishedAt !== null;

  return {
    id: session.id,
    mode: session.mode,
    topicId: session.topicId,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    questionCount: session.questionCount,
    correctCount: session.correctCount,
    timeLimitSec: null,
    passed: null,
    secondsLeft: null,
    offline: true,
    items: session.items.map((it) => {
      const q = questionById(pack, it.questionId);
      const reveal = finished || it.answeredAt !== null;
      if (!q) {
        // The pack was replaced mid-drill. Vanishingly unlikely, but returning
        // a half-built item is better than throwing inside a render.
        return {
          id: it.id,
          order: it.order,
          chosenOptionId: it.chosenOptionId,
          isCorrect: reveal ? it.isCorrect : null,
          answeredAt: it.answeredAt,
          question: null,
        };
      }
      return {
        id: it.id,
        order: it.order,
        chosenOptionId: it.chosenOptionId,
        isCorrect: reveal ? it.isCorrect : null,
        answeredAt: it.answeredAt,
        question: {
          id: q.id,
          topicId: q.topicId,
          topicSlug: topicsById.get(q.topicId)?.slug ?? null,
          difficulty: q.difficulty,
          imageUrl: q.imageUrl,
          textUz: q.textUz,
          textRu: q.textRu,
          sourceNoteUz: reveal ? q.sourceNoteUz : null,
          sourceNoteRu: reveal ? q.sourceNoteRu : null,
          ruleRefs: reveal ? q.ruleRefs : [],
          options: shuffleOptions(it.id, q.options).map((o) => ({
            id: o.id,
            textUz: o.textUz,
            textRu: o.textRu,
            ...(reveal ? { isCorrect: o.isCorrect } : {}),
          })),
        },
      };
    }),
  };
}

/// Grade an answer against the pack and commit it.
export function applyAnswer(session, pack, itemId, optionId, msSpent, now = new Date()) {
  const item = session.items.find((it) => it.id === itemId);
  if (!item) throw new Error('offline: item not in session');
  // Practice answers are final online, so they are final here too — otherwise
  // going offline would quietly become a way to retry until the score is right.
  if (item.answeredAt) throw new Error('offline: already answered');

  const q = questionById(pack, item.questionId);
  const option = q?.options.find((o) => o.id === optionId);
  if (!q || !option) throw new Error('offline: option not on this question');

  item.chosenOptionId = optionId;
  item.isCorrect = option.isCorrect;
  item.answeredAt = now.toISOString();
  item.msSpent = msSpent ?? null;
  if (option.isCorrect) session.correctCount += 1;
  store(session);

  const correct = q.options.find((o) => o.isCorrect);
  return {
    itemId,
    isCorrect: option.isCorrect,
    correctOptionId: correct ? correct.id : null,
    sourceNoteUz: q.sourceNoteUz,
    sourceNoteRu: q.sourceNoteRu,
  };
}

export function finishLocal(session, pack, topicsById, now = new Date()) {
  if (!session.finishedAt) {
    session.finishedAt = now.toISOString();
    store(session);
  }
  return {
    ...toSessionShape(session, pack, topicsById),
    // Readiness is a server computation over every topic's mastery plus recent
    // exams. Offline the only honest answer is the last one we were given,
    // marked stale so the screen can say so rather than presenting a number
    // from last Tuesday as today's.
    readiness: lastKnownReadiness(),
  };
}

/// What the sync endpoint wants: which option was tapped, never whether it was
/// right. The server re-grades — see api/src/sessions/sync.dto.ts.
export function toSyncPayload(session) {
  return {
    clientId: session.clientId,
    topicId: session.topicId,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt ?? new Date().toISOString(),
    answers: session.items
      .filter((it) => it.answeredAt && it.chosenOptionId)
      .map((it) => ({
        questionId: it.questionId,
        optionId: it.chosenOptionId,
        ...(it.msSpent != null ? { msSpent: it.msSpent } : {}),
      })),
  };
}
