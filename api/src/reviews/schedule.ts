// Spaced repetition for the mistake bank.
//
// A question enters the bank the moment a learner gets it WRONG, and leaves
// once they have got it right enough times running. That is deliberately not
// "schedule every question the learner has ever seen": for an exam bank of
// several hundred items, scheduling everything buries the handful of questions
// someone actually struggles with, and "practise your mistakes" is the mental
// model a learner already has.
//
// The schedule is Leitner boxes rather than full SM-2. There is no
// self-reported difficulty grade to feed SM-2's easiness factor — the only
// signal is right or wrong — so its extra machinery would be fitting curves to
// data that does not exist.

/// Days until a question in each box comes back. Box 0 is due immediately:
/// a question just missed should reappear in the next review session, not
/// tomorrow. The last entry is the graduation interval.
export const BOX_INTERVALS_DAYS = [0, 1, 3, 7, 16];

/// Right answers in a row needed to leave the bank. Reaching this box means
/// the learner has recalled it correctly across four separate sittings spread
/// over roughly a month, which is a fair definition of "fixed".
export const MASTERED_BOX = BOX_INTERVALS_DAYS.length;

export interface ReviewState {
  box: number;
  /// Total times this question has been answered wrong, ever. Drives the
  /// ordering of the mistake bank and never decreases — a question that once
  /// caught someone out stays worth showing them.
  wrongCount: number;
  /// Right answers since the last mistake.
  rightStreak: number;
  dueAt: Date;
  lastWrongAt: Date | null;
  /// Graduated out of the review rotation. Kept, not deleted, so the mistake
  /// history stays honest and a later slip can revive it.
  mastered: boolean;
}

export const DAY_MS = 24 * 60 * 60 * 1000;

function dueAfterBox(box: number, now: Date): Date {
  const idx = Math.min(box, BOX_INTERVALS_DAYS.length - 1);
  return new Date(now.getTime() + BOX_INTERVALS_DAYS[idx] * DAY_MS);
}

/// Fold one answer into a question's review state.
///
/// Returns null when there is nothing to track: a question answered correctly
/// that was never missed does not belong in a mistake bank.
export function recordAnswer(
  prev: ReviewState | null,
  isCorrect: boolean,
  now: Date = new Date(),
): ReviewState | null {
  if (!prev) {
    if (isCorrect) return null;
    return {
      box: 0,
      wrongCount: 1,
      rightStreak: 0,
      dueAt: dueAfterBox(0, now),
      lastWrongAt: now,
      mastered: false,
    };
  }

  if (!isCorrect) {
    // Any miss sends it back to the start, including one that had already
    // graduated. Forgetting a rule you had "fixed" is exactly the signal the
    // bank exists to catch.
    return {
      box: 0,
      wrongCount: prev.wrongCount + 1,
      rightStreak: 0,
      dueAt: dueAfterBox(0, now),
      lastWrongAt: now,
      mastered: false,
    };
  }

  const box = prev.box + 1;
  return {
    box,
    wrongCount: prev.wrongCount,
    rightStreak: prev.rightStreak + 1,
    dueAt: dueAfterBox(box, now),
    lastWrongAt: prev.lastWrongAt,
    mastered: box >= MASTERED_BOX,
  };
}

export function isDue(state: ReviewState, now: Date = new Date()): boolean {
  return !state.mastered && state.dueAt.getTime() <= now.getTime();
}

/// How close a question is to being fixed, 0..1. Shown as a small bar in the
/// mistake bank so progress on a stubborn question is visible before it
/// graduates.
export function reviewProgress(state: ReviewState): number {
  return Math.min(1, state.box / MASTERED_BOX);
}
