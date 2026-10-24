// Background helper for the website.
// - Shows the role-change notifications sent by the notification server (push-server/worker.js), even when the
//   site is closed: Android Chrome, and iPhone when the site was added to the Home Screen (iOS 16.4+).
// - Opens the roster when a notification is tapped.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'What Am I Now?';
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
