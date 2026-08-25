// Thin fetch wrapper. Owns the token, so no page has to think about auth — and,
// where a downloaded pack makes it possible, owns the offline fallback too, so
// no page has to think about the network either.

import {
  lastKnownReadiness,
  packMeta,
  readPack,
  rememberReadiness,
  savePack,
  topicsFromPack,
} from './lib/offlinePack.js';
import {
  applyAnswer,
  createLocalSession,
  finishLocal,
  isLocalSessionId,
  loadLocalSession,
  toSessionShape,
} from './lib/localSession.js';
import { enqueue, flush, pendingCount } from './lib/offlineQueue.js';

const BASE = '/api';
const TOKEN_KEY = 'sdai.token';
const USER_KEY = 'sdai.user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, auth = true, headers: extra } = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // The request never reached the server: no signal, aeroplane mode, the API
    // down. Status 0 marks it as "no answer at all", which is a different thing
    // from any HTTP status and is the one case a retry is genuinely likely to
    // fix. ErrorNote turns it into a translated message; the raw rejection here
    // is an untranslated "Failed to fetch".
    throw new ApiError(0, 'offline');
  }

  if (res.status === 401 && auth) {
    // The token is gone or expired. Drop it and send them back to sign-in
    // rather than letting every subsequent page render an error.
    clearSession();
    if (!location.hash.startsWith('#/login')) location.hash = '#/login';
    throw new ApiError(401, 'Sessiya tugadi');
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join(', ') : data?.message;
    throw new ApiError(res.status, msg || `Xatolik (${res.status})`);
  }
  return data;
}

/// A request that got no answer at all, as opposed to one the server refused.
/// Only this is worth falling back to the pack for — a 400 or a 409 means the
/// server is right there and has an opinion.
const isOffline = (err) => err instanceof ApiError && err.status === 0;

/// The pack, but only if it is usable for practice.
const offlineCapable = () => {
  const pack = readPack();
  return pack && pack.questions.length > 0 ? pack : null;
};

const topicIndex = (pack) => new Map((pack?.topics ?? []).map((t) => [t.id, t]));

