// Roster engine: works out who does which role and when.
// Shared by the website (index.html) and the WhatsApp bot, so both always agree.
// Pure JavaScript, no browser or Node APIs.
const S={cfg:null,absences:{},wheels:{}};
let cache=new Map();
const DAYN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DEFAULTS={roles:[{name:'Greeter'},{name:'SAS1'},{name:'SAS2'},{name:'SAS3'},{name:'GA'},{name:'TAB1'},{name:'TAB2'},{name:'TAB3'},{name:'TAB4'},{name:'Break',brk:true}],
  shifts:[{name:'Shift 1',start:'08:00',end:'12:30'},{name:'Shift 2',start:'12:30',end:'17:00'}],
  slotMode:'auto',leadMin:3,workDays:[0,1,2,3,4,5,6],wheelHours:24};
function sod(d){const x=new Date(d);x.setHours(0,0,0,0);return x}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function dkey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function fromKey(k){const [y,m,dd]=k.split('-').map(Number);return new Date(y,m-1,dd)}
function monday(d){const x=sod(d);return addDays(x,-((x.getDay()+6)%7))}
function wkKey(d){return dkey(monday(d))}
function parseHM(s){const [h,m]=String(s||'0:0').split(':').map(Number);return (h||0)*60+(m||0)}
function fmtT(m,ap=true){const h=Math.floor(m/60)%24,mm=m%60;return (h%12||12)+':'+String(mm).padStart(2,'0')+(ap?(h<12?' AM':' PM'):'')}
function fmtRange(a,b){return ((Math.floor(a/60)%24<12)===(Math.floor(b/60)%24<12))?fmtT(a,false)+'–'+fmtT(b):fmtT(a)+'–'+fmtT(b)}
function fmtDay(d){return DAYN[d.getDay()]+' '+d.getDate()+' '+MON[d.getMonth()]}
function fmtCd(ms){if(ms<=0)return '0:00';const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60),ss=s%60;return h?h+'h '+String(m).padStart(2,'0')+'m':m+':'+String(ss).padStart(2,'0')}
function hash(s){let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function rng(seed){let a=seed>>>0;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function shuffle(arr,r){const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function rotate(a,k){const n=a.length;if(!n)return[];k=((k%n)+n)%n;return a.map((_,i)=>a[(i+k)%n])}
function pkey(n){return String(n).replace(/[^A-Za-z0-9_\-.~:@+]/g,'_')||'_'}
const C=()=>Object.assign({},DEFAULTS,S.cfg||{});
const staff=()=>(S.cfg&&Array.isArray(S.cfg.staff))?S.cfg.staff:[];
// Renamed people: config.renamed maps an old name to the new one ({"Prasant":"Prashant"}), so leave, wheel picks and
// fixed days saved under the old name still belong to the same person. A name that is in use again is never mapped.
function renameMap(){const r=S.cfg&&S.cfg.renamed;return r&&typeof r==='object'&&!Array.isArray(r)?r:{}}
function liveNames(){return new Set([...staff(),...(Array.isArray(C().observers)?C().observers:[])])}
function liveName(n){const rn=renameMap();if(!(n in rn))return n;const live=liveNames();if(live.has(n))return n;let x=n,k=0;while(rn[x]&&!live.has(x)&&k++<30)x=rn[x];return x}
const uniq=a=>[...new Set(a)];
function fixAbsences(a){const out={};for(const [k,d] of Object.entries(a||{})){if(!d||typeof d!=='object'){out[k]=d;continue}const x={...d};if(Array.isArray(d.names))x.names=uniq(d.names.map(liveName));
  if(d.lock&&typeof d.lock==='object'){x.lock={...d.lock};if(Array.isArray(d.lock.full))x.lock.full=uniq(d.lock.full.map(liveName));if(Array.isArray(d.lock.dayOff))x.lock.dayOff=uniq(d.lock.dayOff.map(liveName))}out[k]=x}return out}
function fixWheels(w){const out={};for(const [k,d] of Object.entries(w||{})){if(!d||typeof d!=='object'||!d.assign){out[k]=d;continue}const a={};for(const [p,v] of Object.entries(d.assign)){const q=liveName(p);if(!(q in a))a[q]=v}out[k]={...d,assign:a}}return out}
/** Give the engine the latest data from Firestore. Call after every change. */
function setData(cfg,absences,wheels){S.cfg=cfg||null;cache=new Map();const rn=Object.keys(renameMap()).length;S.absences=rn?fixAbsences(absences):(absences||{});S.wheels=rn?fixWheels(wheels):(wheels||{})}
/* ---------- roster engine ---------- */
// How a day is built:
//  * Each week has a queue of the whole team (weekQueue). In a day's first slot the roles go out in queue order; every
//    later slot moves everyone one step: Greeter → Break → last TAB → … → SAS1 → Greeter.
//  * Next day: the queue moves up by one, so the order carries straight on (yesterday's Greeter starts on Break).
//  * Saturday: the people and roles picked in Settings → Saturday are taken out for that day (no Standby is ever added).
//    Saturday changes start from config.rulesFrom, so a day that is already running never changes mid-shift.
//  * More people than roles: the extras get working roles, never "Break 2". Roles left out that day come back first
//    (TAB3, then SAS3), then new ones are added: TAB4, SAS4, TAB5…
//  * Fixed days: when a working day starts, the site saves it (absences/<date>.lock: who works, in which order, the roles
//    and shift times). After that, settings changes, new people and wheel picks never change that day; only leave does.
const normName=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const isStandby=r=>/stand\s*-?\s*by/i.test(String((r&&r.name)||''));
function rolesAll(){return (C().roles||[]).filter(r=>r&&r.name&&!isStandby(r)).map(r=>({name:String(r.name),brk:!!r.brk}))}
function rulesFrom(){return (S.cfg&&S.cfg.rulesFrom)||dkey(addDays(sod(new Date()),1))}
function isNew(d){return dkey(d)>=rulesFrom()}
function satRule(){
  const s=staff(),r=C().satRule;
  if(r&&typeof r==='object')return{on:r.on!==false,staff:uniq((r.staff||[]).map(liveName)).filter(n=>s.includes(n)),roles:(r.roles||[]).map(String)};
  return{on:true,staff:s.filter(n=>['hamada','hamda','hamdah','ahoud'].includes(normName(n))),
    roles:rolesAll().filter(x=>x.brk||['tab3','sas3'].includes(normName(x.name))).map(x=>x.name)};
}
function satApplies(d){return d.getDay()===6&&isNew(d)&&satRule().on}
// A fixed day's saved roster, or null. Kept with that day's leave so the bot and every copy of the site read it too.
function lockOf(d){const a=S.absences[typeof d==='string'?d:dkey(d)],l=a&&a.lock;return l&&typeof l==='object'&&Array.isArray(l.full)&&Array.isArray(l.roles)&&Array.isArray(l.shifts)?l:null}
const isLocked=d=>!!lockOf(d);
function satOff(d){return satApplies(d)?satRule().staff:[]}
function liveRoles(d){const rs=rolesAll();if(!satApplies(d))return rs;const off=new Set(satRule().roles.map(normName));return rs.filter(r=>!off.has(normName(r.name)))}
function dayOffStaff(d){const L=lockOf(d);return L?(L.dayOff||[]).slice():satOff(d)}
function dayRoles(d){const L=lockOf(d);return L?L.roles.map(r=>({name:String(r.name),brk:!!r.brk})):liveRoles(d)}
function isWorkDay(d){return (C().workDays||[]).includes(d.getDay())}
function prevWorkDay(d){for(let k=1;k<=7;k++){const x=addDays(d,-k);if(isWorkDay(x))return x}return null}
function weekDays(wk){const m=fromKey(wk);return [...Array(7)].map((_,i)=>addDays(m,i)).filter(isWorkDay)}
function scheduled(d){const off=dayOffStaff(d);return staff().filter(n=>!off.includes(n))}
function normalize(order){const s=staff();const out=[...new Set(order)].filter(x=>s.includes(x));for(const x of s)if(!out.includes(x))out.push(x);return out}
function cleanAssign(w){const s=staff(),n=s.length,out={},used=new Set();for(const [p0,pos] of Object.entries((w&&w.assign)||{})){const p=liveName(p0);if(s.includes(p)&&!(p in out)&&Number.isInteger(pos)&&pos>=0&&pos<n&&!used.has(pos)){out[p]=pos;used.add(pos)}}return out}
const hasWheel=wk=>Object.keys(cleanAssign(S.wheels[wk])).length>0;
function weekQueue(wk){
  const ck='b'+wk;if(cache.has(ck))return cache.get(ck);
  const c=C(),anchor=c.anchorWeek||wkKey(new Date()),wd=(c.workDays||[]).length||7;let res;
  if(wk===anchor)res=normalize(staff());
  else if(wk<anchor)res=rotate(weekQueue(dkey(addDays(fromKey(wk),7))),-wd);
  else res=hasWheel(wk)?wheelOrder(wk):rotate(weekQueue(dkey(addDays(fromKey(wk),-7))),wd);
  cache.set(ck,res);return res;
}
function match(people,free,bad){const res=[],used=new Set();const go=k=>{if(k===people.length)return true;for(const i of free){if(used.has(i)||bad(people[k],i))continue;used.add(i);res[k]=i;if(go(k+1))return true;used.delete(i)}return false};return go(0)?res.slice():null}
// Who may not land where on next week's pick: last week's spot 1 and 2 openers can't repeat them.
function wheelForbids(wk){
  const ck='w'+wk;if(cache.has(ck))return cache.get(ck);
  const pw=dkey(addDays(fromKey(wk),-7)),pd=weekDays(pw),pl=pd.length?lockOf(pd[0]):null,prev=pl?pl.full:weekQueue(pw),same={},all={};
  const add=(m,p,i)=>{if(p)(m[p]=m[p]||new Set()).add(i)};
  add(same,prev[0],0);add(same,prev[1],1);add(all,prev[0],0);add(all,prev[1],1);
  const res={same,brk:{},all,mon0:prev[0]||null,mon1:prev[1]||null,lastG:null,lastDay:null};cache.set(ck,res);return res;
}
function wheelOrder(wk){
  const s=staff(),n=s.length,a=cleanAssign(S.wheels[wk]),forb=wheelForbids(wk).all,order=Array(n).fill(null);
  for(const [p,pos] of Object.entries(a))order[pos]=p;
  const r=rng(hash('wheel'+wk));
  const people=shuffle(s.filter(p=>!(p in a)),r),free=shuffle([...Array(n).keys()].filter(i=>order[i]==null),r);
  const sol=match(people,free,(p,i)=>forb[p]&&forb[p].has(i))||match(people,free,()=>false)||[];
  people.forEach((p,k)=>order[sol[k]]=p);return order;
}
// The roles for n people. Fewer people: the last working roles are dropped first (Break stays). More people: extra working
// roles are added, never "Break 2": TAB3, SAS3, TAB4, SAS4, TAB5… (whichever of these isn't already in use).
// `ref` is the full role list in Settings order; a role from it comes back in its usual place.
const roleKind=name=>{const m=normName(name).match(/^(tab|sas)(\d+)$/);return m?{k:m[1],n:+m[2]}:null};
function addExtra(pos,ref,k,n){
  const key=k+n,r=(ref||[]).find(x=>normName(x.name)===key),have=new Set(pos.map(x=>normName(x.name)));
  if(r){const i=ref.indexOf(r);for(let j=i-1;j>=0;j--){const at=pos.findIndex(x=>normName(x.name)===normName(ref[j].name));if(at>=0){pos.splice(at+1,0,{name:String(r.name),brk:false});return}}
    for(let j=i+1;j<ref.length;j++){const at=pos.findIndex(x=>normName(x.name)===normName(ref[j].name));if(at>=0){pos.splice(at,0,{name:String(r.name),brk:false});return}}}
  const same=pos.map((x,i)=>({q:roleKind(x.name),i})).filter(o=>o.q&&o.q.k===k),style=same.length?String(pos[same[same.length-1].i].name).replace(/\d+\s*$/,''):k.toUpperCase();
  const role={name:r?String(r.name):style+n,brk:false};if(have.has(normName(role.name)))return;
  const before=same.filter(o=>o.q.n<n);let at;
  if(before.length)at=before[before.length-1].i+1;else if(same.length)at=same[0].i;else{const b=pos.findIndex(x=>x.brk);at=b<0?pos.length:b}
  pos.splice(at,0,role);
}
function buildPositions(n,roles,ref){
  const all=ref||rolesAll(),pos=(roles||all).map(r=>({name:String(r.name),brk:!!r.brk}));if(!n)return[];
  if(n>pos.length){for(let k=1;pos.length<n&&k<500;k++)for(const kind of ['tab','sas']){if(pos.length>=n)break;if(pos.some(x=>normName(x.name)===kind+k))continue;addExtra(pos,all,kind,k)}}
  else while(pos.length>n){let i=-1;for(let j=pos.length-1;j>=0;j--)if(!pos[j].brk){i=j;break}pos.splice(i<0?pos.length-1:i,1)}
  return pos;
}
function lastWorking(pos){for(let j=pos.length-1;j>=1;j--)if(!pos[j].brk)return j;return -1}
// Daily rotation: the week's queue moves up one place per working day.
function oldFull(d){const wk=wkKey(d);let idx=0;for(const x of weekDays(wk)){if(dkey(x)>=dkey(d))break;idx++}return rotate(weekQueue(wk),idx)}
// Everyone scheduled for a working day, in first-slot order (before sick leave is taken out).
function liveFull(d){const k='f'+dkey(d);if(cache.has(k))return cache.get(k);const off=satOff(d),res=oldFull(d).filter(x=>!off.includes(x));cache.set(k,res);return res}
function dayFull(d){const L=lockOf(d);return L?L.full.slice():liveFull(d)}
/** What gets saved when a day becomes fixed: the day exactly as the current settings make it (ignores any saved lock). */
function lockData(d){
  if(!staff().length||!isWorkDay(d))return null;const c=C();
  return{v:1,full:liveFull(d).slice(),dayOff:satOff(d).slice(),roles:liveRoles(d),ref:rolesAll(),
    shifts:(c.shifts||[]).map(s=>({name:String(s.name||''),start:String(s.start||''),end:String(s.end||'')})),slotMode:c.slotMode==null?'auto':c.slotMode};
}
// The week's Monday order including people who are off that day (Settings list).
function weekOrder(wk){const days=weekDays(wk),Q=weekQueue(wk);if(!days.length)return Q;const f=liveFull(days[0]);const i=f.length?Q.indexOf(f[0]):0;return rotate(Q,Math.max(0,i))}
function buildSlots(s,e,n,mode){
  if(e<=s||!n)return[];const out=[];
  if(mode==='auto'){let prev=s;for(let k=1;k<=n;k++){const b=k===n?e:s+Math.round(k*(e-s)/n/5)*5;if(b>prev){out.push({start:prev,end:b});prev=b}}return out}
  const L=Math.max(5,+mode||30);for(let t=s;t<e;t+=L)out.push({start:t,end:Math.min(e,t+L)});return out;
}
function dayRoster(date){
  const key=dkey(date),ck='d'+key;if(cache.has(ck))return cache.get(ck);
  const c=C(),L=lockOf(key);let res;
  if(!L&&!staff().length)res={key,empty:true};
  else if(!L&&!isWorkDay(date))res={key,off:true};
  else{
    const full=L?L.full.slice():liveFull(date),dayOff=L?(L.dayOff||[]).slice():satOff(date);
    const absent=((S.absences[key]||{}).names||[]).filter(x=>full.includes(x));
    const order=full.filter(x=>!absent.includes(x)),positions=L?buildPositions(order.length,L.roles,Array.isArray(L.ref)?L.ref:L.roles):buildPositions(order.length,liveRoles(date));
    const sh0=L?L.shifts:(c.shifts||[]),mode=L?(L.slotMode==null?'auto':L.slotMode):c.slotMode;
    const shifts=sh0.map(sh=>({...sh,slots:buildSlots(parseHM(sh.start),parseHM(sh.end),order.length,mode).map((sl,i)=>({...sl,cells:positions.map((_,j)=>order[(i+j)%order.length])}))}));
    res={key,full,order,absent,dayOff,positions,shifts,locked:!!L,slotMode:mode};
  }
  cache.set(ck,res);return res;
}
function allSlots(r){const out=[];(r.shifts||[]).forEach(sh=>sh.slots.forEach(sl=>out.push({...sl,shift:sh.name})));return out.sort((a,b)=>a.start-b.start)}
function roleOf(r,slot,name){const i=slot.cells.indexOf(name);return i<0?null:r.positions[i]}

// Kept for anything that still uses the old names.
const baseOrder=weekQueue;
function forbidsFor(prev){const f={};if(prev[0])f[prev[0]]=new Set([0]);if(prev[1])(f[prev[1]]=f[prev[1]]||new Set()).add(1);return f}
function myItems(r,who,t){const items=[];if(!r.shifts||(r.absent||[]).includes(who))return items;for(const sl of allSlots(r)){const role=roleOf(r,sl,who);if(!role)continue;items.push({sl,role,cur:sl.start<=t&&t<sl.end,past:sl.end<=t})}return items}

export { DAYN, MON, DEFAULTS, sod, addDays, dkey, fromKey, monday, wkKey, parseHM, fmtT, fmtRange, fmtDay, fmtCd, hash, rng, shuffle, rotate, pkey, C, staff, setData, normalize, baseOrder, cleanAssign, forbidsFor, match, wheelOrder, buildPositions, buildSlots, dayRoster, allSlots, roleOf, myItems,
  normName, isStandby, rolesAll, rulesFrom, isNew, satRule, satApplies, dayOffStaff, dayRoles, isWorkDay, prevWorkDay, weekDays, scheduled, hasWheel, weekQueue, wheelForbids, lastWorking, dayFull, weekOrder,
  liveName, renameMap, lockOf, isLocked, lockData };
