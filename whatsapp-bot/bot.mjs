// What Am I Now? WhatsApp bot
// Sends each colleague their own role a few minutes before every role change.
//   node bot.mjs              run the bot
//   node bot.mjs --preview    show today's messages for everyone who joined (no WhatsApp needed)
//   node bot.mjs --demo       show sample messages with a made-up team (no Firebase or WhatsApp needed)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, 'data');
fs.mkdirSync(DATA, { recursive: true });

/* ---------- settings ---------- */
const CONFIG_FILE = path.join(HERE, 'config.json');
const CONF = Object.assign(
  { timezone: 'Asia/Dubai', botNumber: '', leadMinutes: null, minDelaySeconds: 2, maxDelaySeconds: 5 },
  readJson(CONFIG_FILE, {}),
  readJson(path.join(DATA, "config.json"), {}) // this machine's own settings (not on GitHub)
);
process.env.TZ = CONF.timezone; // the roster is worked out in this time zone, wherever the bot runs

const E = await import('../roster-engine.js');
const { dueMessages, nowText, previewDay, leadMinutes } = await import('./messages.mjs');

/* ---------- small helpers ---------- */
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const stamp = () => new Date().toLocaleString('en-GB', { hour12: false });
const log = (...a) => console.log(`[${stamp()}]`, ...a);
const digits = s => String(s || '').replace(/\D/g, '');

/* ---------- demo mode: no Firebase, no WhatsApp ---------- */
const args = process.argv.slice(2);
if (args[0] === '--demo') {
  E.setData({ staff: ['Ahmed', 'Shahid', 'Ziko', 'Rayan', 'Hamada', 'Prashant', 'Mohammed', 'Ahoud', 'Mustafa'] }, {}, {});
  const who = args[1] || 'Prashant', lead = leadMinutes(CONF.leadMinutes);
  console.log(`Demo: today's WhatsApp messages for ${who} (${CONF.timezone}, ${lead} min before)\n`);
  for (const m of previewDay(who, new Date(), lead)) console.log(`--- sent at ${E.fmtT(m.at.getHours() * 60 + m.at.getMinutes())}\n${m.text}\n`);
  process.exit(0);
}

/* ---------- Firebase: live roster data ---------- */
const { initializeApp } = await import('firebase/app');
const { getFirestore, doc, collection, onSnapshot } = await import('firebase/firestore');
const { getAuth, signInAnonymously, onAuthStateChanged } = await import('firebase/auth');
const { firebaseConfig } = await import('../firebase-config.js');

if (!firebaseConfig || !firebaseConfig.apiKey || /PASTE/i.test(firebaseConfig.apiKey)) {
  console.error('Put your Firebase settings in firebase-config.js (next to index.html) first.');
  process.exit(1);
}
let cfg = null, absences = {}, wheels = {}, rosterReady = false;
const sync = () => E.setData(cfg, absences, wheels);
const rosterLoaded = new Promise(resolve => {
  const app = initializeApp(firebaseConfig), auth = getAuth(app), fsdb = getFirestore(app);
  let started = false;
  onAuthStateChanged(auth, user => {
    if (!user || started) return;
    started = true;
    const fail = e => log('Firebase error:', e.code || e.message);
    onSnapshot(doc(fsdb, 'config/main'), s => { cfg = s.exists() ? s.data() : null; sync(); if (!rosterReady) { rosterReady = true; resolve(); } }, fail);
    onSnapshot(collection(fsdb, 'absences'), s => { absences = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); sync(); }, fail);
    onSnapshot(collection(fsdb, 'wheel'), s => { wheels = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); sync(); }, fail);
  });
  signInAnonymously(auth).catch(e => { console.error('Firebase sign-in failed:', e.code || e.message); process.exit(1); });
});

/* ---------- who has joined ---------- */
// data/subscribers.json: { "Prashant": { "jid": "9715xxxxxxxx@s.whatsapp.net", "since": "..." } }
// Phone numbers are kept only here, on this machine, never in Firebase.
const SUBS_FILE = path.join(DATA, 'subscribers.json');
let subs = readJson(SUBS_FILE, {});
const saveSubs = () => writeJson(SUBS_FILE, subs);
const nameForJid = jid => Object.keys(subs).find(n => subs[n].jid === jid);

