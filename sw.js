/* Service worker for the Kandil Packaging Required Data app.
 *
 * You normally NEVER need to edit this file. To release a new version of the
 * program, just replace index.html on your host. Installed apps (PC + mobile)
 * pick the new index.html up automatically:
 *   - every time the app is opened (network-first, falls back to cache offline)
 *   - while the app stays open (re-checked when you return to it, when the
 *     connection comes back, and every 15 minutes)
 * Only bump CACHE_VERSION if you change the icons/manifest or this file.
 */
const CACHE_VERSION = 'v1';
const CACHE = 'kandil-pr-' + CACHE_VERSION;
const SCOPE = self.registration.scope;                 // e.g. https://host/folder/
const ROOT = SCOPE;                                    // the page itself (index.html)
const HASH_KEY = new URL('__page-hash', SCOPE).href;   // fingerprint of the cached page
const NAV_TIMEOUT = 3500;                              // ms to wait for network before using cache

const STATIC = [
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
].map(p => new URL(p, SCOPE).href);

// Third-party libraries the page loads (kept so PDF features still work offline)
const CDN = [
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
];
const CDN_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com'];

async function sha256(buf) {
  const d = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Fetch the newest page straight from the server (bypassing the HTTP cache),
// store it, and report whether it differs from what was stored before.
async function fetchRoot() {
  const res = await fetch(ROOT, { cache: 'no-cache', credentials: 'same-origin' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = await res.arrayBuffer();
  const hash = await sha256(buf);
  const cache = await caches.open(CACHE);
  const prevRes = await cache.match(HASH_KEY);
  const prev = prevRes ? await prevRes.text() : null;
  const mk = () => new Response(buf, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  await cache.put(ROOT, mk());
  await cache.put(HASH_KEY, new Response(hash));
  return { response: mk(), changed: !!prev && prev !== hash };
}

async function broadcast(msg) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach(c => c.postMessage(msg));
}

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(STATIC.map(u => cache.add(u).catch(() => {})));
    await Promise.all(CDN.map(async u => {
      try { await cache.put(u, await fetch(new Request(u, { mode: 'no-cors' }))); } catch (e) {}
    }));
    try { await fetchRoot(); } catch (e) {}
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('kandil-pr-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  const t = event.data && event.data.type;
  if (t === 'SKIP_WAITING') self.skipWaiting();
  if (t === 'CHECK') {
    event.waitUntil(fetchRoot().then(r => { if (r.changed) return broadcast({ type: 'UPDATED' }); }).catch(() => {}));
  }
});

async function handleNavigation(event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(ROOT);
  const net = fetchRoot();

  if (!cached) {
    try { return (await net).response; }
    catch (e) {
      return new Response('<meta charset="utf-8"><title>Offline</title><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>You are offline</h2><p>Open the app once while online so it can be saved for offline use.</p>',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
  }

  const timeout = new Promise(resolve => setTimeout(resolve, NAV_TIMEOUT, null));
  try {
    const r = await Promise.race([net, timeout]);
    if (r) return r.response;                 // fresh copy from the server
  } catch (e) {
    return cached;                            // network failed -> offline copy
  }
  // Network is slow: show the saved copy now, tell the page when the new one arrives.
  event.waitUntil(net.then(r => { if (r.changed) return broadcast({ type: 'UPDATED' }); }).catch(() => {}));
  return cached;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const refresh = fetch(request).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await refresh) || Response.error();
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    const rootPath = new URL(SCOPE).pathname;
    if (url.pathname === rootPath || url.pathname === rootPath + 'index.html') {
      event.respondWith(handleNavigation(event));
    }
    return;
  }
  if (url.origin === self.location.origin && STATIC.includes(url.href)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req));
  }
});
