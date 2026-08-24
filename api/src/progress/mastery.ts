// Pure scoring logic — no database, no Nest, no I/O. Everything here is a
// function of numbers, which is what makes the behaviour testable and what
// keeps "why am I 68% ready?" answerable rather than mystical.

/// How fast the mastery estimate forgets. 0.3 means each new answer moves the
/// estimate 30% of the way toward it, so roughly the last ~10 answers dominate.
/// Lower would make a learner's early flailing follow them for weeks; higher
/// would make one lucky guess look like mastery.
export const EWMA_ALPHA = 0.3;

/// Below this, a topic counts as weak and gets over-weighted in practice.
export const WEAK_THRESHOLD = 0.7;

/// Answers needed in a topic before its score is treated as meaningful. With
/// fewer, one right answer would read as 100% mastery and the topic would
/// vanish from the practice rotation having barely been seen.
export const CONFIDENCE_MIN_ATTEMPTS = 5;

export interface MasteryState {
  attempts: number;
  correct: number;
  ewma: number;
}

/// Fold one answer into a topic's running estimate.
///
/// The first answer SETS the estimate rather than blending toward it from
/// zero: starting at 0 and stepping 30% would leave a learner who answered
/// their first question correctly sitting at 0.3, which reads as "weak" and is
/// simply false.
export function updateMastery(prev: MasteryState, isCorrect: boolean): MasteryState {
  const x = isCorrect ? 1 : 0;
  return {
    attempts: prev.attempts + 1,
    correct: prev.correct + x,
    ewma: prev.attempts === 0 ? x : prev.ewma + EWMA_ALPHA * (x - prev.ewma),
  };
}

/// How far to trust a topic's score, 0..1, ramping in over the first few
/// answers. Used to blend an unproven topic toward the neutral 0.5 rather than
/// letting a 1-of-1 topic claim certainty.
export function confidence(attempts: number): number {
  return Math.min(1, attempts / CONFIDENCE_MIN_ATTEMPTS);
}

/// The score shown to the learner and used for ordering: the raw estimate
/// pulled toward 0.5 in proportion to how little evidence backs it.
export function adjustedScore(m: MasteryState): number {
  if (m.attempts === 0) return 0;
  const c = confidence(m.attempts);
  return m.ewma * c + 0.5 * (1 - c);
}

export function isWeak(m: MasteryState): boolean {
  return m.attempts > 0 && adjustedScore(m) < WEAK_THRESHOLD;
}

/// A fully mastered topic still gets this much weight, so it keeps appearing
/// occasionally instead of leaving the rotation and quietly decaying.
export const WEIGHT_FLOOR = 0.15;
/// Added on top of the floor in proportion to how far from mastered a topic
/// is, so the worst possible touched topic weighs FLOOR + SPAN.
export const WEIGHT_SPAN = 3;
/// An untouched topic outranks even a topic answered wrong every time: a
/// demonstrated weakness is at least known, while a topic never opened could
/// be hiding a worse one. Derived from the touched maximum rather than
/// hardcoded, so tuning SPAN cannot silently invert the ordering.
export const WEIGHT_UNTOUCHED = WEIGHT_FLOOR + WEIGHT_SPAN * 1.1;

/// Selection weight for a topic when building a weak-topics practice set.
export function topicWeight(m: MasteryState): number {
  if (m.attempts === 0) return WEIGHT_UNTOUCHED;
  const gap = Math.max(0, 1 - adjustedScore(m));
  return WEIGHT_FLOOR + gap * WEIGHT_SPAN;
}

export interface ExamResult {
  /// Share correct, 0..1.
  score: number;
  passed: boolean;
  /// Most recent first.
  ageIndex: number;
}

export interface ReadinessInput {
  /// Per-topic mastery for every topic in the bank, including untouched ones.
  topics: MasteryState[];
  /// Recent mock exams, most recent first.
  exams: ExamResult[];
}

export interface Readiness {
  /// 0..100, what the learner is shown.
  percent: number;
  /// How much evidence backs it, 0..1. A high score on thin evidence is
  /// reported honestly rather than dressed up.
  confidence: number;
  coverage: number;
  examScore: number | null;
  masteryScore: number;
}

/// Blend of "do you know the material" (mastery across ALL topics, so gaps
/// count against you) and "can you pass the actual test" (recent mock exams).
///
/// Mock exams are weighted most heavily once they exist, because passing under
/// exam conditions is the thing being predicted. With no exams taken, the
/// score is mastery alone and `confidence` says so.
export function readiness(input: ReadinessInput): Readiness {
  const { topics, exams } = input;

  const touched = topics.filter((t) => t.attempts > 0);
  const coverage = topics.length === 0 ? 0 : touched.length / topics.length;

  // Averaged over EVERY topic, with untouched ones contributing 0. Otherwise a
  // learner who drilled one topic and ignored eleven would read as fully ready.
  const masteryScore =
    topics.length === 0
      ? 0
      : topics.reduce((sum, t) => sum + adjustedScore(t), 0) / topics.length;

  // Recent exams count more than old ones: 1, 1/2, 1/3, ...
  let examScore: number | null = null;
  if (exams.length > 0) {
    let num = 0;
    let den = 0;
    for (const e of exams) {
      const w = 1 / (e.ageIndex + 1);
      num += e.score * w;
      den += w;
    }
    examScore = num / den;
  }

  const examWeight = examScore === null ? 0 : Math.min(0.6, 0.3 * exams.length);
  const blended =
    examScore === null
      ? masteryScore
      : masteryScore * (1 - examWeight) + examScore * examWeight;

  const totalAttempts = topics.reduce((s, t) => s + t.attempts, 0);
  const conf = Math.min(1, (coverage * 0.5) + Math.min(1, totalAttempts / 100) * 0.3 + Math.min(1, exams.length / 3) * 0.2);

  return {
    percent: Math.round(blended * 100),
    confidence: Number(conf.toFixed(2)),
    coverage: Number(coverage.toFixed(2)),
    examScore: examScore === null ? null : Number(examScore.toFixed(3)),
    masteryScore: Number(masteryScore.toFixed(3)),
  };
}
