import { MasteryState } from '../progress/mastery';
import {
  Candidate,
  RECENCY_WINDOW,
  sampleWeighted,
  selectForExam,
  selectForTopic,
  selectWeakTopics,
} from './selection';

const cand = (id: string, topicId = 't1', lastSeenAgo = Infinity, difficulty = 3): Candidate => ({
  id,
  topicId,
  difficulty,
  lastSeenAgo,
});

/// A cycling RNG, so a test can pin exactly which bucket a draw lands in.
const seq = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

const mastery = (attempts: number, ewma: number): MasteryState => ({
  attempts,
  correct: Math.round(attempts * ewma),
  ewma,
});

describe('sampleWeighted', () => {
  it('never returns the same question twice in one set', () => {
    const pool = Array.from({ length: 10 }, (_, i) => cand(`q${i}`));
    const picked = sampleWeighted(pool, () => 1, 10, seq([0.5]));
    expect(new Set(picked).size).toBe(10);
  });

  it('returns everything available when asked for more than exists', () => {
    const pool = [cand('a'), cand('b')];
    expect(sampleWeighted(pool, () => 1, 20, Math.random)).toHaveLength(2);
  });

  it('returns nothing from an empty pool instead of throwing', () => {
    expect(sampleWeighted([], () => 1, 5, Math.random)).toEqual([]);
  });

  it('favours heavier candidates', () => {
    const pool = [cand('light'), cand('heavy')];
    let heavyFirst = 0;
    for (let i = 0; i < 400; i++) {
      const [first] = sampleWeighted(pool, (c) => (c.id === 'heavy' ? 20 : 1), 1);
      if (first === 'heavy') heavyFirst++;
    }
    expect(heavyFirst).toBeGreaterThan(300);
  });

  it('holds back a question the learner just saw', () => {
    const pool = [cand('fresh'), cand('justSeen', 't1', 1)];
    let freshFirst = 0;
    for (let i = 0; i < 400; i++) {
      const [first] = sampleWeighted(pool, () => 1, 1);
      if (first === 'fresh') freshFirst++;
    }
    expect(freshFirst).toBeGreaterThan(280);
  });

  it('restores a question to full weight once it ages out of the window', () => {
    const pool = [cand('a'), cand('b', 't1', RECENCY_WINDOW + 5)];
    let aFirst = 0;
    for (let i = 0; i < 600; i++) {
      const [first] = sampleWeighted(pool, () => 1, 1);
      if (first === 'a') aFirst++;
    }
    // Both at full weight, so this should be a near-even split.
    expect(aFirst).toBeGreaterThan(230);
    expect(aFirst).toBeLessThan(370);
  });
});

describe('selectForTopic', () => {
  it('draws the requested number of distinct questions', () => {
    const pool = Array.from({ length: 30 }, (_, i) => cand(`q${i}`));
    const picked = selectForTopic(pool, 10);
    expect(picked).toHaveLength(10);
    expect(new Set(picked).size).toBe(10);
  });
});

