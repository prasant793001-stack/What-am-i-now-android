// What Am I Now? · notification server
// ------------------------------------
// Runs free on Cloudflare Workers. Every minute (Cron Trigger "* * * * *") it reads the notification plan that the
// roster website keeps in Firestore and sends each phone a Web Push a few minutes before its next role. That is what
// makes notifications arrive when the website is closed: Android (Chrome) and iPhone (site added to the Home Screen,
// iOS 16.4 or newer).
//
// Settings: Cloudflare → Workers → this Worker → Settings → Variables and Secrets
//   VAPID_PUBLIC_KEY          Text    the public key shown on this Worker's page the first time you open it
//   VAPID_PRIVATE_KEY         Secret  the private key shown next to it
//   VAPID_SUBJECT             Text    mailto: plus an email you own, e.g. mailto:prasant@example.com
//   FIREBASE_SERVICE_ACCOUNT  Secret  the whole JSON file from Firebase → Project settings → Service accounts →
//                                     Generate new private key
// Then: Settings → Triggers → Cron Triggers → add "* * * * *" (every minute).
//
// Paste this whole file into the Worker's code editor and Deploy. No other files or packages are needed.
// Opening the Worker's address in a browser shows a status page that checks every setting.

const enc = new TextEncoder();
const MAX_PUSHES_PER_RUN = 40; // the free plan allows 50 outgoing requests per run; a few are for Firestore

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env, event.scheduledTime).catch(e => console.error('Notification run failed:', (e && e.stack) || e)));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/') return new Response('Not found', { status: 404 });
    return statusPage(env);
  }
};

/* ---------- the every-minute job ---------- */
async function run(env, when) {
  const now = Math.floor((when || Date.now()) / 60000) * 60000;
  const cfg = settings(env);
  const tok = await googleToken(cfg.sa);
  const day = new Date(now).toISOString().slice(0, 10);
  const [plan, devDoc] = await Promise.all([
    fsGet(cfg, tok, 'config/push-day-' + day),
    fsGet(cfg, tok, 'config/push-devices')
  ]);
  const devices = (devDoc && devDoc.devices) || {};
  const jobs = dueJobs(planItems(plan), devices, now);
  const res = await sendAll(cfg, jobs.slice(0, MAX_PUSHES_PER_RUN));
  if (jobs.length > MAX_PUSHES_PER_RUN) res.err = (jobs.length - MAX_PUSHES_PER_RUN) + ' notifications skipped (too many at once)';

  // Remove phones whose push address no longer works, and mark tests as answered.
  const mask = [], fields = { devices: {} };
  for (const id of res.gone) mask.push('devices.' + id);
  for (const j of jobs) {
    if (j.test && !res.gone.has(j.id)) { mask.push('devices.' + j.id + '.testDone'); fields.devices[j.id] = { testDone: +j.d.test }; }
  }
  if (mask.length) await fsPatch(cfg, tok, 'config/push-devices', fields, mask);

  const d = new Date(now);
  if (d.getUTCMinutes() % 10 === 0 || jobs.length) await publishStatus(cfg, tok, now, jobs.length ? res : null);
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 7) {
    const old = new Date(now - 3 * 86400000).toISOString().slice(0, 10);
    await fsDelete(cfg, tok, 'config/push-day-' + old).catch(() => {});
  }
  if (jobs.length) console.log(`Sent ${res.sent}, failed ${res.failed}, removed ${res.gone.size}${res.err ? ' · ' + res.err : ''}`);
}

