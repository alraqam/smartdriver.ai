// Pure derivations shared by the road, the profile and the mistake bank.
//
// Extracted out of the components so they can be tested without rendering
// anything: all three are date or ordering logic where being subtly wrong
// produces a plausible-looking number rather than a visible break.

/// A topic counts as done at or above this score. Mirrors the same constant in
/// the lessons list, and is deliberately below 1.0 — insisting on a perfect
/// rolling average would mean no topic is ever finished.
export const MASTERED_AT = 0.85;

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/// Consecutive days, counting back from `now`, on which the learner practised.
///
/// Derived from session history rather than stored, because the sessions
/// already say when someone studied — a streak column would be a cache that
/// can disagree with them.
///
/// `now` is a parameter so the boundary behaviour is testable rather than
/// dependent on when the suite happens to run.
export function computeStreak(sessions, now = new Date()) {
  if (!sessions?.length) return 0;

  const days = new Set(sessions.map((s) => dayKey(new Date(s.startedAt))));
  const cursor = new Date(now);

  // A streak survives "not yet today": it breaks only once a FULL day is
  // missed. Without this it would read 0 every morning until the first
  // session, which punishes someone for being asked before they have studied.
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/// Where each topic sits along the road.
///
///   done       mastered
///   current    the first started-but-not-mastered topic — where the car sits
///   next       the first untouched topic after that
///   open       started, not mastered, but not the current one
///   untouched  never attempted
///
/// Nothing is ever locked: this is exam prep for adults, and refusing to let
/// someone practise pedestrians until they finish signals would be
/// gamification getting in the way of studying.
export function deriveRoadNodes(topics) {
  if (!topics?.length) return [];

  let currentTaken = false;
  let nextTaken = false;

  const nodes = topics.map((tp) => {
    const p = tp.progress;
    const score = p?.score ?? 0;
    const started = (p?.attempts ?? 0) > 0;

    let status;
    if (started && score >= MASTERED_AT) status = 'done';
    else if (started && !currentTaken) { status = 'current'; currentTaken = true; }
    else if (!started && !nextTaken && currentTaken) { status = 'next'; nextTaken = true; }
    else status = started ? 'open' : 'untouched';

    return { ...tp, status, score };
  });

  // A learner who has done NOTHING still needs a "you are here", or the car is
  // parked at nothing on the screen they see first.
  //
  // Conditioned on having started nothing, not merely on no node being
  // current: a learner who has mastered every topic also has no current node,
  // and relabelling their first finished topic "you are here" would undo the
  // one thing the road is there to show them.
  const startedAnything = topics.some((tp) => (tp.progress?.attempts ?? 0) > 0);
  if (!startedAnything) {
    nodes[0] = { ...nodes[0], status: 'current' };
  }
  return nodes;
}

/// Whole days from `now` until a review is due. Negative once overdue.
///
/// Counts calendar days rather than 24-hour blocks: a learner reading
/// "tomorrow" means the next day, not "in 24 hours".
export function daysUntilDue(dueAt, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const due = new Date(dueAt);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - start.getTime()) / 86400000);
}

/// First letter of a learner's name, or null when they only have a phone.
/// A phone-only account has no meaningful initial — "+998…" would render a
/// literal plus sign — so the caller shows an icon instead.
export function initialOf(user) {
  const name = (user?.name || '').trim();
  if (!name) return null;
  const ch = name.charAt(0);
  return /\p{L}|\p{N}/u.test(ch) ? ch.toUpperCase() : null;
}
