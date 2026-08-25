/// How far back a synced drill is allowed to claim it happened.
export const MAX_BACKDATE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/// Pin an offline session's timestamps to a window the server is willing to
/// believe.
///
/// These two dates come from a device clock, and device clocks on cheap phones
/// are wrong more often than anyone expects — factory-reset handsets come up in
/// 1970, and a phone left without a SIM drifts. The dates are not cosmetic: the
/// streak on the home screen counts distinct session days, and `list()` orders
/// history by `startedAt`. A drill claiming next week would sit at the top of
/// the learner's history forever and hold a streak open that they never earned.
///
/// So: nothing in the future, nothing older than the backdating window, and
/// `startedAt` never after `finishedAt`. Clamped rather than rejected — a wrong
/// clock is the phone's fault, and the learner still did the work.
export function clampSessionWindow(
  startedAt: string,
  finishedAt: string,
  now: Date = new Date(),
): { startedAt: Date; finishedAt: Date } {
  const ceiling = now.getTime();
  const floor = ceiling - MAX_BACKDATE_DAYS * DAY_MS;

  // An unparseable date is treated as "just now" rather than as an error: the
  // shape was already validated as ISO-8601, so reaching this means something
  // exotic, and losing the drill over it would be a poor trade.
  const at = (iso: string) => {
    const t = Date.parse(iso);
    return Number.isNaN(t) ? ceiling : t;
  };

  const finished = Math.min(Math.max(at(finishedAt), floor), ceiling);
  // Bounded above by `finished`, so a session can never have ended before it
  // began no matter what the two raw values were.
  const started = Math.min(Math.max(at(startedAt), floor), finished);

  return { startedAt: new Date(started), finishedAt: new Date(finished) };
}