function planItems(plan) {
  try { const a = JSON.parse((plan && plan.items) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}

// Plan item: [notifyAtMs, name, title, body, tag, roleStartMs]
function dueJobs(items, devices, now) {
  const jobs = [];
  for (const [at, name, title, body, tag, start] of items) {
    if (!(at >= now && at < now + 60000)) continue;
    const ttl = Math.max(60, Math.round(((start || at + 180000) - now) / 1000) + 120);
    for (const [id, d] of Object.entries(devices)) {
      if (d && d.endpoint && d.name === name) jobs.push({ id, d, ttl, msg: { title, body, tag, ts: start || at } });
    }
  }
  for (const [id, d] of Object.entries(devices)) {
    if (d && d.endpoint && +d.test > (+d.testDone || 0) && now - d.test < 15 * 60000) {
      jobs.push({ id, d, test: true, ttl: 300, msg: { title: 'Test notification ✓', body: `Notifications work on this phone, ${d.name}. You'll get one before each role change.`, tag: 'test' } });
    }
  }
  return jobs;
}

async function sendAll(cfg, jobs) {
  const out = { sent: 0, failed: 0, gone: new Set(), err: '' };
  await Promise.all(jobs.map(async j => {
    try {
      const r = await sendPush(cfg, j.d, j.msg, j.ttl);
      if (r.status === 404 || r.status === 410) out.gone.add(j.id);
      else if (r.ok) out.sent++;
      else { out.failed++; out.err = `${j.d.name}: ${r.status} ${(await r.text().catch(() => '')).slice(0, 160)}`; }
    } catch (e) { out.failed++; out.err = `${j.d.name}: ${String((e && e.message) || e).slice(0, 160)}`; }
  }));
  return out;
}

async function publishStatus(cfg, tok, now, res) {
  const fields = { vapidPublicKey: cfg.vapidPublic, seen: now }, mask = ['vapidPublicKey', 'seen'];
  if (res) { fields.last = { at: now, sent: res.sent, failed: res.failed, removed: res.gone.size, err: res.err || '' }; mask.push('last'); }
  await fsPatch(cfg, tok, 'config/push', fields, mask);
}

/* ---------- settings ---------- */
function settings(env) {
  const missing = [];
  const vapidPublic = String(env.VAPID_PUBLIC_KEY || '').trim(), vapidPrivate = String(env.VAPID_PRIVATE_KEY || '').trim();
  if (!vapidPublic) missing.push('VAPID_PUBLIC_KEY');
  if (!vapidPrivate) missing.push('VAPID_PRIVATE_KEY');
  if (!env.FIREBASE_SERVICE_ACCOUNT) missing.push('FIREBASE_SERVICE_ACCOUNT');
  if (missing.length) throw new Error('Missing settings: ' + missing.join(', '));
  let sa = env.FIREBASE_SERVICE_ACCOUNT;
  if (typeof sa === 'string') {
    try { sa = JSON.parse(sa); } catch (e) { throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON. Paste the whole downloaded file, from the first { to the last }.'); }
  }
  if (!sa || !sa.client_email || !sa.private_key) throw new Error('FIREBASE_SERVICE_ACCOUNT is missing client_email or private_key. Use the file from "Generate new private key".');
  let subject = String(env.VAPID_SUBJECT || 'mailto:roster@example.com').trim();
  if (!/^(mailto:|https:)/i.test(subject)) subject = (subject.includes('@') ? 'mailto:' : 'https://') + subject;
  return { vapidPublic, vapidPrivate, subject, sa, project: String(env.FIREBASE_PROJECT_ID || sa.project_id || '').trim() };
}

/* ---------- Web Push (RFC 8291 encryption + RFC 8292 VAPID), using only built-in Web Crypto ---------- */
function b64u(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64(s) {
  s = String(s).trim().replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  while (s.length % 4) s += '=';
  const bin = atob(s), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

// Encrypts the message for one phone (Content-Encoding: aes128gcm).
async function encryptPayload(text, p256dh, auth) {
  const uaPublic = unb64(p256dh), authSecret = unb64(auth);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  const prkKey = await hmac(authSecret, shared);
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(enc.encode(text), new Uint8Array([2]))));
  const header = new Uint8Array(21 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, sealed);
}

let vapidCache = null;
const jwtCache = new Map();
async function vapidSigningKey(pub, priv) {
  if (vapidCache && vapidCache.pub === pub && vapidCache.priv === priv) return vapidCache.key;
  const p = unb64(pub);
  if (p.length !== 65 || p[0] !== 4) throw new Error('VAPID_PUBLIC_KEY looks wrong (it should be 87 characters and start with B).');
  let key;
  try {
    key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: b64u(p.slice(1, 33)), y: b64u(p.slice(33, 65)), d: priv, ext: true },
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  } catch (e) { throw new Error('the public and private keys are not a pair'); }
  vapidCache = { pub, priv, key };
  return key;
}
async function vapidAuth(cfg, endpoint) {
  const aud = new URL(endpoint).origin, now = Math.floor(Date.now() / 1000);
  const hit = jwtCache.get(aud);
  if (hit && hit.pub === cfg.vapidPublic && hit.exp - now > 3600) return hit.value;
  const exp = now + 12 * 3600;
  const unsigned = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))) + '.' + b64u(enc.encode(JSON.stringify({ aud, exp, sub: cfg.subject })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await vapidSigningKey(cfg.vapidPublic, cfg.vapidPrivate), enc.encode(unsigned));
  const value = `vapid t=${unsigned}.${b64u(sig)}, k=${cfg.vapidPublic}`;
  jwtCache.set(aud, { value, exp, pub: cfg.vapidPublic });
  return value;
}
async function sendPush(cfg, device, msg, ttl) {
  const body = await encryptPayload(JSON.stringify(msg), device.p256dh, device.auth);
  return fetch(device.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(cfg, device.endpoint),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: 'high'
    },
    body
  });
}
async function newVapidKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return { pub: b64u(concat(new Uint8Array([4]), unb64(jwk.x), unb64(jwk.y))), priv: jwk.d };
}
async function checkVapidPair(pub, priv) {
  const key = await vapidSigningKey(pub, priv), data = enc.encode('check');
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, data);
  const pk = await crypto.subtle.importKey('raw', unb64(pub), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pk, sig, data))) throw new Error('the public and private keys are not a pair');
}

