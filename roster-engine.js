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
/** Give the engine the latest data from Firestore. Call after every change. */
function setData(cfg,absences,wheels){S.cfg=cfg||null;S.absences=absences||{};S.wheels=wheels||{};cache=new Map()}
/* ---------- roster engine ---------- */
// How a day is built:
//  * Each week has a cyclic queue of the whole team (weekQueue). In a day's first slot the roles go out in queue order
//    from that day's starting person; every later slot moves everyone one step: Greeter → Break → last TAB → … → SAS1.
//  * Next day: everyone carries on along that same sequence, but nobody can start a shift on Break straight after opening
//    as Greeter. Yesterday's Greeter starts on the last working role (TAB3, or TAB4 / TAB2 when that is the last one that
//    day) and everyone else follows in the same order.
//  * Saturday: the people and roles picked in Settings → Saturday are taken out for that day (no Standby is ever added).
//  * Days before config.rulesFrom keep the old one-step rotation, so a day that is already running never changes mid-shift.
const normName=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const isStandby=r=>/stand\s*-?\s*by/i.test(String((r&&r.name)||''));
function rolesAll(){return (C().roles||[]).filter(r=>r&&r.name&&!isStandby(r)).map(r=>({name:String(r.name),brk:!!r.brk}))}
function rulesFrom(){return (S.cfg&&S.cfg.rulesFrom)||dkey(addDays(sod(new Date()),1))}
function isNew(d){return dkey(d)>=rulesFrom()}
function satRule(){
  const s=staff(),r=C().satRule;
  if(r&&typeof r==='object')return{on:r.on!==false,staff:(r.staff||[]).filter(n=>s.includes(n)),roles:(r.roles||[]).map(String)};
  return{on:true,staff:s.filter(n=>['hamada','hamda','hamdah','ahoud'].includes(normName(n))),
    roles:rolesAll().filter(x=>x.brk||['tab3','sas3'].includes(normName(x.name))).map(x=>x.name)};
}
function satApplies(d){return d.getDay()===6&&isNew(d)&&satRule().on}
function dayOffStaff(d){return satApplies(d)?satRule().staff:[]}
function dayRoles(d){const rs=rolesAll();if(!satApplies(d))return rs;const off=new Set(satRule().roles.map(normName));return rs.filter(r=>!off.has(normName(r.name)))}
function isWorkDay(d){return (C().workDays||[]).includes(d.getDay())}
function prevWorkDay(d){for(let k=1;k<=7;k++){const x=addDays(d,-k);if(isWorkDay(x))return x}return null}
function weekDays(wk){const m=fromKey(wk);return [...Array(7)].map((_,i)=>addDays(m,i)).filter(isWorkDay)}
function scheduled(d){const off=dayOffStaff(d);return staff().filter(n=>!off.includes(n))}
function normalize(order){const s=staff();const out=[...new Set(order)].filter(x=>s.includes(x));for(const x of s)if(!out.includes(x))out.push(x);return out}
function cleanAssign(w){const s=staff(),n=s.length,out={},used=new Set();for(const [p,pos] of Object.entries((w&&w.assign)||{})){if(s.includes(p)&&Number.isInteger(pos)&&pos>=0&&pos<n&&!used.has(pos)){out[p]=pos;used.add(pos)}}return out}
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
// Who may not land where on next week's wheel: last week's spot 1 and 2 openers can't repeat them, and the person who is
// Greeter on the last working day before that Monday can't start Monday on Break.
function wheelForbids(wk){
  const ck='w'+wk;if(cache.has(ck))return cache.get(ck);
  const days=weekDays(dkey(addDays(fromKey(wk),-7))),same={},brk={},all={};
  const add=(m,p,i)=>{if(p)(m[p]=m[p]||new Set()).add(i)};
  const mon=days.length?dayFull(days[0]):[];add(same,mon[0],0);add(same,mon[1],1);
  let lastG=null;const first=weekDays(wk)[0];
  if(days.length&&first&&isNew(first)){lastG=dayFull(days[days.length-1])[0]||null;buildPositions(staff().length).forEach((p,i)=>{if(p.brk)add(brk,lastG,i)})}
  for(const m of [same,brk])for(const [p,set] of Object.entries(m))for(const i of set)add(all,p,i);
  const res={same,brk,all,mon0:mon[0]||null,mon1:mon[1]||null,lastG,lastDay:days[days.length-1]||null};cache.set(ck,res);return res;
}
function wheelOrder(wk){
  const s=staff(),n=s.length,a=cleanAssign(S.wheels[wk]),forb=wheelForbids(wk).all,order=Array(n).fill(null);
  for(const [p,pos] of Object.entries(a))order[pos]=p;
  const r=rng(hash('wheel'+wk));
  const people=shuffle(s.filter(p=>!(p in a)),r),free=shuffle([...Array(n).keys()].filter(i=>order[i]==null),r);
  const sol=match(people,free,(p,i)=>forb[p]&&forb[p].has(i))||match(people,free,()=>false)||[];
  people.forEach((p,k)=>order[sol[k]]=p);return order;
}
function buildPositions(n,roles){
  const pos=(roles||rolesAll()).map(r=>({name:r.name,brk:!!r.brk}));if(!n)return[];
  if(n>pos.length){const b=pos.find(r=>r.brk),bn=b?b.name:'Break';let k=b?2:1;while(pos.length<n){pos.push({name:k===1?bn:bn+' '+k,brk:true});k++}}
  else while(pos.length>n){let i=-1;for(let j=pos.length-1;j>=0;j--)if(!pos[j].brk){i=j;break}pos.splice(i<0?pos.length-1:i,1)}
  return pos;
}
function lastWorking(pos){for(let j=pos.length-1;j>=1;j--)if(!pos[j].brk)return j;return -1}
// Old rotation (days before rulesFrom): the week's queue moves up one place per working day.
function oldFull(d){const wk=wkKey(d);let idx=0;for(const x of weekDays(wk)){if(dkey(x)>=dkey(d))break;idx++}return rotate(weekQueue(wk),idx)}
function isReset(d){const wk=wkKey(d),f=weekDays(wk)[0];if(!f||dkey(f)!==dkey(d))return false;const anchor=C().anchorWeek||wkKey(new Date());return wk<=anchor||hasWheel(wk)}
// Next day from the day before: yesterday's Greeter lands on today's last working role; the rest follow in queue order.
function stepFull(prev,d){
  const sch=new Set(scheduled(d)),Q=weekQueue(wkKey(d)),cyc=Q.filter(x=>sch.has(x)),n=cyc.length;if(!n)return[];
  let a=prev[0];
  if(!sch.has(a)){const i=Q.indexOf(a);a=null;if(i>=0)for(let k=1;k<=Q.length;k++){const x=Q[(i+k)%Q.length];if(sch.has(x)){a=x;break}}}
  if(a==null)return cyc;
  const pos=buildPositions(n,dayRoles(d)),lw=lastWorking(pos),t=lw<0?n-1:lw;
  return rotate(cyc,cyc.indexOf(a)-t);
}
// Everyone scheduled for a working day, in first-slot order (before sick leave is taken out).
function dayFull(d){
  const k='f'+dkey(d);if(cache.has(k))return cache.get(k);
  const todo=[];let x=d,base;
  for(let guard=0;;guard++){
    const kk='f'+dkey(x);if(cache.has(kk)){base=cache.get(kk);break}
    if(!isNew(x)){base=oldFull(x);cache.set(kk,base);break}
    const p=prevWorkDay(x);
    if(!p||isReset(x)||guard>4000){const sch=new Set(scheduled(x));base=weekQueue(wkKey(x)).filter(q=>sch.has(q));cache.set(kk,base);break}
    todo.push(x);x=p;
  }
  while(todo.length){const y=todo.pop();base=stepFull(base,y);cache.set('f'+dkey(y),base)}
  return cache.get(k);
}
// The week's Monday order including people who are off that day (Settings list).
function weekOrder(wk){const days=weekDays(wk),Q=weekQueue(wk);if(!days.length)return Q;const f=dayFull(days[0]);const i=f.length?Q.indexOf(f[0]):0;return rotate(Q,Math.max(0,i))}
function buildSlots(s,e,n,mode){
  if(e<=s||!n)return[];const out=[];
  if(mode==='auto'){let prev=s;for(let k=1;k<=n;k++){const b=k===n?e:s+Math.round(k*(e-s)/n/5)*5;if(b>prev){out.push({start:prev,end:b});prev=b}}return out}
  const L=Math.max(5,+mode||30);for(let t=s;t<e;t+=L)out.push({start:t,end:Math.min(e,t+L)});return out;
}
function dayRoster(date){
  const key=dkey(date),ck='d'+key;if(cache.has(ck))return cache.get(ck);
  const c=C();let res;
  if(!staff().length)res={key,empty:true};
  else if(!isWorkDay(date))res={key,off:true};
  else{
    const full=dayFull(date),dayOff=dayOffStaff(date);
    const absent=((S.absences[key]||{}).names||[]).filter(x=>full.includes(x));
    const order=full.filter(x=>!absent.includes(x)),positions=buildPositions(order.length,dayRoles(date));
    // Sick leave can push yesterday's Greeter onto Break in the first slot: swap them with whoever has the last working role.
    if(isNew(date)&&order.length>1){const pd=prevWorkDay(date);if(pd){const pa=(S.absences[dkey(pd)]||{}).names||[],y=dayFull(pd).find(x=>!pa.includes(x)),iy=order.indexOf(y);
      if(iy>0&&positions[iy].brk){const t=lastWorking(positions);if(t>0)[order[iy],order[t]]=[order[t],order[iy]]}}}
    const shifts=(c.shifts||[]).map(sh=>({...sh,slots:buildSlots(parseHM(sh.start),parseHM(sh.end),order.length,c.slotMode).map((sl,i)=>({...sl,cells:positions.map((_,j)=>order[(i+j)%order.length])}))}));
    res={key,full,order,absent,dayOff,positions,shifts};
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
  normName, isStandby, rolesAll, rulesFrom, isNew, satRule, satApplies, dayOffStaff, dayRoles, isWorkDay, prevWorkDay, weekDays, scheduled, hasWheel, weekQueue, wheelForbids, lastWorking, dayFull, weekOrder };
