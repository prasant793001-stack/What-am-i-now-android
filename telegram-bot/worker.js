// What Am I Now? Telegram alerts: a Cloudflare Worker (free plan, no server or phone needed).
// Every minute it reads the live roster from Firebase and sends each person who joined
// their own role on Telegram a few minutes before every role change.
// It also answers people who message the bot: /start Name, /now, /stop, /help.
import { setData, staff, sod, dkey } from '../roster-engine.js';
import { dueMessages, nowText, leadMinutes } from './messages.js';
import { firebaseConfig } from '../firebase-config.js';

const MIN = 60000;
const FS = 'https://firestore.googleapis.com/v1';
const TG = 'https://api.telegram.org';

/* ---------- time: Workers run on UTC, the roster is in Dubai time ---------- */
// Shifting the clock makes the roster engine's "local" time equal Dubai time (UTC+4, no daylight saving).
const shift = env => (Number.isFinite(+env.TZ_OFFSET_MINUTES) ? +env.TZ_OFFSET_MINUTES : 240) * MIN;
const localTime = (env, ms = Date.now()) => new Date(ms + shift(env));

/* ---------- Firebase sign-in (anonymous, same as the website) ---------- */
async function idToken(env) {
  const key = firebaseConfig.apiKey;
  const saved = await env.KV.get('auth', 'json');
  if (saved && saved.exp > Date.now() + 2 * MIN) return saved.idToken;
  let tok;
  if (saved && saved.refreshToken) {
    const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(saved.refreshToken),
    });
    if (r.ok) { const j = await r.json(); tok = { idToken: j.id_token, refreshToken: j.refresh_token, expiresIn: j.expires_in }; }
  }
  if (!tok) {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }),
    });
    if (!r.ok) throw new Error('Firebase sign-in failed (' + r.status + '). Is Anonymous sign-in turned on?');
    const j = await r.json();
    tok = { idToken: j.idToken, refreshToken: j.refreshToken, expiresIn: j.expiresIn };
  }
  await env.KV.put('auth', JSON.stringify({ idToken: tok.idToken, refreshToken: tok.refreshToken, exp: Date.now() + (+tok.expiresIn || 3600) * 1000 }));
  return tok.idToken;
}

/* ---------- Firestore REST ---------- */
function decode(v) {
  if (!v || 'nullValue' in v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields);
  return null;
}
function decodeFields(f) { const o = {}; for (const [k, v] of Object.entries(f || {})) o[k] = decode(v); return o; }
const docsUrl = () => `${FS}/projects/${firebaseConfig.projectId}/databases/(default)/documents/`;

async function fsGet(token, path) {
  const r = await fetch(docsUrl() + path, { headers: { Authorization: 'Bearer ' + token } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Firestore ${path}: ${r.status}`);
  return decodeFields((await r.json()).fields);
}
async function fsList(token, coll) {
  const out = {};
  let page = '';
  do {
    const r = await fetch(docsUrl() + coll + '?pageSize=300' + (page ? '&pageToken=' + page : ''), { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error(`Firestore ${coll}: ${r.status}`);
    const j = await r.json();
    for (const d of j.documents || []) out[d.name.split('/').pop()] = decodeFields(d.fields);
    page = j.nextPageToken || '';
  } while (page);
  return out;
}

/** Load the roster for one day into the engine. Spin-wheel results change rarely, so they're cached for 30 minutes. */
async function loadRoster(env, local) {
  const token = await idToken(env);
  const key = dkey(sod(local));
  const [cfg, absent] = await Promise.all([fsGet(token, 'config/main'), fsGet(token, 'absences/' + key)]);
  let wheels = await env.KV.get('wheels', 'json');
  if (!wheels || Date.now() - wheels.at > 30 * MIN) {
    wheels = { at: Date.now(), data: await fsList(token, 'wheel') };
    await env.KV.put('wheels', JSON.stringify(wheels));
  }
  setData(cfg, absent ? { [key]: absent } : {}, wheels.data);
  return cfg;
}

/* ---------- Telegram ---------- */
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const html = s => esc(s).replace(/\*([^*\n]+)\*/g, '<b>$1</b>'); // the messages use *bold*

async function tg(env, method, body) {
  const r = await fetch(`${TG}/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { ok: r.ok, status: r.status, json: await r.json().catch(() => null) };
}
const say = (env, chat, text, extra = {}) =>
  tg(env, 'sendMessage', { chat_id: chat, text: html(text), parse_mode: 'HTML', disable_web_page_preview: true, ...extra });

/** Secret Telegram adds to every webhook call, so only Telegram can talk to /telegram. Derived from the bot token. */
async function hookSecret(env) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('roster:' + env.BOT_TOKEN));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 48);
}

