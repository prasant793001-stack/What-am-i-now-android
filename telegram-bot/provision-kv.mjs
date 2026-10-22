// Used by GitHub Actions: finds (or creates) the Cloudflare KV store the worker keeps its list of joined people in,
// and writes its id into wrangler.toml. Needs CLOUDFLARE_API_TOKEN.
import fs from 'node:fs';
const T = process.env.CLOUDFLARE_API_TOKEN, TITLE = 'what-am-i-now-telegram';
const api = async (path, init = {}) => {
  const r = await fetch('https://api.cloudflare.com/client/v4' + path, { ...init, headers: { Authorization: 'Bearer ' + T, 'Content-Type': 'application/json' } });
  const j = await r.json();
  if (!j.success) throw new Error(path + ': ' + JSON.stringify(j.errors));
  return j.result;
};
let account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!account) {
  const accts = await api('/accounts');
  if (!accts.length) throw new Error('The Cloudflare token cannot see any account. Use the "Edit Cloudflare Workers" token template.');
  account = accts[0].id;
}
const list = await api(`/accounts/${account}/storage/kv/namespaces?per_page=100`);
let ns = list.find(n => n.title === TITLE);
if (!ns) { ns = await api(`/accounts/${account}/storage/kv/namespaces`, { method: 'POST', body: JSON.stringify({ title: TITLE }) }); console.log('Created KV store', ns.id); }
else console.log('Using KV store', ns.id);
fs.writeFileSync('wrangler.toml', fs.readFileSync('wrangler.toml', 'utf8').replace(/id = "[^"]*"/, `id = "${ns.id}"`));
fs.appendFileSync(process.env.GITHUB_ENV || '/dev/null', `CLOUDFLARE_ACCOUNT_ID=${account}\n`);