/* ---------- already-sent log, so restarts never send twice ---------- */
const SENT_FILE = path.join(DATA, 'sent.json');
const sent = new Set(readJson(SENT_FILE, []));
function saveSent() {
  const keep = E.dkey(E.addDays(E.sod(new Date()), -1));
  for (const k of sent) if (k.slice(0, 10) < keep) sent.delete(k);
  writeJson(SENT_FILE, [...sent]);
}

if (args[0] === '--preview') {
  await rosterLoaded;
  const lead = leadMinutes(CONF.leadMinutes), names = args[1] ? [args[1]] : Object.keys(subs);
  if (!names.length) console.log('Nobody has joined yet. Try: node bot.mjs --preview Prashant');
  for (const n of names) {
    console.log(`\n===== ${n} =====`);
    const list = previewDay(n, new Date(), lead);
    if (!list.length) console.log(E.staff().includes(n) ? '(no roles today)' : `(${n} is not on the team list)`);
    for (const m of list) console.log(`--- sent at ${E.fmtT(m.at.getHours() * 60 + m.at.getMinutes())}\n${m.text}`);
  }
  process.exit(0);
}

/* ---------- WhatsApp ---------- */
const B = await import('baileys');
const { default: pino } = await import('pino');
const { default: qrcode } = await import('qrcode-terminal');
const AUTH_DIR = path.join(DATA, 'auth');

let sock = null, waOpen = false, pairingAsked = false, selfJids = new Set();

async function startWhatsApp() {
  const { state, saveCreds } = await B.useMultiFileAuthState(AUTH_DIR);
  let version;
  try { ({ version } = await B.fetchLatestBaileysVersion()); } catch { /* use the built-in version */ }
  sock = B.makeWASocket({
    version, auth: state, logger: pino({ level: 'silent' }),
    browser: B.Browsers.ubuntu('Chrome'), markOnlineOnConnect: false, syncFullHistory: false,
  });
  sock.ev.on('creds.update', saveCreds);

  const phone = digits(CONF.botNumber);
  if (!state.creds.registered && phone && !pairingAsked) {
    pairingAsked = true;
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(phone);
        log(`Pairing code for +${phone}:  ${code.match(/.{1,4}/g).join('-')}`);
        log('On that phone: WhatsApp → Settings → Linked devices → Link a device → Link with phone number instead → type the code.');
      } catch (e) { log('Could not get a pairing code:', e.message); pairingAsked = false; }
    }, 3000);
  }

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr && !phone) {
      log('Scan this QR code: WhatsApp → Settings → Linked devices → Link a device');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') {
      waOpen = true;
      selfJids = new Set([sock.user?.id, sock.user?.lid].filter(Boolean).map(j => B.jidNormalizedUser(j)));
      log(`WhatsApp connected as +${digits(B.jidNormalizedUser(sock.user.id))}. ${Object.keys(subs).length} joined so far.`);
      pump();
    }
    if (connection === 'close') {
      waOpen = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === B.DisconnectReason.loggedOut) {
        log('This device was unlinked from WhatsApp. Delete the folder data/auth and start the bot again to link it.');
        process.exit(1);
      }
      if (!sock.authState.creds.registered) pairingAsked = false;
      log(`WhatsApp disconnected (${code || 'network'}). Reconnecting in 5 seconds…`);
      setTimeout(() => startWhatsApp().catch(e => log('Reconnect failed:', e.message)), 5000);
    }
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) handleIncoming(m).catch(e => log('Reply failed:', e.message));
  });
}

/* ---------- sending: one at a time, with a short random pause ---------- */
const queue = [];
let pumping = false;
async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length && waOpen) {
      const m = queue[0];
      const gone = m.name && subs[m.name]?.jid !== m.jid; // they sent STOP or moved number meanwhile
      if (gone || (m.expires && Date.now() > m.expires)) { queue.shift(); m.onDrop?.(); continue; }
      try {
        await sock.sendMessage(m.jid, { text: m.text });
        queue.shift();
        m.onSent?.();
      } catch (e) { log('Send failed, will retry:', e.message); break; }
      const lo = +CONF.minDelaySeconds || 2, hi = Math.max(lo, +CONF.maxDelaySeconds || 5);
      await sleep((lo + Math.random() * (hi - lo)) * 1000);
    }
  } finally { pumping = false; }
}
function send(jid, text, extra = {}) { queue.push({ jid, text, ...extra }); pump(); }

