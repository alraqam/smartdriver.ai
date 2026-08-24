// Question selection. Pure functions over plain data so the sampling rules are
// testable without a database — the alternative is a SQL query nobody can
// reason about and nobody can test.

import { MasteryState, topicWeight } from '../progress/mastery';

export interface Candidate {
  id: string;
  topicId: string;
  difficulty: number;
  /// How many of the learner's recent answers ago this question was last seen.
  /// Infinity = never seen.
  lastSeenAgo: number;
}

/// Questions seen within this many recent answers are held back, so a practice
/// set does not simply replay what the learner just did. Held back, not
/// banned: with a small bank, refusing outright would leave sets short.
export const RECENCY_WINDOW = 40;

/// Multiplier applied to a recently-seen question instead of excluding it.
export const RECENCY_PENALTY = 0.15;

/// Deterministic-if-you-pass-one RNG hook. Tests inject a fixed sequence;
/// production passes Math.random.
export type Rng = () => number;

function recencyFactor(c: Candidate): number {
  if (!Number.isFinite(c.lastSeenAgo)) return 1;
  if (c.lastSeenAgo >= RECENCY_WINDOW) return 1;
  // Linear ramp back to full weight as the question ages out of the window.
  const t = c.lastSeenAgo / RECENCY_WINDOW;
  return RECENCY_PENALTY + (1 - RECENCY_PENALTY) * t;
}

/// Weighted sampling WITHOUT replacement. Returns at most `count` ids.
///
/// Sampling without replacement is the point: a weighted draw with replacement
/// would hand the learner the same question twice in one set, which reads as a
/// bug no matter how correct the weighting was.
export function sampleWeighted(
  candidates: Candidate[],
  weightOf: (c: Candidate) => number,
  count: number,
  rng: Rng = Math.random,
): string[] {
  const pool = candidates.map((c) => ({ c, w: Math.max(1e-6, weightOf(c) * recencyFactor(c)) }));
  const picked: string[] = [];

  while (picked.length < count && pool.length > 0) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let r = rng() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].w;
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    picked.push(pool[idx].c.id);
    pool.splice(idx, 1);
  }

  return picked;
}

/// Practice within a single topic: every question equally likely, modulo the
/// recency penalty. No mastery weighting — the learner already chose the topic.
export function selectForTopic(
  candidates: Candidate[],
  count: number,
  rng: Rng = Math.random,
): string[] {
  return sampleWeighted(candidates, () => 1, count, rng);
}

/// Practice weighted toward what the learner keeps getting wrong.
export function selectWeakTopics(
  candidates: Candidate[],
  mastery: Map<string, MasteryState>,
  count: number,
  rng: Rng = Math.random,
): string[] {
  const empty: MasteryState = { attempts: 0, correct: 0, ewma: 0 };
  return sampleWeighted(
    candidates,
    (c) => topicWeight(mastery.get(c.topicId) ?? empty),
    count,
    rng,
  );
}

/// A mock exam: spread across topics and across difficulty, like the real one.
///
/// Deliberately NOT weighted by weakness. An exam is a measurement, and one
/// stacked with the learner's worst topics would measure something other than
/// what the real exam measures — and would make the readiness score it feeds
/// systematically pessimistic.
export function selectForExam(
  candidates: Candidate[],
  count: number,
  rng: Rng = Math.random,
): string[] {
  const byTopic = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const list = byTopic.get(c.topicId) ?? [];
    list.push(c);
    byTopic.set(c.topicId, list);
  }

  const topicIds = [...byTopic.keys()];
  if (topicIds.length === 0) return [];

  const picked: string[] = [];
  const taken = new Set<string>();

  // Round-robin over topics so every topic contributes before any contributes
  // twice. With 12 topics and 20 questions that gives 8 topics two questions
  // and 4 topics one, which is the spread the real exam has.
  let guard = 0;
  while (picked.length < count && guard++ < count * topicIds.length + topicIds.length) {
    let progressed = false;
    for (const t of topicIds) {
      if (picked.length >= count) break;
      const remaining = (byTopic.get(t) ?? []).filter((c) => !taken.has(c.id));
      if (remaining.length === 0) continue;
      const [id] = sampleWeighted(remaining, () => 1, 1, rng);
      if (!id) continue;
      picked.push(id);
      taken.add(id);
      progressed = true;
    }
    if (!progressed) break;
  }

  return picked;
}
