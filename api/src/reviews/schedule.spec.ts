import {
  BOX_INTERVALS_DAYS,
  DAY_MS,
  MASTERED_BOX,
  ReviewState,
  isDue,
  recordAnswer,
  reviewProgress,
} from './schedule';

const T0 = new Date('2026-03-01T09:00:00.000Z');
const at = (days: number) => new Date(T0.getTime() + days * DAY_MS);

/// Drive a question through a sequence of answers, returning the final state.
function play(answers: boolean[], start: ReviewState | null = null) {
  let state = start;
  answers.forEach((ok, i) => {
    state = recordAnswer(state, ok, at(i * 30));
  });
  return state;
}

describe('recordAnswer — entering the bank', () => {
  it('does not track a question answered right the first time', () => {
    // A mistake bank of questions nobody got wrong is just the question bank.
    expect(recordAnswer(null, true, T0)).toBeNull();
  });

  it('adds a question the moment it is answered wrong', () => {
    const s = recordAnswer(null, false, T0)!;
    expect(s.box).toBe(0);
    expect(s.wrongCount).toBe(1);
    expect(s.rightStreak).toBe(0);
    expect(s.mastered).toBe(false);
    expect(s.lastWrongAt).toEqual(T0);
  });

  it('makes a freshly missed question due immediately', () => {
    // It should come back in the next review session, not tomorrow.
    const s = recordAnswer(null, false, T0)!;
    expect(isDue(s, T0)).toBe(true);
  });
});

describe('recordAnswer — promotion', () => {
  it('advances a box on each right answer', () => {
    let s = recordAnswer(null, false, T0)!;
    s = recordAnswer(s, true, T0)!;
    expect(s.box).toBe(1);
    expect(s.rightStreak).toBe(1);
  });

  it('pushes the due date further out with each box', () => {
    let s = recordAnswer(null, false, T0)!;
    const gaps: number[] = [];
    for (let i = 0; i < BOX_INTERVALS_DAYS.length - 1; i++) {
      s = recordAnswer(s, true, T0)!;
      gaps.push(Math.round((s.dueAt.getTime() - T0.getTime()) / DAY_MS));
    }
    // Strictly increasing — the whole point of spacing.
    expect(gaps).toEqual([...gaps].sort((a, b) => a - b));
    expect(new Set(gaps).size).toBe(gaps.length);
  });

  it('is not due again until its interval has passed', () => {
    let s = recordAnswer(null, false, T0)!;
    s = recordAnswer(s, true, T0)!; // box 1 → due in 1 day
    expect(isDue(s, T0)).toBe(false);
    expect(isDue(s, at(0.5))).toBe(false);
    expect(isDue(s, at(1.1))).toBe(true);
  });

  it('graduates after a full run of right answers', () => {
    const s = play([false, ...Array(MASTERED_BOX).fill(true)])!;
    expect(s.mastered).toBe(true);
    expect(s.box).toBeGreaterThanOrEqual(MASTERED_BOX);
  });

  it('stops surfacing a graduated question', () => {
    const s = play([false, ...Array(MASTERED_BOX).fill(true)])!;
    // Even far in the future — mastered means gone from the rotation.
    expect(isDue(s, at(9999))).toBe(false);
  });
});

describe('recordAnswer — demotion', () => {
  it('sends a missed question back to the start', () => {
    let s = play([false, true, true])!;
    expect(s.box).toBe(2);
    s = recordAnswer(s, false, T0)!;
    expect(s.box).toBe(0);
    expect(s.rightStreak).toBe(0);
    expect(isDue(s, T0)).toBe(true);
  });

  it('revives a question that had already graduated', () => {
    // Forgetting a rule you had fixed is exactly what the bank is for.
    let s = play([false, ...Array(MASTERED_BOX).fill(true)])!;
    expect(s.mastered).toBe(true);
    s = recordAnswer(s, false, T0)!;
    expect(s.mastered).toBe(false);
    expect(s.box).toBe(0);
  });

  it('never lets the lifetime wrong count go down', () => {
    let s = play([false, false, true, true])!;
    expect(s.wrongCount).toBe(2);
    s = recordAnswer(s, true, T0)!;
    expect(s.wrongCount).toBe(2);
    s = recordAnswer(s, false, T0)!;
    expect(s.wrongCount).toBe(3);
  });

  it('records when the most recent mistake happened', () => {
    let s = recordAnswer(null, false, T0)!;
    s = recordAnswer(s, true, at(1))!;
    expect(s.lastWrongAt).toEqual(T0); // a right answer does not move it
    s = recordAnswer(s, false, at(5))!;
    expect(s.lastWrongAt).toEqual(at(5));
  });
});

describe('reviewProgress', () => {
  it('is zero for a question just missed and one when fixed', () => {
    expect(reviewProgress(recordAnswer(null, false, T0)!)).toBe(0);
    expect(reviewProgress(play([false, ...Array(MASTERED_BOX).fill(true)])!)).toBe(1);
  });

  it('rises monotonically as the question is recalled', () => {
    let s = recordAnswer(null, false, T0)!;
    let last = reviewProgress(s);
    for (let i = 0; i < MASTERED_BOX; i++) {
      s = recordAnswer(s, true, T0)!;
      const p = reviewProgress(s);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
    expect(last).toBe(1);
  });

  it('never exceeds one, however long the right streak', () => {
    const s = play([false, ...Array(30).fill(true)])!;
    expect(reviewProgress(s)).toBe(1);
  });
});
