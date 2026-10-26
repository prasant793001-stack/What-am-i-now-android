// Background helper for the website.
// - Opens fast: the app's own files, the Firebase library and the fonts are kept on the phone. The page shows the
//   copy on the phone straight away and fetches a fresh one in the background (the site's update check then
//   reloads once when a new version is out). version.json always comes from the network.
// - Shows the role-change notifications sent by the notification server (push-server/worker.js), even when the
//   site is closed: Android Chrome, and iPhone when the site was added to the Home Screen (iOS 16.4+).
// - Opens the roster when a notification is tapped.
const CACHE = 'alainbc-v1';
const SHELL = ['index.html', 'manifest.webmanifest', 'icon-192.png', 'badge-96.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
});
self.addEventListener('activate', e => e.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => k.startsWith('alainbc-') && k !== CACHE).map(k => caches.delete(k)));
  await self.clients.claim();
})()));

const scopePath = () => new URL(self.registration.scope).pathname;
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (!url.pathname.startsWith(scopePath())) return;
    const path = url.pathname.slice(scopePath().length);
    if (path === 'version.json' || path === 'sw.js') return;                       // always fresh
    if (req.mode === 'navigate' || path === '' || path === 'index.html')           // the app page (any ?me=…)
      return e.respondWith(fresh(e, req, new URL('index.html', self.registration.scope).href));
    if (path === 'firebase-config.js')                                              // network first, phone copy offline
      return e.respondWith(networkFirst(req, new URL('firebase-config.js', self.registration.scope).href));
    if (/\.(js|png|jpe?g|webp|svg|webmanifest|css)$/i.test(path)) return e.respondWith(fresh(e, req, req));
    return;
  }
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) return e.respondWith(cacheFirst(req)); // versioned library
  if (url.hostname === 'fonts.gstatic.com') return e.respondWith(cacheFirst(req));
  if (url.hostname === 'fonts.googleapis.com') return e.respondWith(fresh(e, req, req));
});
async function cacheFirst(req) {
  const c = await caches.open(CACHE), hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) c.put(req, res.clone()).catch(() => {});
  return res;
}
// The phone's copy at once (fast start), refreshed from the network in the background.
function fresh(e, req, key) {
  return (async () => {
    const c = await caches.open(CACHE), hit = await c.match(key);
    const net = fetch(req).then(res => { if (res.ok && res.type !== 'opaqueredirect') c.put(key, res.clone()).catch(() => {}); return res; });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net;
  })();
}
async function networkFirst(req, key) {
  const c = await caches.open(CACHE);
  try { const res = await fetch(req); if (res.ok) c.put(key, res.clone()).catch(() => {}); return res; }
  catch (err) { const hit = await c.match(key); if (hit) return hit; throw err; }
}

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'Al Ain BC';
  const opts = {
    body: d.body || 'Your role is about to change.',
    tag: d.tag || 'role-change',
    renotify: true,
    requireInteraction: !!d.sticky,
    icon: 'icon-192.png',
    badge: 'badge-96.png',
    vibrate: [300, 120, 300, 120, 500],
    timestamp: d.ts || Date.now(),
    data: { url: d.url || './' }
  };
  // Every push must show a notification (iPhone stops delivering pushes to sites that skip this).
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) return c.focus(); }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
