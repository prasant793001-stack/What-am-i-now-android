// Roster engine: works out who does which role and when.
// Shared by the website (index.html) and the WhatsApp bot, so both always agree.
// Pure JavaScript, no browser or Node APIs.
const S={cfg:null,absences:{},wheels:{}};
let cache=new Map();
const DAYN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DEFAULTS={roles:[{name:'Greeter'},{name:'SAS1'},{name:'SAS2'},{name:'SAS3'},{name:'GA'},{name:'TAB1'},{name:'TAB2'},{name:'TAB3'},{name:'Break',brk:true}],
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
function normalize(order){const s=staff();const out=[...new Set(order)].filter(x=>s.includes(x));for(const x of s)if(!out.includes(x))out.push(x);return out}
function baseOrder(wk){
  const ck='b'+wk;if(cache.has(ck))return cache.get(ck);
  const c=C(),anchor=c.anchorWeek||wkKey(new Date()),wd=(c.workDays||[]).length||7;let res;
  if(wk===anchor)res=normalize(staff());
  else if(wk<anchor)res=rotate(baseOrder(dkey(addDays(fromKey(wk),7))),-wd);
  else{const prev=dkey(addDays(fromKey(wk),-7));const a=cleanAssign(S.wheels[wk]);
    res=Object.keys(a).length?wheelOrder(wk,baseOrder(prev)):rotate(baseOrder(prev),wd)}
  cache.set(ck,res);return res;
}
function cleanAssign(w){const s=staff(),n=s.length,out={},used=new Set();for(const [p,pos] of Object.entries((w&&w.assign)||{})){if(s.includes(p)&&Number.isInteger(pos)&&pos>=0&&pos<n&&!used.has(pos)){out[p]=pos;used.add(pos)}}return out}
function forbidsFor(prev){const f={};if(prev[0])f[prev[0]]=new Set([0]);if(prev[1])(f[prev[1]]=f[prev[1]]||new Set()).add(1);return f}
function match(people,free,bad){const res=[],used=new Set();const go=k=>{if(k===people.length)return true;for(const i of free){if(used.has(i)||bad(people[k],i))continue;used.add(i);res[k]=i;if(go(k+1))return true;used.delete(i)}return false};return go(0)?res.slice():null}
function wheelOrder(wk,prev){
  const s=staff(),n=s.length,a=cleanAssign(S.wheels[wk]),forb=forbidsFor(prev),order=Array(n).fill(null);
  for(const [p,pos] of Object.entries(a))order[pos]=p;
  const r=rng(hash('wheel'+wk));
  const people=shuffle(s.filter(p=>!(p in a)),r),free=shuffle([...Array(n).keys()].filter(i=>order[i]==null),r);
  const sol=match(people,free,(p,i)=>forb[p]&&forb[p].has(i))||match(people,free,()=>false)||[];
  people.forEach((p,k)=>order[sol[k]]=p);return order;
}
function buildPositions(n){
  const roles=(C().roles||[]).map(r=>({name:r.name,brk:!!r.brk}));if(!n)return[];let pos=roles.slice();
  if(n>pos.length){const bn=(pos.find(r=>r.brk)||{}).name||'Standby';let k=2;while(pos.length<n)pos.push({name:bn+' '+k++,brk:true})}
  else while(pos.length>n){let i=-1;for(let j=pos.length-1;j>=0;j--)if(!pos[j].brk){i=j;break}pos.splice(i<0?pos.length-1:i,1)}
  return pos;
}
function buildSlots(s,e,n,mode){
  if(e<=s||!n)return[];const out=[];
  if(mode==='auto'){let prev=s;for(let k=1;k<=n;k++){const b=k===n?e:s+Math.round(k*(e-s)/n/5)*5;if(b>prev){out.push({start:prev,end:b});prev=b}}return out}
  const L=Math.max(5,+mode||30);for(let t=s;t<e;t+=L)out.push({start:t,end:Math.min(e,t+L)});return out;
}
function dayRoster(date){
  const key=dkey(date),ck='d'+key;if(cache.has(ck))return cache.get(ck);
  const c=C(),wd=c.workDays||[];let res;
  if(!staff().length)res={key,empty:true};
  else if(!wd.includes(date.getDay()))res={key,off:true};
  else{
    const mon=monday(date);let idx=0;for(let i=0;i<(date.getDay()+6)%7;i++)if(wd.includes(addDays(mon,i).getDay()))idx++;
    const full=rotate(baseOrder(dkey(mon)),idx);
    const absent=((S.absences[key]||{}).names||[]).filter(x=>staff().includes(x));
    const order=full.filter(x=>!absent.includes(x)),positions=buildPositions(order.length);
    const shifts=(c.shifts||[]).map(sh=>({...sh,slots:buildSlots(parseHM(sh.start),parseHM(sh.end),order.length,c.slotMode).map((sl,i)=>({...sl,cells:positions.map((_,j)=>order[(i+j)%order.length])}))}));
    res={key,full,order,absent,positions,shifts};
  }
  cache.set(ck,res);return res;
}
function allSlots(r){const out=[];(r.shifts||[]).forEach(sh=>sh.slots.forEach(sl=>out.push({...sl,shift:sh.name})));return out.sort((a,b)=>a.start-b.start)}
function roleOf(r,slot,name){const i=slot.cells.indexOf(name);return i<0?null:r.positions[i]}
function myItems(r,who,t){const items=[];if(!r.shifts||(r.absent||[]).includes(who))return items;for(const sl of allSlots(r)){const role=roleOf(r,sl,who);if(!role)continue;items.push({sl,role,cur:sl.start<=t&&t<sl.end,past:sl.end<=t})}return items}

export { DAYN, MON, DEFAULTS, sod, addDays, dkey, fromKey, monday, wkKey, parseHM, fmtT, fmtRange, fmtDay, fmtCd, hash, rng, shuffle, rotate, pkey, C, staff, setData, normalize, baseOrder, cleanAssign, forbidsFor, match, wheelOrder, buildPositions, buildSlots, dayRoster, allSlots, roleOf, myItems };
