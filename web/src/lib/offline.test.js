import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyAnswer,
  createLocalSession,
  finishLocal,
  isLocalSessionId,
  loadLocalSession,
  pickQuestions,
  shuffleOptions,
  toSessionShape,
  toSyncPayload,
} from './localSession.js';
import { enqueue, flush, pending, pendingCount } from './offlineQueue.js';
import { savePack, readPack, packMeta, clearPack, topicsFromPack } from './offlinePack.js';

// These run in Node, so localStorage has to be supplied. A Map-backed stub is
// enough and keeps the tests honest about what actually persists — the real
// failure mode here is work a learner did going missing, and that is a storage
// question before it is anything else.
function installStorage() {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
  return map;
}

const option = (id, isCorrect) => ({ id, order: 0, textUz: id, textRu: id, isCorrect });

const question = (id, topicId = 't1') => ({
  id,
  topicId,
  difficulty: 3,
  imageUrl: null,
  textUz: `savol ${id}`,
  textRu: `вопрос ${id}`,
  sourceNoteUz: `izoh ${id}`,
  sourceNoteRu: `примечание ${id}`,
  ruleRefs: ['PDD-1.1'],
  options: [option(`${id}-a`, false), option(`${id}-b`, true), option(`${id}-c`, false)],
});

const PACK = {
  version: 'v-test',
  topics: [
    { id: 't1', slug: 'alpha', order: 1, titleUz: 'Alfa', titleRu: 'Альфа' },
    { id: 't2', slug: 'beta', order: 2, titleUz: 'Beta', titleRu: 'Бета' },
  ],
  questions: [
    ...['q1', 'q2', 'q3', 'q4', 'q5'].map((id) => question(id, 't1')),
    question('q6', 't2'),
  ],
};

const topicsById = new Map(PACK.topics.map((t) => [t.id, t]));

beforeEach(() => {
  installStorage();
  savePack(PACK);
});

describe('offlinePack', () => {
  it('round-trips and reports what is stored', () => {
    const meta = packMeta();
    expect(meta.version).toBe('v-test');
    expect(meta.questionCount).toBe(6);
    expect(meta.topicCount).toBe(2);
    expect(meta.savedAt).toBeTruthy();
  });

  it('treats a corrupted pack as no pack rather than throwing', () => {
    // A half-written value survives a crash mid-download. Every screen calls
    // readPack, so throwing here would break the whole app rather than one
    // feature.
    localStorage.setItem('sdai.pack', '{not json');
    expect(readPack()).toBeNull();
    expect(localStorage.getItem('sdai.pack')).toBeNull();
  });

  it('rejects a pack that would not fit rather than half-writing it', () => {
    const huge = { ...PACK, questions: [{ ...question('big'), textUz: 'x'.repeat(5 * 1024 * 1024) }] };
    expect(() => savePack(huge)).toThrow(/budget/);
  });

  it('builds a topic list the UI can render, with progress left unknown', () => {
    const topics = topicsFromPack(PACK, 'ru');
    expect(topics.map((t) => t.title)).toEqual(['Альфа', 'Бета']);
    expect(topics[0].questionCount).toBe(5);
    // Null, not zero: mastery lives on the server, and drawing a 0% bar for a
    // topic the learner has been working on for a week would be a lie.
    expect(topics[0].progress).toBeNull();
  });

  it('clears cleanly', () => {
    clearPack();
    expect(packMeta()).toBeNull();
  });
});