/* ---------- Google sign-in with the Firebase service account ---------- */
let tokenCache = null;
async function googleToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.email === sa.client_email && tokenCache.exp - now > 300) return tokenCache.token;
  const der = unb64(String(sa.private_key).replace(/-----[^-]+-----/g, ''));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const unsigned = b64u(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))) + '.' + b64u(enc.encode(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  })));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(unsigned));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + unsigned + '.' + b64u(sig)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('Google sign-in with the service account failed: ' + (j.error_description || j.error || r.status));
  tokenCache = { token: j.access_token, exp: now + (+j.expires_in || 3600), email: sa.client_email };
  return j.access_token;
}

/* ---------- Firestore REST ---------- */
const fsUrl = (cfg, path) => `https://firestore.googleapis.com/v1/projects/${cfg.project}/databases/(default)/documents/${path}`;
async function fsGet(cfg, tok, path) {
  const r = await fetch(fsUrl(cfg, path), { headers: { Authorization: 'Bearer ' + tok } });
  if (r.status === 404) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Reading ${path} failed: ${r.status} ${(j.error && j.error.message) || ''}`);
  return fromFields(j.fields || {});
}
async function fsPatch(cfg, tok, path, obj, mask) {
  const q = mask.map(m => 'updateMask.fieldPaths=' + encodeURIComponent(m)).join('&');
  const r = await fetch(fsUrl(cfg, path) + '?' + q, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFields(obj) })
  });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(`Saving ${path} failed: ${r.status} ${(j.error && j.error.message) || ''}`); }
}
async function fsDelete(cfg, tok, path) {
  await fetch(fsUrl(cfg, path), { method: 'DELETE', headers: { Authorization: 'Bearer ' + tok } });
}
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: toFields(v) } };
}
function toFields(o) { const f = {}; for (const [k, v] of Object.entries(o)) f[k] = toValue(v); return f; }
function fromValue(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  return null;
}
function fromFields(f) { const o = {}; for (const [k, v] of Object.entries(f)) o[k] = fromValue(v); return o; }

/* ---------- status / setup page ---------- */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function statusPage(env) {
  const checks = [];
  let keysBlock = '', info = '';
  const pub = String(env.VAPID_PUBLIC_KEY || '').trim(), priv = String(env.VAPID_PRIVATE_KEY || '').trim();
  if (!pub || !priv) {
    const k = await newVapidKeys();
    checks.push([false, 'Push keys', 'Not set yet. Add the two keys below as variables.']);
    keysBlock = `<section><h2>Your push keys</h2>
      <p>Add these in Cloudflare → this Worker → <b>Settings → Variables and Secrets</b>. A new pair is made each time this page loads while the keys are missing, so copy both from the same visit.</p>
      <label>VAPID_PUBLIC_KEY <small>(type: Text)</small></label><pre>${esc(k.pub)}</pre>
      <label>VAPID_PRIVATE_KEY <small>(type: Secret, never share it)</small></label><pre>${esc(k.priv)}</pre></section>`;
  } else {
    try { await checkVapidPair(pub, priv); checks.push([true, 'Push keys', 'Set and valid.']); }
    catch (e) { checks.push([false, 'Push keys', 'Not valid: ' + e.message + '. Delete both and reload this page for a new pair.']); }
  }
  let cfg = null, tok = null;
  if (!env.FIREBASE_SERVICE_ACCOUNT) checks.push([false, 'Firebase access', 'FIREBASE_SERVICE_ACCOUNT is not set. In Firebase: Project settings → Service accounts → Generate new private key, then paste the whole file as a Secret.']);
  else {
    try {
      cfg = settings({ ...env, VAPID_PUBLIC_KEY: pub || 'x', VAPID_PRIVATE_KEY: priv || 'x' });
      tok = await googleToken(cfg.sa);
      checks.push([true, 'Firebase access', 'Connected to project ' + cfg.project + '.']);
    } catch (e) { checks.push([false, 'Firebase access', e.message]); tok = null; }
  }
  if (cfg && tok) {
    try {
      const now = Date.now(), d0 = new Date(now).toISOString().slice(0, 10), d1 = new Date(now + 86400000).toISOString().slice(0, 10);
      const [devDoc, meta, status, p0, p1] = await Promise.all(['config/push-devices', 'config/push-meta', 'config/push', 'config/push-day-' + d0, 'config/push-day-' + d1].map(p => fsGet(cfg, tok, p)));
      const devs = Object.values((devDoc && devDoc.devices) || {}).filter(d => d && d.endpoint);
      const tz = (meta && meta.tz) || 'UTC';
      const when = ms => new Date(ms).toLocaleString('en-GB', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
      checks.push([devs.length > 0, 'Phones signed up', devs.length ? devs.length + ': ' + devs.map(d => `${d.name} (${d.plat || 'web'})`).join(', ') : 'None yet. Open the roster website on a phone and tap Turn on notifications.']);
      checks.push([!!meta, 'Roster plan', meta ? 'Kept up to date by the website (last change ' + when(meta.at) + ').' : 'Not written yet. It appears once a phone has turned on notifications and someone has the website open.']);
      const seen = status && +status.seen;
      const cronOk = seen && now - seen < 15 * 60000;
      checks.push([!!cronOk, 'Every-minute run', cronOk ? 'Last ran ' + when(seen) + '.' : 'Has not run yet. Add the Cron Trigger "* * * * *" under Settings → Triggers, then wait 10 minutes.']);
      if (status && status.last) checks.push([!status.last.failed, 'Last notifications', `${when(status.last.at)}: ${status.last.sent} sent, ${status.last.failed} failed, ${status.last.removed} old phones removed${status.last.err ? ' · ' + status.last.err : ''}`]);
      const next = [...planItems(p0), ...planItems(p1)].filter(it => it[0] >= now).sort((a, b) => a[0] - b[0]).slice(0, 8);
      if (next.length) info = `<section><h2>Next notifications</h2><ul>${next.map(it => `<li><b>${esc(when(it[0]))}</b> · ${esc(it[1])}: ${esc(it[2])}</li>`).join('')}</ul></section>`;
      // Publish the public key straight away so the website's "Turn on notifications" button appears.
      if (pub && priv && checks[0][0]) await fsPatch(cfg, tok, 'config/push', { vapidPublicKey: pub }, ['vapidPublicKey']).catch(() => {});
    } catch (e) { checks.push([false, 'Reading the roster', e.message]); }
  }
  const allOk = checks.every(c => c[0]);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Notification server</title><style>
:root{--bg:#EEF2F1;--card:#fff;--ink:#14201D;--muted:#5B6A66;--ok:#0E6B5C;--bad:#B3402F;--line:#D9E1DF}
@media (prefers-color-scheme:dark){:root{--bg:#0D1412;--card:#15201D;--ink:#E6EEEB;--muted:#93A39F;--ok:#38BFA4;--bad:#F08A78;--line:#26332F}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:720px;margin:0 auto;padding:20px 16px 48px;display:grid;gap:14px}
h1{font-size:24px;margin:0}h2{font-size:15px;margin:0 0 6px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
section{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.c{display:grid;grid-template-columns:24px 1fr;gap:4px 10px;padding:8px 0;border-top:1px solid var(--line)}.c:first-child{border-top:0}
.c i{font-style:normal;font-weight:800}.y{color:var(--ok)}.n{color:var(--bad)}.c span{grid-column:2;color:var(--muted)}
pre{white-space:pre-wrap;word-break:break-all;background:var(--bg);border-radius:10px;padding:10px;font-size:13px;margin:4px 0 12px;user-select:all}
label{font-weight:700}small{color:var(--muted);font-weight:400}ul{margin:0;padding-left:18px}p{margin:0 0 8px}
</style></head><body><main><h1>What Am I Now? · notification server</h1>
<p>${allOk ? 'Everything is set up. Phones get a notification before each role change.' : 'Finish the items marked ✕, then reload this page.'}</p>
<section>${checks.map(([ok, name, text]) => `<div class="c"><i class="${ok ? 'y' : 'n'}">${ok ? '✓' : '✕'}</i><b>${esc(name)}</b><span>${esc(text)}</span></div>`).join('')}</section>
${keysBlock}${info}</main></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