describe('selectWeakTopics', () => {
  it('draws mostly from the topic the learner keeps failing', () => {
    const pool = [
      ...Array.from({ length: 20 }, (_, i) => cand(`weak${i}`, 'weak')),
      ...Array.from({ length: 20 }, (_, i) => cand(`strong${i}`, 'strong')),
    ];
    const m = new Map<string, MasteryState>([
      ['weak', mastery(10, 0.2)],
      ['strong', mastery(10, 1.0)],
    ]);

    let weakCount = 0;
    for (let run = 0; run < 40; run++) {
      for (const id of selectWeakTopics(pool, m, 10)) {
        if (id.startsWith('weak')) weakCount++;
      }
    }
    // 400 draws total; weak should dominate well past an even split.
    expect(weakCount).toBeGreaterThan(260);
  });

  it('prioritises a topic never attempted over one already mastered', () => {
    const pool = [
      ...Array.from({ length: 20 }, (_, i) => cand(`untouched${i}`, 'untouched')),
      ...Array.from({ length: 20 }, (_, i) => cand(`known${i}`, 'known')),
    ];
    const m = new Map<string, MasteryState>([['known', mastery(20, 1.0)]]);

    let untouchedCount = 0;
    for (let run = 0; run < 40; run++) {
      for (const id of selectWeakTopics(pool, m, 10)) {
        if (id.startsWith('untouched')) untouchedCount++;
      }
    }
    // 400 draws. Untouched outweighs mastered ~23:1, but each run samples
    // without replacement from only 20 untouched questions, so the ceiling per
    // run is 10/10 and the realistic share is well above three quarters.
    expect(untouchedCount).toBeGreaterThan(300);
  });

  // An untouched topic and a topic answered wrong every time are DELIBERATELY
  // close in weight (3.45 vs 3.15) — both are urgent, and the ordering between
  // them is a tiebreak, not a landslide. Asserting a big sampling gap here
  // would be asserting more than the design intends, so the strict ordering is
  // pinned on the weight function itself (see mastery.spec.ts) and this only
  // checks that the untouched topic is not starved.
  it('does not starve an untouched topic against one answered wrong every time', () => {
    const pool = [
      ...Array.from({ length: 20 }, (_, i) => cand(`untouched${i}`, 'untouched')),
      ...Array.from({ length: 20 }, (_, i) => cand(`bad${i}`, 'bad')),
    ];
    const m = new Map<string, MasteryState>([['bad', mastery(10, 0.0)]]);

    let untouchedCount = 0;
    const draws = 200 * 10;
    for (let run = 0; run < 200; run++) {
      for (const id of selectWeakTopics(pool, m, 10)) {
        if (id.startsWith('untouched')) untouchedCount++;
      }
    }
    expect(untouchedCount / draws).toBeGreaterThan(0.45);
  });
});

describe('selectForExam', () => {
  const twelveTopics = () =>
    Array.from({ length: 12 }, (_, t) =>
      Array.from({ length: 10 }, (_, i) => cand(`t${t}-q${i}`, `topic${t}`)),
    ).flat();

  it('spreads 20 questions across every topic before repeating any', () => {
    const picked = selectForExam(twelveTopics(), 20);
    expect(picked).toHaveLength(20);
    expect(new Set(picked).size).toBe(20);

    const perTopic = new Map<string, number>();
    for (const id of picked) {
      const topic = id.split('-')[0];
      perTopic.set(topic, (perTopic.get(topic) ?? 0) + 1);
    }
    // All 12 topics represented; none more than twice.
    expect(perTopic.size).toBe(12);
    expect(Math.max(...perTopic.values())).toBeLessThanOrEqual(2);
  });

  it('does not let a large topic dominate the exam', () => {
    // A bank where one topic has 200 questions and the rest have 5 must still
    // produce an even spread — otherwise the mock exam quietly becomes a test
    // of whichever topic the content team happened to write most about.
    const lopsided = [
      ...Array.from({ length: 200 }, (_, i) => cand(`big-q${i}`, 'big')),
      ...Array.from({ length: 5 }, (_, i) => cand(`s1-q${i}`, 'small1')),
      ...Array.from({ length: 5 }, (_, i) => cand(`s2-q${i}`, 'small2')),
      ...Array.from({ length: 5 }, (_, i) => cand(`s3-q${i}`, 'small3')),
    ];
    const picked = selectForExam(lopsided, 12);
    const perTopic = new Map<string, number>();
    for (const id of picked) {
      const topic = id.split('-')[0];
      perTopic.set(topic, (perTopic.get(topic) ?? 0) + 1);
    }
    expect(perTopic.size).toBe(4);
    expect(perTopic.get('big')).toBe(3);
  });

  it('degrades gracefully when the bank is smaller than the exam', () => {
    const small = [cand('a', 'topic0'), cand('b', 'topic1')];
    expect(selectForExam(small, 20)).toHaveLength(2);
  });

  it('returns nothing when there are no questions at all', () => {
    expect(selectForExam([], 20)).toEqual([]);
  });

  it('handles a bank where every question is in one topic', () => {
    const oneTopic = Array.from({ length: 30 }, (_, i) => cand(`q${i}`, 'only'));
    const picked = selectForExam(oneTopic, 20);
    expect(picked).toHaveLength(20);
    expect(new Set(picked).size).toBe(20);
  });
});