describe('local practice', () => {
  it('builds a session shaped exactly like the server sends one', () => {
    const s = createLocalSession(PACK, { topicId: 't1', count: 3 });
    const shape = toSessionShape(s, PACK, topicsById);

    expect(isLocalSessionId(shape.id)).toBe(true);
    expect(shape.mode).toBe('practice');
    expect(shape.questionCount).toBe(3);
    expect(shape.items).toHaveLength(3);
    // Exam-only fields are present and null, so the runner's checks behave the
    // same as they do for a server practice session.
    expect(shape.timeLimitSec).toBeNull();
    expect(shape.secondsLeft).toBeNull();
    expect(shape.passed).toBeNull();
    expect(shape.items[0].question.textUz).toMatch(/savol/);
  });

  it('never asks for more questions than the topic has', () => {
    const s = createLocalSession(PACK, { topicId: 't2', count: 10 });
    expect(s.questionCount).toBe(1);
  });

  it('refuses a topic with nothing in it', () => {
    expect(() => createLocalSession(PACK, { topicId: 'nope', count: 5 })).toThrow(/no questions/);
  });

  it('withholds the answer key until a question is answered', () => {
    const s = createLocalSession(PACK, { topicId: 't1', count: 2 });
    const before = toSessionShape(s, PACK, topicsById);
    // The device is holding the whole key anyway, but the reveal rule is the
    // server's and the screens depend on it: an unanswered item shows nothing.
    expect(before.items[0].question.options.every((o) => !('isCorrect' in o))).toBe(true);
    expect(before.items[0].question.sourceNoteUz).toBeNull();

    applyAnswer(s, PACK, s.items[0].id, s.items[0] && optionIdFor(s, 0, PACK), undefined);
    const after = toSessionShape(loadLocalSession(s.id), PACK, topicsById);
    expect(after.items[0].question.options.some((o) => o.isCorrect === true)).toBe(true);
    expect(after.items[0].question.sourceNoteUz).toBeTruthy();
    // The still-unanswered one stays closed.
    expect(after.items[1].question.options.every((o) => !('isCorrect' in o))).toBe(true);
  });

  function optionIdFor(session, index, pack, correct = true) {
    const item = session.items[index];
    const q = pack.questions.find((x) => x.id === item.questionId);
    return q.options.find((o) => o.isCorrect === correct).id;
  }

  it('grades against the pack and counts correct answers', () => {
    const s = createLocalSession(PACK, { topicId: 't1', count: 3 });
    const right = applyAnswer(s, PACK, s.items[0].id, optionIdFor(s, 0, PACK, true));
    const wrong = applyAnswer(s, PACK, s.items[1].id, optionIdFor(s, 1, PACK, false));

    expect(right.isCorrect).toBe(true);
    expect(right.correctOptionId).toBe(optionIdFor(s, 0, PACK, true));
    expect(wrong.isCorrect).toBe(false);
    expect(loadLocalSession(s.id).correctCount).toBe(1);
  });

  it('refuses to re-answer, exactly as practice does online', () => {
    const s = createLocalSession(PACK, { topicId: 't1', count: 2 });
    applyAnswer(s, PACK, s.items[0].id, optionIdFor(s, 0, PACK, false));
    // Otherwise going offline would quietly become a way to retry until the
    // score came out right.
    expect(() => applyAnswer(s, PACK, s.items[0].id, optionIdFor(s, 0, PACK, true))).toThrow(/already answered/);
  });

  it('refuses an option from a different question', () => {
    const s = createLocalSession(PACK, { topicId: 't1', count: 2 });
    expect(() => applyAnswer(s, PACK, s.items[0].id, 'q6-b')).toThrow(/not on this question/);
  });

  it('survives a reload mid-drill', () => {
    const s = createLocalSession(PACK, { topicId: 't1', count: 3 });
    applyAnswer(s, PACK, s.items[0].id, optionIdFor(s, 0, PACK, true));

    // Simulates the app being reopened: nothing in memory, everything from
    // storage. A learner on a train should not lose a half-finished drill.
    const reloaded = loadLocalSession(s.id);
    expect(reloaded.correctCount).toBe(1);
    expect(reloaded.items[0].answeredAt).toBeTruthy();
    expect(reloaded.items[1].answeredAt).toBeNull();
  });

  it('orders options deterministically, and not by stored position', () => {
    const s = createLocalSession(PACK, { topicId: 't1', count: 3 });
    const a = toSessionShape(s, PACK, topicsById).items.map((i) => i.question.options.map((o) => o.id));
    const b = toSessionShape(loadLocalSession(s.id), PACK, topicsById)
      .items.map((i) => i.question.options.map((o) => o.id));
    // Stable across renders, or a learner scrolling back sees the answers move.
    expect(a).toEqual(b);
  });

  it('matches the server shuffle', () => {
    // Both sides run FNV-1a over `${itemId}:${optionId}` — see
    // api/src/sessions/shuffle.ts. The two implementations are duplicated
    // because there is no build step between the packages, so this is the thing
    // holding them in step: if either drifts, a question reorders the moment a
    // drill syncs, which reads as a bug even though grading is unaffected.
    //
    // Transcribed from the server independently rather than imported, so the
    // test disagrees with a change to either copy instead of moving with it.
    const serverShuffle = (itemId, options) => {
      const fnv = (s) => {
        let h = 0x811c9dc5;
        for (let i = 0; i < s.length; i++) {
          h ^= s.charCodeAt(i);
          h = Math.imul(h, 0x01000193) >>> 0;
        }
        return h >>> 0;
      };
      return [...options]
        .map((o) => ({ o, k: fnv(`${itemId}:${o.id}`) }))
        .sort((a, b) => a.k - b.k || a.o.id.localeCompare(b.o.id))
        .map((x) => x.o);
    };

    const opts = [option('x', false), option('y', true), option('z', false)];
    for (const seed of ['seed-1', 'abc:0', 'cmt8dodp80003gc26aubi0hsl:7', '']) {
      expect(shuffleOptions(seed, opts).map((o) => o.id)).toEqual(
        serverShuffle(seed, opts).map((o) => o.id),
      );
    }

    // ...and the result cannot depend on the order the options arrived in,
    // which is the property that stops "always pick the first" from working.
    expect(shuffleOptions('seed-1', opts).map((o) => o.id)).toEqual(
      shuffleOptions('seed-1', [...opts].reverse()).map((o) => o.id),
    );
  });

  it('prefers questions this device has not just asked', () => {
    const pool = ['q1', 'q2', 'q3', 'q4', 'q5'].map((id) => question(id));
    const picked = pickQuestions(pool, 2, { seed: 's', recent: ['q1', 'q2', 'q3'] });
    expect(picked.map((q) => q.id).sort()).toEqual(['q4', 'q5']);
  });

  it('falls back to seen questions rather than returning too few', () => {
    const pool = ['q1', 'q2'].map((id) => question(id));
    const picked = pickQuestions(pool, 2, { seed: 's', recent: ['q1', 'q2'] });
    expect(picked).toHaveLength(2);
  });
});