/* ---------- every 15 seconds: anything due? ---------- */
const queued = new Set();
function tick() {
  if (!rosterReady || !cfg) return;
  const lead = leadMinutes(CONF.leadMinutes), now = new Date();
  for (const m of dueMessages(now, Object.keys(subs), sent, { lead, graceMin: 1 })) {
    if (queued.has(m.key)) continue;
    const sub = subs[m.name];
    if (!sub) continue;
    queued.add(m.key);
    send(sub.jid, m.text, {
      name: m.name,
      expires: Date.now() + (lead + 2) * 60000,
      onSent: () => { sent.add(m.key); queued.delete(m.key); saveSent(); log(`Sent ${m.name}: ${m.role}`); },
      onDrop: () => { queued.delete(m.key); log(`Skipped message for ${m.name}: ${m.role}`); },
    });
  }
}

/* ---------- commands people can send to the bot ---------- */
const HELP = [
  '🤖 *What Am I Now? alerts*',
  '• *START Name* : get a message before every role change (e.g. START Prashant)',
  '• *NOW* : your role right now and your next one',
  '• *STOP* : turn the messages off',
].join('\n');

async function handleIncoming(m) {
  const jid = m.key?.remoteJid || '';
  if (!jid || jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) return;
  const norm = B.jidNormalizedUser(jid);
  // Only messages from other people, or ones you send to yourself in "Message yourself".
  if (m.key.fromMe && !selfJids.has(norm)) return;
  const text = (m.message?.conversation || m.message?.extendedTextMessage?.text || '').trim();
  const cmd = text.match(/^(start|join|stop|now|role|help)\b\s*(.*)$/i);
  if (!cmd) return; // ignore normal chat, so this is safe on a personal number

  // Reply to the phone-number address when WhatsApp gives a hidden (LID) one.
  let who = norm;
  if (m.key.fromMe) who = B.jidNormalizedUser(sock.user.id);
  else if (B.isLidUser(jid) && m.key.senderPn) who = B.jidNormalizedUser(m.key.senderPn);

  const word = cmd[1].toLowerCase(), arg = cmd[2].trim();
  if (!rosterReady) return send(who, 'The roster is still loading. Try again in a minute.');
  const team = E.staff(), lead = leadMinutes(CONF.leadMinutes);

  if (word === 'start' || word === 'join') {
    const name = team.find(n => n.toLowerCase() === arg.toLowerCase());
    if (!name) {
      return send(who, `Send *START* and your name exactly as it is on the roster, for example *START ${team[0] || 'Ahmed'}*.\n\nNames: ${team.join(', ')}`);
    }
    for (const n of Object.keys(subs)) if (subs[n].jid === who && n !== name) delete subs[n];
    const old = subs[name];
    if (old && old.jid !== who) send(old.jid, `ℹ️ Role alerts for *${name}* now go to another WhatsApp number.`);
    subs[name] = { jid: who, since: new Date().toISOString() };
    saveSubs();
    log(`${name} joined from +${digits(who)}`);
    return send(who, `✅ Done, *${name}*. You'll get a message ${lead} min before every role change.\nSend *NOW* any time, or *STOP* to turn it off.\n\n${nowText(name, new Date())}`);
  }
  const mine = nameForJid(who);
  if (word === 'stop') {
    if (!mine) return send(who, 'You are not getting role alerts.');
    for (const n of Object.keys(subs)) if (subs[n].jid === who) delete subs[n];
    saveSubs();
    log(`${mine} stopped alerts`);
    return send(who, `🔕 Role alerts are off, ${mine}. Send *START ${mine}* to turn them back on.`);
  }
  if (word === 'now' || word === 'role') {
    if (!mine) return send(who, 'Send *START* and your name first, e.g. *START Prashant*.');
    return send(who, nowText(mine, new Date()));
  }
  return send(who, HELP);
}

/* ---------- go ---------- */
process.on('unhandledRejection', e => log('Error:', e?.message || e));
log(`Starting. Time zone ${CONF.timezone}. Loading the roster from Firebase…`);
await rosterLoaded;
log(`Roster loaded: ${E.staff().length} people on the team.`);
await startWhatsApp();
setInterval(tick, 15000);
tick();
