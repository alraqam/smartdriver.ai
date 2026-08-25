// The downloaded question bank, and the last-known figures that let the app
// render something honest while it has no connection.
//
// Storage is localStorage rather than IndexedDB, deliberately and with a
// ceiling. The bank is text — the current 54 questions are about 60KB, and a
// full ПДД set of a couple of thousand would be roughly 2MB against a 5MB
// budget. IndexedDB is the right answer past that, and the moment the bank
// outgrows this the download will start failing loudly (see `savePack`) rather
// than silently truncating.

const PACK_KEY = 'sdai.pack';
const READINESS_KEY = 'sdai.lastReadiness';

/// Rough ceiling before localStorage starts refusing writes. Checked before
/// committing so a too-large pack is reported as such instead of arriving as an
/// opaque QuotaExceededError halfway through a download.
export const MAX_PACK_BYTES = 4 * 1024 * 1024;

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function readPack() {
  const raw = localStorage.getItem(PACK_KEY);
  if (!raw) return null;
  const pack = safeParse(raw);
  // A pack that will not parse is a pack that is not there. Dropping it means
  // the next launch re-downloads rather than throwing on every screen.
  if (!pack || !Array.isArray(pack.questions) || !Array.isArray(pack.topics)) {
    localStorage.removeItem(PACK_KEY);
    return null;
  }
  return pack;
}

/// Everything the settings screen needs, without deserialising the whole bank.
export function packMeta() {
  const pack = readPack();
  if (!pack) return null;
  return {
    version: pack.version,
    savedAt: pack.savedAt ?? null,
    questionCount: pack.questions.length,
    topicCount: pack.topics.length,
    bytes: (localStorage.getItem(PACK_KEY) || '').length,
  };
}

export class PackTooLargeError extends Error {
  constructor(bytes) {
    super(`Pack is ${Math.round(bytes / 1024)}KB, over the ${Math.round(MAX_PACK_BYTES / 1024)}KB budget`);
    this.bytes = bytes;
  }
}

export function savePack(pack) {
  const body = JSON.stringify({ ...pack, savedAt: new Date().toISOString() });
  if (body.length > MAX_PACK_BYTES) throw new PackTooLargeError(body.length);
  try {
    localStorage.setItem(PACK_KEY, body);
  } catch (err) {
    // Out of quota — most likely something else on the origin, since the size
    // was just checked. Clear our own copy so the app is not left holding half
    // a pack it will try to practise from.
    localStorage.removeItem(PACK_KEY);
    throw err;
  }
  return packMeta();
}

export function clearPack() {
  localStorage.removeItem(PACK_KEY);
}

export function questionsForTopic(pack, topicId) {
  return pack ? pack.questions.filter((q) => q.topicId === topicId) : [];
}

/// Topics in the shape `GET /api/topics` returns, so the list and the road can
/// render from the pack without knowing where the data came from.
///
/// `progress` is null rather than zeroed: mastery lives on the server, and
/// claiming 0% for a topic the learner has been working on for a week would be
/// a lie the UI then draws a progress bar from. Null is the shape the API
/// already uses for "not known", and every screen handles it.
export function topicsFromPack(pack, locale = 'uz') {
  if (!pack) return [];
  const counts = new Map();
  for (const q of pack.questions) counts.set(q.topicId, (counts.get(q.topicId) ?? 0) + 1);

  return [...pack.topics]
    .sort((a, b) => a.order - b.order)
    .map((t) => ({
      id: t.id,
      slug: t.slug,
      order: t.order,
      title: locale === 'ru' ? t.titleRu : t.titleUz,
      titleUz: t.titleUz,
      titleRu: t.titleRu,
      questionCount: counts.get(t.id) ?? 0,
      progress: null,
    }));
}

// ── last-known readiness ────────────────────────────────────
//
// The result screen shows a readiness percentage, which only the server can
// compute — it is derived from mastery across every topic plus recent exams.
// Offline the honest thing is the last figure we were given, flagged as such,
// rather than either a blank or a number invented on the device.

export function rememberReadiness(readiness) {
  if (!readiness) return;
  try {
    localStorage.setItem(READINESS_KEY, JSON.stringify({ ...readiness, at: new Date().toISOString() }));
  } catch {
    // A cached nicety is never worth failing a request over.
  }
}

export function lastKnownReadiness() {
  const r = safeParse(localStorage.getItem(READINESS_KEY) || 'null');
  return r ? { ...r, stale: true } : null;
}
