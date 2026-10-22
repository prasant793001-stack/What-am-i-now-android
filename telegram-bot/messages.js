// Works out which alert messages are due, using the same roster engine as the website.
// No Telegram or Firebase code here, so it can be tested on its own.
import { C, staff, sod, dkey, fmtT, fmtRange, dayRoster, allSlots, roleOf } from '../roster-engine.js';

const MIN = 60000;

/** Minutes of warning before each role change: the bot's own setting, else the roster's "Alert before" setting. */
export function leadMinutes(botLead) {
  const v = Number.isFinite(+botLead) && botLead !== null && botLead !== '' ? +botLead : +C().leadMin;
  return v > 0 ? v : 3;
}

/** One person's roles today, in time order, with links to the role before and after. */
function personDay(r, name) {
  const out = [];
  for (const sl of allSlots(r)) {
    const role = roleOf(r, sl, name);
    if (role) out.push({ sl, role });
  }
  return out;
}

function roleText(item, mins, name) {
  const { sl, role } = item, when = mins <= 0 ? 'now' : `in ${mins} min`;
  const head = role.brk
    ? `☕ *${name}*, your *${role.name.toUpperCase()}* starts ${when}`
    : `⏰ *${name}*, ${when} it's your *${role.name.toUpperCase()}* time`;
  const lines = [head, `🕑 ${fmtRange(sl.start, sl.end)}`];
  const tail = [];
  if (item.prev) tail.push(`Moving from ${item.prev.role.name}`);
  else tail.push('First role of your shift');
  if (item.next) tail.push(`next: ${item.next.role.name} at ${fmtT(item.next.sl.start)}`);
  else tail.push('last role today');
  lines.push('↪️ ' + tail.join(' · '));
  return lines.join('\n');
}

/**
 * Messages due right now.
 * A message is due from `lead` minutes before a slot starts until `graceMin` minutes after it starts,
 * so a short bot restart doesn't lose messages, but a long outage doesn't send old ones.
 * @param {Date} now
 * @param {string[]} names  people who joined (subscribed)
 * @param {Set<string>} sent  keys already sent
 */
export function dueMessages(now, names, sent, { lead = 3, graceMin = 1 } = {}) {
  const day = sod(now), r = dayRoster(day);
  if (!r.shifts) return [];
  const t0 = day.getTime(), out = [], team = staff();
  for (const name of names) {
    if (!team.includes(name)) continue;
    const items = personDay(r, name);
    items.forEach((it, i) => {
      const prev = i > 0 && items[i - 1].sl.end === it.sl.start ? items[i - 1] : null;
      const next = items[i + 1] && items[i + 1].sl.start === it.sl.end ? items[i + 1] : null;
      const startMs = t0 + it.sl.start * MIN;
      if (now < startMs - lead * MIN || now >= startMs + graceMin * MIN) return;
      const key = `${r.key}@${it.sl.start}@${name}`;
      if (sent.has(key)) return;
      const mins = Math.max(0, Math.round((startMs - now) / MIN));
      out.push({ key, name, role: it.role.name, text: roleText({ ...it, prev, next }, mins, name) });
    });
  }
  return out;
}

/** Reply for the NOW command. */
export function nowText(name, now) {
  const day = sod(now), r = dayRoster(day);
  if (r.off) return `🗓️ *${name}*, today is a day off. No roster.`;
  if (r.empty) return 'The roster has no team set up yet.';
  if ((r.absent || []).includes(name)) return `🤒 *${name}*, you're marked on leave today. Get well soon.`;
  const t = (now - day.getTime()) / MIN, items = personDay(r, name);
  const cur = items.find(i => i.sl.start <= t && t < i.sl.end), nxt = items.find(i => i.sl.start > t);
  const lines = [];
  if (cur) lines.push(`🟢 *${name}*, right now you're *${cur.role.name.toUpperCase()}* until ${fmtT(cur.sl.end)}`);
  else lines.push(`⚪ *${name}*, you're not on the floor right now`);
  if (nxt) lines.push(`➡️ Next: *${nxt.role.name}* at ${fmtT(nxt.sl.start)}`);
  else lines.push('✅ No more roles today');
  return lines.join('\n');
}

/** Today's full message list for one person (used by --preview). */
export function previewDay(name, date, lead) {
  const day = sod(date), r = dayRoster(day), out = [];
  if (!r.shifts) return out;
  const t0 = day.getTime();
  for (const sl of allSlots(r)) {
    const at = new Date(t0 + (sl.start - lead) * MIN);
    const due = dueMessages(at, [name], new Set(), { lead, graceMin: 0 }).filter(m => m.key === `${dkey(day)}@${sl.start}@${name}`);
    due.forEach(m => out.push({ at, ...m }));
  }
  return out;
}
