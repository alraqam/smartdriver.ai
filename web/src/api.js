// Thin fetch wrapper. Owns the token, so no page has to think about auth.

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

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
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

  topics: (locale) => request(`/topics${locale ? `?locale=${locale}` : ''}`),
  topicRules: (id, locale) => request(`/topics/${id}/rules${locale ? `?locale=${locale}` : ''}`),
  progress: (locale) => request(`/me/progress${locale ? `?locale=${locale}` : ''}`),
  reviews: (locale, filter) =>
    request(`/me/reviews?${new URLSearchParams({ ...(locale ? { locale } : {}), ...(filter ? { filter } : {}) })}`),

  createSession: (payload) => request('/sessions', { method: 'POST', body: payload }),
  getSession: (id) => request(`/sessions/${id}`),
  answer: (id, payload) => request(`/sessions/${id}/answer`, { method: 'POST', body: payload }),
  finish: (id) => request(`/sessions/${id}/finish`, { method: 'POST' }),
  sessions: () => request('/sessions'),

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
