import { MAX_BACKDATE_DAYS, clampSessionWindow } from './offline-window';

// These dates arrive from a device clock, and the streak on the home screen is
// counted from them. Everything here is about a wrong clock not being able to
// buy a streak or squat at the top of the history list.

const NOW = new Date('2026-08-25T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

describe('clampSessionWindow', () => {
  it('leaves a plausible window exactly as given', () => {
    const started = iso(NOW.getTime() - 10 * 60_000);
    const finished = iso(NOW.getTime() - 4 * 60_000);
    const out = clampSessionWindow(started, finished, NOW);
    expect(out.startedAt.toISOString()).toBe(started);
    expect(out.finishedAt.toISOString()).toBe(finished);
  });

  it('refuses a session from the future', () => {
    // The case that actually matters: a phone whose clock is a week fast would
    // otherwise hold a streak open for a week and sit atop the history list.
    const out = clampSessionWindow(
      iso(NOW.getTime() + 7 * DAY),
      iso(NOW.getTime() + 7 * DAY + 60_000),
      NOW,
    );
    expect(out.finishedAt.getTime()).toBe(NOW.getTime());
    expect(out.startedAt.getTime()).toBe(NOW.getTime());
  });

  it('pulls a factory-reset 1970 clock up to the backdating floor', () => {
    const out = clampSessionWindow(iso(0), iso(60_000), NOW);
    const floor = NOW.getTime() - MAX_BACKDATE_DAYS * DAY;
    expect(out.startedAt.getTime()).toBe(floor);
    expect(out.finishedAt.getTime()).toBe(floor);
  });

  it('never lets a session end before it began', () => {
    // Reversed input, which a clock that resyncs mid-drill produces for real.
    const out = clampSessionWindow(
      iso(NOW.getTime() - 60_000),
      iso(NOW.getTime() - 10 * 60_000),
      NOW,
    );
    expect(out.startedAt.getTime()).toBeLessThanOrEqual(out.finishedAt.getTime());
  });

  it('holds that ordering across a sweep of adversarial pairs', () => {
    const offsets = [-400 * DAY, -31 * DAY, -DAY, -60_000, 0, 60_000, DAY, 400 * DAY];
    for (const a of offsets) {
      for (const b of offsets) {
        const out = clampSessionWindow(iso(NOW.getTime() + a), iso(NOW.getTime() + b), NOW);
        expect(out.startedAt.getTime()).toBeLessThanOrEqual(out.finishedAt.getTime());
        expect(out.finishedAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
        expect(out.startedAt.getTime()).toBeGreaterThanOrEqual(
          NOW.getTime() - MAX_BACKDATE_DAYS * DAY,
        );
      }
    }
  });

  it('treats an unparseable date as now rather than losing the drill', () => {
    const out = clampSessionWindow('not-a-date', 'also-not', NOW);
    expect(out.startedAt.getTime()).toBe(NOW.getTime());
    expect(out.finishedAt.getTime()).toBe(NOW.getTime());
  });
});