const getSubs = async env => (await env.KV.get('subs', 'json')) || {};
const putSubs = (env, s) => env.KV.put('subs', JSON.stringify(s));
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/* ---------- every minute: send what's due ---------- */
export async function tick(env, scheduledMs = Date.now()) {
  const subs = await getSubs(env), names = Object.keys(subs);
  if (!names.length) return { sent: 0 };
  // Exactly one minute window, so each message goes out once with no bookkeeping.
  const local = localTime(env, Math.floor(scheduledMs / MIN) * MIN);
  if (!(await loadRoster(env, local))) return { sent: 0 };
  const lead = leadMinutes(env.LEAD_MINUTES);
  const due = dueMessages(local, names, new Set(), { lead, graceMin: 1 - lead });
  let sent = 0, changed = false;
  await Promise.all(due.map(async m => {
    const r = await say(env, subs[m.name], m.text);
    if (r.ok) sent++;
    else if (r.status === 403) { delete subs[m.name]; changed = true; } // they blocked the bot
    else console.log('send failed', m.name, r.status, JSON.stringify(r.json));
  }));
  if (changed) await putSubs(env, subs);
  return { sent, due: due.length };
}

/* ---------- people messaging the bot ---------- */
const HELP = [
  '🤖 *What Am I Now? alerts*',
  '/start Name : get a message before every role change',
  '/now : your role right now and your next one',
  '/stop : turn the messages off',
].join('\n');

export async function handleUpdate(env, update) {
  const msg = update.message;
  if (!msg || !msg.chat || msg.chat.type !== 'private' || typeof msg.text !== 'string') return;
  const chat = msg.chat.id, text = msg.text.trim();
  const m = text.match(/^\/?(start|now|stop|help)(?:@\w+)?\b\s*(.*)$/i);
  if (!m) return say(env, chat, HELP);
  const word = m[1].toLowerCase(), arg = m[2].trim();
  const local = localTime(env), lead = leadMinutes(env.LEAD_MINUTES);
  await loadRoster(env, local);
  const team = staff(), subs = await getSubs(env);
  const mine = Object.keys(subs).find(n => subs[n] === chat);

  if (word === 'start') {
    const name = arg && team.find(n => norm(n) === norm(arg));
    if (!name) {
      const rows = [];
      for (let i = 0; i < team.length; i += 3) rows.push(team.slice(i, i + 3).map(n => ({ text: '/start ' + n })));
      return say(env, chat, arg ? `I couldn't find "${arg}" on the roster. Tap your name:` : 'Hi! Tap your name to get role alerts:', {
        reply_markup: { keyboard: rows, one_time_keyboard: true, resize_keyboard: true },
      });
    }
    for (const n of Object.keys(subs)) if (subs[n] === chat) delete subs[n];
    const old = subs[name];
    subs[name] = chat;
    await putSubs(env, subs);
    if (old && old !== chat) await say(env, old, `ℹ️ Role alerts for *${name}* now go to another Telegram account.`);
    return say(env, chat, `✅ Done, *${name}*. You'll get a message ${lead} min before every role change.\nSend /now any time, or /stop to turn it off.\n\n${nowText(name, local)}`, {
      reply_markup: { remove_keyboard: true },
    });
  }
  if (word === 'stop') {
    if (!mine) return say(env, chat, 'You are not getting role alerts.');
    for (const n of Object.keys(subs)) if (subs[n] === chat) delete subs[n];
    await putSubs(env, subs);
    return say(env, chat, `🔕 Role alerts are off, ${mine}. Send /start ${mine} to turn them back on.`);
  }
  if (word === 'now') {
    if (!mine) return say(env, chat, 'Send /start and your name first, e.g. /start Prashant');
    return say(env, chat, nowText(mine, local));
  }
  return say(env, chat, HELP);
}

/* ---------- Cloudflare entry points ---------- */
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(tick(env, event.scheduledTime).then(r => r.sent && console.log('sent', r.sent)).catch(e => console.log('tick failed:', e.message)));
  },

  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === 'POST' && url.pathname === '/telegram') {
      if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== (await hookSecret(env))) return new Response('forbidden', { status: 403 });
      const update = await req.json().catch(() => null);
      if (update) ctx.waitUntil(handleUpdate(env, update).catch(e => console.log('reply failed:', e.message)));
      return new Response('ok');
    }
    if (url.pathname === '/setup') {
      // Connects the Telegram bot to this worker. Safe to open any time.
      const hook = await tg(env, 'setWebhook', { url: url.origin + '/telegram', secret_token: await hookSecret(env), allowed_updates: ['message'], drop_pending_updates: true });
      await tg(env, 'setMyCommands', { commands: [
        { command: 'start', description: 'Get alerts before every role change' },
        { command: 'now', description: 'My role right now' },
        { command: 'stop', description: 'Turn alerts off' },
      ] });
      const me = await tg(env, 'getMe', {});
      return Response.json({ webhook: hook.json, bot: me.json && me.json.result && me.json.result.username });
    }
    const subs = await getSubs(env);
    return new Response(`What Am I Now? Telegram alerts are running. ${Object.keys(subs).length} people joined.`);
  },
};
