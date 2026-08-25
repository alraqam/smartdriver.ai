// Drills waiting to reach the server.
//
// A finished offline drill is real work the learner did, so it is written to
// the queue before anything is attempted over the network, and only removed
// once the server has said what happened to it. The queue survives reloads,
// crashes and the tab being closed mid-flush.
//
// Every entry carries the `clientId` the drill was created with, which is what
// makes flushing safe to retry: the server is idempotent on it, so a response
// lost to a dropped connection costs one wasted request, never a doubled score.

import { forgetLocalSession, toSyncPayload } from './localSession.js';

const QUEUE_KEY = 'sdai.syncQueue';

/// Matches the server's `@ArrayMaxSize(25)` on the sync request.
const BATCH = 25;

function read() {
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    return Array.isArray(q) ? q : [];
  } catch {
    return [];
  }
}

function write(queue) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function pending() {
  return read();
}

export function pendingCount() {
  return read().length;
}

export function enqueue(session) {
  const payload = toSyncPayload(session);
  if (payload.answers.length === 0) {
    // Nothing was answered, so there is nothing to sync and the server would
    // reject it anyway. Drop the local copy rather than queueing a certain
    // failure.
    forgetLocalSession(session.id);
    return pendingCount();
  }
  const queue = read().filter((q) => q.clientId !== payload.clientId);
  queue.push({ ...payload, localId: session.id, queuedAt: new Date().toISOString() });
  write(queue);
  return queue.length;
}

export function clearQueue() {
  write([]);
}

/// Push queued drills to the server.
///
/// `post` is injected so this is testable without a network: in the app it is
/// `api.syncSessions`.
///
/// Only entries the server actually ruled on are removed. Anything it did not
/// answer for — a batch beyond the size cap, a request that failed halfway —
/// stays queued for the next attempt.
export async function flush(post) {
  const queue = read();
  if (queue.length === 0) return { attempted: 0, accepted: 0, duplicates: 0, rejected: 0 };

  const batch = queue.slice(0, BATCH);
  const res = await post({ sessions: batch.map(({ localId, queuedAt, ...s }) => s) });

  const ruled = new Map((res.results ?? []).map((r) => [r.clientId, r.status]));
  const settled = batch.filter((entry) => ruled.has(entry.clientId));

  // `rejected` is settled too: it means the drill can never succeed — its
  // questions are gone from the bank — so retrying it forever would leave a
  // queue that never drains and a badge that never clears.
  for (const entry of settled) forgetLocalSession(entry.localId);
  const keep = read().filter((q) => !settled.some((s) => s.clientId === q.clientId));
  write(keep);

  return {
    attempted: batch.length,
    accepted: res.accepted ?? 0,
    duplicates: res.duplicates ?? 0,
    rejected: res.rejected ?? 0,
    remaining: keep.length,
    readiness: res.readiness ?? null,
  };
}
