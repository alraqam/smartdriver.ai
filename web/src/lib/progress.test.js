import { describe, it, expect } from 'vitest';
import { computeStreak, daysUntilDue, deriveRoadNodes, initialOf, MASTERED_AT } from './progress.js';

const NOW = new Date('2026-03-15T14:00:00');
const daysAgo = (n, hour = 10) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return { startedAt: d.toISOString() };
};

describe('computeStreak', () => {
  it('is zero with no history', () => {
    expect(computeStreak([], NOW)).toBe(0);
    expect(computeStreak(undefined, NOW)).toBe(0);
  });

  it('counts consecutive days back from today', () => {
    expect(computeStreak([daysAgo(0), daysAgo(1), daysAgo(2)], NOW)).toBe(3);
  });

  // The case the implementation comment is about: asked in the morning, before
  // today's session. Reading 0 there would punish someone for being early.
  it('survives a day that has not been practised YET', () => {
    expect(computeStreak([daysAgo(1), daysAgo(2), daysAgo(3)], NOW)).toBe(3);
  });

  it('breaks once a full day is missed', () => {
    // Yesterday missed and nothing today — the run ended.
    expect(computeStreak([daysAgo(2), daysAgo(3)], NOW)).toBe(0);
  });

  it('stops at the first gap rather than counting every active day', () => {
    expect(computeStreak([daysAgo(0), daysAgo(1), daysAgo(3), daysAgo(4)], NOW)).toBe(2);
  });

  it('counts several sessions in one day once', () => {
    expect(computeStreak([daysAgo(0, 9), daysAgo(0, 13), daysAgo(0, 21), daysAgo(1)], NOW)).toBe(2);
  });

  it('is not confused by history arriving out of order', () => {
    expect(computeStreak([daysAgo(2), daysAgo(0), daysAgo(1)], NOW)).toBe(3);
  });

  it('counts a run that crosses a month boundary', () => {
    // 1 March back into February — the naive "subtract from the day number"
    // version of this breaks here.
    const now = new Date('2026-03-01T12:00:00');
    const on = (iso) => ({ startedAt: new Date(iso).toISOString() });
    expect(
      computeStreak(
        [on('2026-03-01T09:00'), on('2026-02-28T09:00'), on('2026-02-27T09:00')],
        now,
      ),
    ).toBe(3);
  });

  it('counts a run that crosses a leap day', () => {
    const now = new Date('2028-03-01T12:00:00');
    const on = (iso) => ({ startedAt: new Date(iso).toISOString() });
    expect(
      computeStreak([on('2028-03-01T09:00'), on('2028-02-29T09:00'), on('2028-02-28T09:00')], now),
    ).toBe(3);
  });

  it('does not let a future-dated session inflate the run', () => {
    expect(computeStreak([daysAgo(-3), daysAgo(0)], NOW)).toBe(1);
  });
});

describe('deriveRoadNodes', () => {
  const topic = (slug, attempts = 0, score = 0) => ({
    id: slug, slug, questionCount: 6,
    progress: { attempts, correct: 0, score, weak: score < 0.7 },
  });

  it('returns nothing for no topics', () => {
    expect(deriveRoadNodes([])).toEqual([]);
    expect(deriveRoadNodes(undefined)).toEqual([]);
  });

  it('marks a mastered topic done', () => {
    const [n] = deriveRoadNodes([topic('a', 10, MASTERED_AT)]);
    expect(n.status).toBe('done');
  });

  it('gives a learner who has done nothing a place to stand', () => {
    // Otherwise the car is parked at nothing on the first screen they see.
    const nodes = deriveRoadNodes([topic('a'), topic('b'), topic('c')]);
    expect(nodes[0].status).toBe('current');
    expect(nodes.filter((n) => n.status === 'current')).toHaveLength(1);
  });

  it('puts current on the first started-but-unmastered topic', () => {
    const nodes = deriveRoadNodes([
      topic('a', 10, 0.95),
      topic('b', 10, 0.90),
      topic('c', 4, 0.40),
      topic('d', 3, 0.30),
    ]);
    expect(nodes.map((n) => n.status)).toEqual(['done', 'done', 'current', 'open']);
  });

  it('marks the first untouched topic after the current one as next', () => {
    const nodes = deriveRoadNodes([topic('a', 5, 0.4), topic('b'), topic('c')]);
    expect(nodes.map((n) => n.status)).toEqual(['current', 'next', 'untouched']);
  });

  it('leaves a fully mastered road with nothing current', () => {
    // Every topic finished. Relabelling the first one "you are here" would
    // undo the one thing the road exists to show.
    const nodes = deriveRoadNodes([topic('a', 20, 0.95), topic('b', 20, 0.92)]);
    expect(nodes.map((n) => n.status)).toEqual(['done', 'done']);
  });

  it('never marks two topics current', () => {
    const nodes = deriveRoadNodes([topic('a', 3, 0.2), topic('b', 3, 0.3), topic('c', 3, 0.1)]);
    expect(nodes.filter((n) => n.status === 'current')).toHaveLength(1);
  });

  it('does not mark anything next when nothing is untouched', () => {
    const nodes = deriveRoadNodes([topic('a', 3, 0.2), topic('b', 3, 0.3)]);
    expect(nodes.some((n) => n.status === 'next')).toBe(false);
  });

  it('locks nothing — every topic stays reachable', () => {
    const nodes = deriveRoadNodes([topic('a'), topic('b'), topic('c'), topic('d')]);
    expect(nodes.every((n) => n.status !== 'locked')).toBe(true);
  });

  it('copes with a topic that has no progress object at all', () => {
    const nodes = deriveRoadNodes([{ id: 'x', slug: 'x', questionCount: 3, progress: null }]);
    expect(nodes[0].status).toBe('current');
    expect(nodes[0].score).toBe(0);
  });
});

describe('daysUntilDue', () => {
  it('is zero for something due today, whatever the hour', () => {
    expect(daysUntilDue(new Date('2026-03-15T23:59:00'), NOW)).toBe(0);
    expect(daysUntilDue(new Date('2026-03-15T00:01:00'), NOW)).toBe(0);
  });

  it('counts calendar days, not 24-hour blocks', () => {
    // 20 hours away, but it IS tomorrow — a learner reading "tomorrow" means
    // the next day, not "in 24 hours".
    expect(daysUntilDue(new Date('2026-03-16T10:00:00'), NOW)).toBe(1);
  });

  it('goes negative once overdue', () => {
    expect(daysUntilDue(new Date('2026-03-13T10:00:00'), NOW)).toBe(-2);
  });

  it('counts across a month boundary', () => {
    expect(daysUntilDue(new Date('2026-04-01T10:00:00'), new Date('2026-03-30T14:00:00'))).toBe(2);
  });
});

describe('initialOf', () => {
  it('takes the first letter of a name', () => {
    expect(initialOf({ name: 'Aziz' })).toBe('A');
    expect(initialOf({ name: 'aziz' })).toBe('A');
  });

  it('handles a non-Latin name', () => {
    expect(initialOf({ name: 'Ойбек' })).toBe('О');
  });

  it('returns null for a phone-only account', () => {
    // "+998…" would otherwise render a literal plus sign as the avatar.
    expect(initialOf({ phone: '+998901234567' })).toBeNull();
    expect(initialOf({ name: '   ' })).toBeNull();
    expect(initialOf(null)).toBeNull();
  });

  it('returns null rather than rendering punctuation', () => {
    expect(initialOf({ name: '!!!' })).toBeNull();
  });
});
