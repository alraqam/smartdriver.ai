import {
  MasteryState,
  adjustedScore,
  confidence,
  isWeak,
  readiness,
  topicWeight,
  updateMastery,
} from './mastery';

const fresh = (): MasteryState => ({ attempts: 0, correct: 0, ewma: 0 });

const after = (answers: boolean[]): MasteryState =>
  answers.reduce((m, a) => updateMastery(m, a), fresh());

describe('updateMastery', () => {
  it('sets the estimate from the first answer rather than blending up from zero', () => {
    // A learner who gets their first question right is not 30% competent.
    expect(after([true]).ewma).toBe(1);
    expect(after([false]).ewma).toBe(0);
  });

  it('counts attempts and correct answers exactly', () => {
    const m = after([true, false, true, true]);
    expect(m.attempts).toBe(4);
    expect(m.correct).toBe(3);
  });

  it('weights recent answers more than old ones', () => {
    // Same 5 answers, opposite order: the one ending on successes scores higher.
    const improving = after([false, false, false, true, true]);
    const declining = after([true, true, false, false, false]);
    expect(improving.ewma).toBeGreaterThan(declining.ewma);
  });

  it('converges toward 1 for a consistently correct learner', () => {
    expect(after(Array(20).fill(true)).ewma).toBeGreaterThan(0.95);
  });
});

describe('adjustedScore', () => {
  it('discounts a perfect score that rests on one answer', () => {
    // 1-of-1 must not read as full mastery.
    expect(adjustedScore(after([true]))).toBeLessThan(0.7);
  });

  it('approaches the raw estimate once enough answers exist', () => {
    const m = after(Array(10).fill(true));
    expect(adjustedScore(m)).toBeCloseTo(m.ewma, 5);
  });

  it('is zero for a topic never attempted', () => {
    expect(adjustedScore(fresh())).toBe(0);
  });
});

describe('confidence', () => {
  it('ramps in over the first few answers and then saturates', () => {
    expect(confidence(0)).toBe(0);
    expect(confidence(5)).toBe(1);
    expect(confidence(50)).toBe(1);
  });
});

describe('isWeak', () => {
  it('flags a topic the learner keeps missing', () => {
    expect(isWeak(after([false, false, false, true, false, false]))).toBe(true);
  });

  it('does not flag a topic the learner has proven', () => {
    expect(isWeak(after(Array(10).fill(true)))).toBe(false);
  });

  it('does not flag an untouched topic — there is nothing to be weak at yet', () => {
    // Untouched topics are handled by topicWeight, not by isWeak.
    expect(isWeak(fresh())).toBe(false);
  });
});

describe('topicWeight', () => {
  it('ranks an untouched topic above a merely weak one', () => {
    // A gap you have never looked at matters more than one you are bad at.
    expect(topicWeight(fresh())).toBeGreaterThan(topicWeight(after([false, false, false, false, false])));
  });

  it('gives a weak topic more weight than a strong one', () => {
    expect(topicWeight(after(Array(10).fill(false)))).toBeGreaterThan(
      topicWeight(after(Array(10).fill(true))),
    );
  });

  it('never drops a mastered topic to zero', () => {
    // Otherwise a topic you once knew silently leaves the rotation and decays.
    expect(topicWeight(after(Array(20).fill(true)))).toBeGreaterThan(0);
  });
});

describe('readiness', () => {
  const twelveTopics = (m: MasteryState) => Array.from({ length: 12 }, () => ({ ...m }));

  it('is zero for a learner who has done nothing', () => {
    const r = readiness({ topics: twelveTopics(fresh()), exams: [] });
    expect(r.percent).toBe(0);
    expect(r.confidence).toBe(0);
  });

  it('counts untouched topics against the score', () => {
    // One topic mastered, eleven untouched, is not "ready".
    const topics = twelveTopics(fresh());
    topics[0] = after(Array(20).fill(true));
    const r = readiness({ topics, exams: [] });
    expect(r.percent).toBeLessThan(20);
    expect(r.coverage).toBeCloseTo(1 / 12, 2);
  });

  it('rates a learner strong across every topic as ready', () => {
    const r = readiness({ topics: twelveTopics(after(Array(20).fill(true))), exams: [] });
    expect(r.percent).toBeGreaterThan(90);
  });

  it('lets recent mock exams pull the score down', () => {
    const topics = twelveTopics(after(Array(20).fill(true)));
    const withoutExams = readiness({ topics, exams: [] });
    const withFailedExams = readiness({
      topics,
      exams: [
        { score: 0.5, passed: false, ageIndex: 0 },
        { score: 0.5, passed: false, ageIndex: 1 },
      ],
    });
    expect(withFailedExams.percent).toBeLessThan(withoutExams.percent);
  });

  it('weights a recent exam more heavily than an older one', () => {
    const topics = twelveTopics(after(Array(20).fill(true)));
    const improving = readiness({
      topics,
      exams: [
        { score: 1.0, passed: true, ageIndex: 0 },
        { score: 0.4, passed: false, ageIndex: 1 },
      ],
    });
    const declining = readiness({
      topics,
      exams: [
        { score: 0.4, passed: false, ageIndex: 0 },
        { score: 1.0, passed: true, ageIndex: 1 },
      ],
    });
    expect(improving.percent).toBeGreaterThan(declining.percent);
  });

  it('reports low confidence when the score rests on thin evidence', () => {
    const topics = twelveTopics(fresh());
    topics[0] = after([true, true]);
    expect(readiness({ topics, exams: [] }).confidence).toBeLessThan(0.3);
  });

  it('reports high confidence for broad practice plus several exams', () => {
    const r = readiness({
      topics: twelveTopics(after(Array(10).fill(true))),
      exams: [
        { score: 0.9, passed: true, ageIndex: 0 },
        { score: 0.85, passed: true, ageIndex: 1 },
        { score: 0.95, passed: true, ageIndex: 2 },
      ],
    });
    expect(r.confidence).toBeGreaterThan(0.9);
  });

  it('never exceeds 100 or falls below 0', () => {
    const best = readiness({
      topics: twelveTopics(after(Array(50).fill(true))),
      exams: Array.from({ length: 5 }, (_, i) => ({ score: 1, passed: true, ageIndex: i })),
    });
    expect(best.percent).toBeLessThanOrEqual(100);
    expect(best.percent).toBeGreaterThanOrEqual(0);
  });
});
