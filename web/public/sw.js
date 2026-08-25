/* SmartDriverAi service worker.
 *
 * Hand-written rather than generated. The frontend has three dependencies; a
 * build-time PWA plugin would be the largest thing in it, to produce roughly
 * this file. Sixty lines of routing is cheaper to read than a plugin's config.
 *
 * The one rule that matters: /api is never touched, with a single narrow
 * exception for question diagrams (see the fetch handler). Auth, sessions,
 * exams and the tutor must all be live. A cached exam paper, a cached
 * /auth/me, or a cached answer key is worse than being honestly offline — and
 * answering a question against a stale session would silently lose the
 * learner's progress. So this caches the shell, the static assets and the
 * diagrams, and nothing else.
 *
 * What that buys: the app opens instantly on a patchy mobile connection, and
 * the sign library — which is bundled, not fetched — works with no network at
 * all. Practice works offline too, but not because of this file: it needs a
 * question pack the learner downloads deliberately, and the answers it produces
 * are queued and replayed to the server (see web/src/lib/offlineQueue.js).
 * Exams and the tutor still need a connection, and fail through the app's
 * normal error UI when there isn't one.
 *
 * Bump VERSION on any change here. Old caches are dropped on activate, so a
 * deploy cannot leave a phone pinned to last month's bundle.
 */

const VERSION = 'sdai-v2';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const FONT_CACHE = `${VERSION}-fonts`;
/// Question diagrams. Separate from the asset cache so it can be reasoned about
/// — and dropped — on its own; it is the only cache holding content the server
/// serves under /api.
const MEDIA_CACHE = `${VERSION}-media`;
const OWNED = [SHELL_CACHE, ASSET_CACHE, FONT_CACHE, MEDIA_CACHE];

// The app is a HashRouter, so every route in it is served by this one document.
const SHELL = '/';

const PRECACHE = [
  SHELL,
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png',
];

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // Individually, not addAll: one 404 in the list would otherwise abort the
      // whole install and leave the app with no worker at all.
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !OWNED.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/// Cache a response only if it is one we can trust: a real 200 from our own
/// origin, or a CORS-clean font. Opaque and error responses would poison the
/// cache until the next version bump.
function cacheable(res) {
  return res && res.ok && res.type !== 'opaque';
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  // ignoreVary because everything routed here is addressed by a URL that fully
  // determines its content — Vite's hashed asset names, and icons retired by
  // the version bump. Without it a stray `Vary` header from whatever is in
  // front of the app (Vite's preview server sends `Vary: Origin`) turns every
  // lookup into a miss, and the offline shell quietly stops working.
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (cacheable(res)) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, { ignoreVary: true });
  const fresh = fetch(request)
    .then((res) => {
      if (cacheable(res)) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return hit || fresh.then((res) => res || Response.error());
}

/// Navigation: always try the network first, so a deploy is picked up on the
/// next launch rather than whenever the cache happens to expire. Fall back to
/// the cached shell only when the network genuinely fails.
async function navigateFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(request);
    if (cacheable(res)) cache.put(SHELL, res.clone());
    return res;
  } catch {
    const hit = await cache.match(SHELL, { ignoreVary: true });
    if (hit) return hit;
    throw new Error('offline and no cached shell');
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Anything that changes state on the server is none of this worker's
  // business, and neither is a range request for media.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  const sameOrigin = url.origin === self.location.origin;

  // Question diagrams are the one thing under /api that is safe to keep, and
  // the exemption is narrow on purpose. They are static files served by express
  // with `immutable`, named by the sha256 of their own contents, behind no auth
  // and carrying no session semantics — a cached one cannot be stale and cannot
  // leak. Without this, offline practice shows a broken image for every
  // diagram question, which is most of a real traffic-rules bank.
  if (sameOrigin && url.pathname.startsWith('/api/uploads/')) {
    event.respondWith(cacheFirst(request, MEDIA_CACHE));
    return;
  }

  // The line that must not move.
  if (sameOrigin && url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigateFirst(request));
    return;
  }

  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }

  // Everything else cross-origin goes straight to the network.
  if (url.origin !== self.location.origin) return;

  // Vite writes content-hashed filenames here, so a hit is always correct and
  // a changed file is always a different URL.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // Icons and the manifest: same idea, but the filenames are stable, so the
  // version bump above is what retires them.
  if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
  }
});