export const api = {
  health: () => request('/health', { auth: false }),
  examConfig: () => request('/meta/exam', { auth: false }),

  requestOtp: (phone) => request('/auth/otp/request', { method: 'POST', body: { phone }, auth: false }),
  verifyOtp: async (phone, code) => {
    const r = await request('/auth/otp/verify', { method: 'POST', body: { phone, code }, auth: false });
    setSession(r.accessToken, r.user);
    return r;
  },
  me: () => request('/auth/me'),
  updateMe: async (patch) => {
    const user = await request('/me', { method: 'PATCH', body: patch });
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  },

  topics: async (locale) => {
    try {
      return await request(`/topics${locale ? `?locale=${locale}` : ''}`);
    } catch (err) {
      // Without this the topic list is an error screen offline, and a downloaded
      // pack is unreachable through the UI — the one moment it exists for.
      const pack = offlineCapable();
      if (!isOffline(err) || !pack) throw err;
      return topicsFromPack(pack, locale);
    }
  },
  topicRules: async (id, locale) => {
    try {
      return await request(`/topics/${id}/rules${locale ? `?locale=${locale}` : ''}`);
    } catch (err) {
      const pack = offlineCapable();
      const topic = pack?.topics.find((x) => x.id === id);
      if (!isOffline(err) || !topic) throw err;
      // The rule text lives only on the server, so offline this screen loses
      // its body copy. It keeps the one thing that matters here — the button
      // that starts a drill — because an error page at the entry point to
      // practice would make the downloaded pack unreachable.
      return {
        topic: { id: topic.id, slug: topic.slug, title: locale === 'ru' ? topic.titleRu : topic.titleUz },
        questionCount: pack.questions.filter((q) => q.topicId === id).length,
        rules: [],
        offline: true,
      };
    }
  },
  progress: async (locale) => {
    try {
      const p = await request(`/me/progress${locale ? `?locale=${locale}` : ''}`);
      // Stashed on the way past, so a drill finished offline can show the last
      // readiness we were actually given instead of a number invented on
      // device.
      rememberReadiness(p.readiness);
      return p;
    } catch (err) {
      if (!isOffline(err) || !offlineCapable()) throw err;
      // Mastery is the server's to compute. Offline the home screen renders
      // from the pack's topics with the last readiness we were given — marked
      // stale — rather than showing an error where the road should be.
      return {
        readiness: lastKnownReadiness() ?? { percent: 0, confidence: 0, stale: true },
        topics: [],
        weakest: [],
        offline: true,
      };
    }
  },
  reviews: (locale, filter) =>
    request(`/me/reviews?${new URLSearchParams({ ...(locale ? { locale } : {}), ...(filter ? { filter } : {}) })}`),

  // The four session calls each try the server first and fall back to the pack
  // only when the request got no answer at all. Online behaviour is therefore
  // exactly what it was; offline is a graceful degradation rather than a second
  // mode the app can get stuck in.
  createSession: async (payload) => {
    if (payload.mode === 'practice' && payload.topicId) {
      const pack = offlineCapable();
      // Skip the round trip entirely when the browser already knows it is
      // offline — waiting out a doomed request before starting a drill is a
      // few seconds of nothing on the exact connection that can least spare it.
      if (pack && navigator.onLine === false) {
        return toSessionShape(createLocalSession(pack, payload), pack, topicIndex(pack));
      }
      try {
        return await request('/sessions', { method: 'POST', body: payload });
      } catch (err) {
        if (!isOffline(err) || !pack) throw err;
        return toSessionShape(createLocalSession(pack, payload), pack, topicIndex(pack));
      }
    }
    // Exams, weak-topic drills and review drills need the server: the first
    // because a self-marked exam is not an exam, the other two because only the
    // server knows which questions are weak or owed.
    return request('/sessions', { method: 'POST', body: payload });
  },

  getSession: (id) => {
    if (!isLocalSessionId(id)) return request(`/sessions/${id}`);
    const pack = readPack();
    const session = loadLocalSession(id);
    if (!session || !pack) throw new ApiError(404, 'Sessiya topilmadi');
    return Promise.resolve(toSessionShape(session, pack, topicIndex(pack)));
  },

  answer: (id, payload) => {
    if (!isLocalSessionId(id)) {
      return request(`/sessions/${id}/answer`, { method: 'POST', body: payload });
    }
    const pack = readPack();
    const session = loadLocalSession(id);
    if (!session || !pack) throw new ApiError(404, 'Sessiya topilmadi');
    return Promise.resolve(applyAnswer(session, pack, payload.itemId, payload.optionId, payload.msSpent));
  },

  finish: async (id) => {
    if (!isLocalSessionId(id)) return request(`/sessions/${id}/finish`, { method: 'POST' });
    const pack = readPack();
    const session = loadLocalSession(id);
    if (!session || !pack) throw new ApiError(404, 'Sessiya topilmadi');

    const result = finishLocal(session, pack, topicIndex(pack));
    // Queued before anything is attempted over the network: the drill is real
    // work, and it must survive the tab closing between here and the next
    // successful connection.
    enqueue(session);
    // Opportunistic — if there happens to be a connection, the result screen is
    // the natural moment to use it. Failure is expected and silent; the queue
    // is flushed again on the next `online` event and on the next launch.
    void api.syncNow().catch(() => {});
    return result;
  },

  sessions: async () => {
    try {
      return await request('/sessions');
    } catch (err) {
      if (!isOffline(err) || !offlineCapable()) throw err;
      // History is the server's. An empty list understates the streak for as
      // long as the device is offline, which is a smaller wrong than an error
      // screen — and it corrects itself on the next successful load.
      return [];
    }
  },

  // ── offline pack ────────────────────────────────────────
  /// Download the bank, conditionally.
  ///
  /// Not routed through `request()`: a 304 is a success with no body, and that
  /// helper treats every non-2xx as a failure — correctly, for every other
  /// endpoint. Returning `{ unchanged: true }` lets the caller keep what it has
  /// without re-parsing megabytes it already holds.
  offlinePack: async (etag) => {
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (etag) headers['If-None-Match'] = `"${etag}"`;

    let res;
    try {
      res = await fetch(`${BASE}/offline/pack`, { headers });
    } catch {
      throw new ApiError(0, 'offline');
    }
    if (res.status === 304) return { unchanged: true };
    if (res.status === 401) {
      clearSession();
      throw new ApiError(401, 'Sessiya tugadi');
    }
    if (!res.ok) throw new ApiError(res.status, `Xatolik (${res.status})`);
    return res.json();
  },
  offlineVersion: () => request('/offline/version'),
  syncSessions: (body) => request('/sessions/sync', { method: 'POST', body }),

  /// Fetch the bank, or confirm the copy on this device is still current.
  downloadPack: async () => {
    const have = packMeta();
    const res = await api.offlinePack(have?.version);
    if (res.unchanged) return { ...have, unchanged: true };
    return { ...savePack(res), unchanged: false };
  },

  /// Flush the queue if there is anything in it. Safe to call whenever —
  /// it is a no-op on an empty queue and idempotent on the server.
  syncNow: async () => {
    // Without a token the request would 401, and a 401 clears the session — so
    // an unauthenticated flush would sign the learner out to deliver work they
    // did while signed in. The queue simply waits.
    if (!getToken() || pendingCount() === 0) return null;
    const res = await flush(api.syncSessions);
    if (res?.readiness) rememberReadiness(res.readiness);
    return res;
  },

  explain: (questionId, payload) =>
    request(`/questions/${questionId}/explain`, { method: 'POST', body: payload }),

  admin: {
    stats: () => request('/admin/stats'),
    questions: (params) => request(`/admin/questions?${new URLSearchParams(params)}`),
    setStatus: (id, status) => request(`/admin/questions/${id}/status`, { method: 'PATCH', body: { status } }),
    setStatusBulk: (ids, status) => request('/admin/questions/status', { method: 'POST', body: { ids, status } }),
    imports: (take = 20) => request(`/admin/imports?take=${take}`),
    aiUsage: (days = 30) => request(`/admin/ai-usage?days=${days}`),
    import: (rows, filename, opts = {}) =>
      request('/admin/import', { method: 'POST', body: { rows, filename, ...opts } }),
    updateQuestion: (id, patch) => request(`/admin/questions/${id}`, { method: 'PATCH', body: patch }),
    /// Multipart, so it bypasses the JSON request() helper.
    uploadImage: async (file) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin/uploads', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new ApiError(res.status, data?.message || `Xatolik (${res.status})`);
      return data;
    },
  },

  tutorThreads: () => request('/tutor/threads'),
  createThread: (locale) => request('/tutor/threads', { method: 'POST', body: { locale } }),
  getThread: (id) => request(`/tutor/threads/${id}`),
  tutorQuota: () => request('/tutor/quota'),

  /// Streams a tutor answer. Calls onEvent for each SSE frame as it arrives,
  /// so the answer appears word by word instead of after a long blank pause.
  askTutor: async (threadId, question, onEvent) => {
    const res = await fetch(`${BASE}/tutor/threads/${threadId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ question }),
    });
    if (res.status === 401) {
      clearSession();
      location.hash = '#/login';
      throw new ApiError(401, 'Sessiya tugadi');
    }
    if (!res.body) throw new ApiError(res.status, 'Stream mavjud emas');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line; anything after the last one
      // is a partial frame and stays in the buffer.
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const ev = /^event: (.+)$/m.exec(frame);
        const da = /^data: (.+)$/m.exec(frame);
        if (!ev || !da) continue;
        try {
          onEvent(ev[1], JSON.parse(da[1]));
        } catch {
          /* ignore a malformed frame rather than killing the stream */
        }
      }
    }
  },
};