describe('the sync payload', () => {
  it('carries the chosen option and never a verdict', () => {
    const s = createLocalSession(PACK, { topicId: 't1', count: 2 });
    const q = PACK.questions.find((x) => x.id === s.items[0].questionId);
    applyAnswer(s, PACK, s.items[0].id, q.options.find((o) => o.isCorrect).id, 4321);

    const payload = toSyncPayload(loadLocalSession(s.id));
    expect(payload.clientId).toBe(s.clientId);
    expect(payload.topicId).toBe('t1');
    expect(payload.answers).toHaveLength(1);
    expect(payload.answers[0]).toHaveProperty('optionId');
    expect(payload.answers[0].msSpent).toBe(4321);
    // The server re-grades. A client that could assert its own score could
    // assert any score, and readiness is built on these.
    expect(payload.answers[0]).not.toHaveProperty('isCorrect');
  });

  it('omits questions that were never answered', () => {
    const s = createLocalSession(PACK, { topicId: 't1', count: 3 });
    const q = PACK.questions.find((x) => x.id === s.items[0].questionId);
    applyAnswer(s, PACK, s.items[0].id, q.options[0].id);
    expect(toSyncPayload(loadLocalSession(s.id)).answers).toHaveLength(1);
  });
});

describe('the sync queue', () => {
  function finishedDrill(topicId = 't1', count = 2) {
    const s = createLocalSession(PACK, { topicId, count });
    for (const item of s.items) {
      const q = PACK.questions.find((x) => x.id === item.questionId);
      applyAnswer(s, PACK, item.id, q.options.find((o) => o.isCorrect).id);
    }
    const live = loadLocalSession(s.id);
    finishLocal(live, PACK, topicsById);
    return loadLocalSession(s.id);
  }

  it('queues a finished drill and keeps it across reloads', () => {
    enqueue(finishedDrill());
    expect(pendingCount()).toBe(1);
    expect(pending()[0].answers).toHaveLength(2);
  });

  it('does not queue a drill with no answers', () => {
    const s = createLocalSession(PACK, { topicId: 't1', count: 2 });
    expect(enqueue(s)).toBe(0);
    // ...and drops the local copy, since it can never be delivered.
    expect(loadLocalSession(s.id)).toBeNull();
  });

  it('queues one entry per drill even if enqueued twice', () => {
    const s = finishedDrill();
    enqueue(s);
    enqueue(s);
    expect(pendingCount()).toBe(1);
  });

  it('clears entries the server ruled on, and only those', () => {
    const a = finishedDrill('t1');
    const b = finishedDrill('t2', 1);
    enqueue(a);
    enqueue(b);

    const post = vi.fn(async ({ sessions }) => ({
      // The server answered for the first only — a partial response is exactly
      // what a connection dropping mid-flush looks like.
      results: [{ clientId: sessions[0].clientId, status: 'accepted' }],
      accepted: 1,
      duplicates: 0,
      rejected: 0,
    }));

    return flush(post).then((res) => {
      expect(res.accepted).toBe(1);
      expect(pendingCount()).toBe(1);
      expect(pending()[0].clientId).toBe(b.clientId);
      // The delivered drill's local copy is gone; the undelivered one is not.
      expect(loadLocalSession(a.id)).toBeNull();
      expect(loadLocalSession(b.id)).not.toBeNull();
    });
  });

  it('treats a duplicate as delivered', async () => {
    // The whole reason clientId exists: the queue flushed, the response was
    // lost, the queue flushed again. The second answer must drain the queue.
    const s = finishedDrill();
    enqueue(s);
    const post = async ({ sessions }) => ({
      results: [{ clientId: sessions[0].clientId, status: 'duplicate' }],
      accepted: 0,
      duplicates: 1,
      rejected: 0,
    });
    await flush(post);
    expect(pendingCount()).toBe(0);
  });

  it('drops a permanently rejected drill instead of retrying forever', async () => {
    const s = finishedDrill();
    enqueue(s);
    const post = async ({ sessions }) => ({
      results: [{ clientId: sessions[0].clientId, status: 'rejected', reason: 'gone' }],
      accepted: 0,
      duplicates: 0,
      rejected: 1,
    });
    const res = await flush(post);
    expect(res.rejected).toBe(1);
    // Otherwise the badge never clears and every launch retries a drill whose
    // questions no longer exist.
    expect(pendingCount()).toBe(0);
  });

  it('keeps everything when the request fails outright', async () => {
    enqueue(finishedDrill());
    const post = async () => {
      throw new Error('offline');
    };
    await expect(flush(post)).rejects.toThrow('offline');
    expect(pendingCount()).toBe(1);
  });

  it('is a no-op on an empty queue', async () => {
    const post = vi.fn();
    const res = await flush(post);
    expect(post).not.toHaveBeenCalled();
    expect(res.attempted).toBe(0);
  });

  it('never sends more than the server accepts in one batch', async () => {
    for (let i = 0; i < 30; i++) enqueue(finishedDrill('t2', 1));
    expect(pendingCount()).toBe(30);

    const post = vi.fn(async ({ sessions }) => {
      // Matches @ArrayMaxSize(25) on SyncSessionsDto; exceeding it is a 400
      // that would strand the whole queue.
      expect(sessions.length).toBeLessThanOrEqual(25);
      return {
        results: sessions.map((s) => ({ clientId: s.clientId, status: 'accepted' })),
        accepted: sessions.length,
        duplicates: 0,
        rejected: 0,
      };
    });

    await flush(post);
    expect(pendingCount()).toBe(5);
  });
});
