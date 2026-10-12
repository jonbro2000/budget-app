'use strict';
const KEY='budget-app-v1';
const DEFCATS=['Housing','Utilities','Phone & Internet','Insurance','Groceries','Transport','Dog (Budzy)','Subscriptions','Leisure','Health','Savings','Wages/Income','Other'];
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const gbp=n=>(n<0?'-':'')+'£'+Math.abs(n).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
const uid=()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4);
const r2=n=>Math.round(n*100)/100;
const mkey=(y,m)=>y+'-'+String(m+1).padStart(2,'0');
const curMonth=()=>{const d=new Date();return mkey(d.getFullYear(),d.getMonth())};
const addM=(k,n)=>{let[y,m]=k.split('-').map(Number);m=m-1+n;y+=Math.floor(m/12);m=((m%12)+12)%12;return mkey(y,m)};
const mlabel=k=>{const[y,m]=k.split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'})};
const mshort=k=>{const[y,m]=k.split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('en-GB',{month:'short'})+" '"+String(y).slice(2)};
const dim=k=>{const[y,m]=k.split('-').map(Number);return new Date(y,m,0).getDate()};
const cmp=(a,b)=>a<b?-1:a>b?1:0;

const DV=3;
function seedAccounts(op){return[{id:'a1',name:'Current Account 1',type:'current',opening:r2(op||0)},{id:'a2',name:'Current Account 2',type:'current',opening:0},{id:'a3',name:'Credit Card',type:'card',opening:0}]}
function blank(){return{version:DV,startMonth:curMonth(),accounts:seedAccounts(0),categories:[],recurring:[],months:{},plans:{}}}
function migrate(d){ // upgrade any older data shape to current version
  d=Object.assign({categories:[],recurring:[],months:{},plans:{}},d);
  if(!d.startMonth)d.startMonth=curMonth();
  if(!(d.version>=2)){
    if(!Array.isArray(d.accounts)||!d.accounts.length)d.accounts=seedAccounts(+d.opening||0);
    delete d.opening;
  }
  const ids=d.accounts.map(a=>a.id),def=ids[0];
  const fix=i=>{if(!ids.includes(i.account))i.account=def;if(i.type==='transfer'){if(!ids.includes(i.to)||i.to===i.account)i.to=ids.find(x=>x!==i.account);i.cat='Transfer'}else delete i.to};
  d.recurring.forEach(fix);Object.values(d.months).forEach(m=>(m.items||(m.items=[])).forEach(fix));
  if(!(d.version>=3)){ // future months that were 'started' but nothing ticked -> sparse overrides
    const now=curMonth();
    Object.keys(d.months).forEach(k=>{const m=d.months[k];if(cmp(k,now)<=0||m.items.some(i=>i.paid))return;
      const p={ov:{},extra:[]};
      d.recurring.forEach(r=>{const it=m.items.find(i=>i.rid===r.id);if(!it){p.ov[r.id]={skip:true};return}
        const o={};['name','type','amount','day','cat','account','to'].forEach(f=>{if(it[f]!==undefined&&it[f]!==r[f]&&!(f==='day'&&it.day===Math.min(r.day,dim(k))))o[f]=it[f]});
        if(Object.keys(o).length)p.ov[r.id]=o});
      m.items.filter(i=>!i.rid||!d.recurring.some(r=>r.id===i.rid)).forEach(i=>{const e={...i,rid:null};delete e.paid;p.extra.push(e)});
      if(Object.keys(p.ov).length||p.extra.length)d.plans[k]=p;delete d.months[k]});
  }
  Object.values(d.plans).forEach(p=>{p.ov=p.ov||{};p.extra=p.extra||[];p.extra.forEach(fix)});
  d.version=DV;return d;
}
function load(){try{const s=JSON.parse(localStorage.getItem(KEY));if(s&&s.months)return migrate(s)}catch(e){}return blank()}
let S=load();save();
function save(){MEMO={};localStorage.setItem(KEY,JSON.stringify(S))}
var MEMO={};
const cats=()=>DEFCATS.concat(S.categories);
const acc=id=>S.accounts.find(a=>a.id===id);
const aname=id=>(acc(id)||{name:'?'}).name;
const isCard=id=>(acc(id)||{}).type==='card';
const fmtBal=(id,v)=>isCard(id)?(v<=0?gbp(-v)+' owed':gbp(v)+' in credit'):gbp(v);
let tab='month',view=curMonth(),mFilter='all';
const TODAY0=curMonth();
if(cmp(view,S.startMonth)<0)view=S.startMonth;

// ---- model
function itemsOf(k){ // real items if set up, else projection from recurring
  const m=S.months[k];
  if(m)return m.items;
  const p=S.plans[k]||{ov:{},extra:[]},out=[];
  S.recurring.forEach(r=>{const o=p.ov[r.id]||{};if(o.skip)return;
    const it={id:'p'+r.id,rid:r.id,name:r.name,type:r.type,amount:upAmt(r,k),day:Math.min(r.day,dim(k)),cat:r.cat,account:r.account,to:r.to,paid:false,projected:true};
    Object.assign(it,o);it.day=Math.min(it.day,dim(k));if(Object.keys(o).length)it.adjusted=true;out.push(it)});
  p.extra.forEach(e=>out.push({...e,id:'e'+e.id,paid:false,projected:true,extra:true}));
  return out;
}
// annual uplift: amount rises by uplift% each full year from upFrom (projections only)
function upAmt(r,k){if(!r.uplift||!r.upFrom||cmp(k,r.upFrom)<0)return r.amount;const[y1,m1]=r.upFrom.split('-').map(Number),[y2,m2]=k.split('-').map(Number);const yrs=Math.floor(((y2-y1)*12+m2-m1)/12)+1;return r2(r.amount*Math.pow(1+r.uplift/100,yrs))}
const status=k=>{const c=cmp(k,curMonth());return c<0?'past':c>0?'future':'current'};
const isFut=k=>status(k)==='future';
const isTr=i=>i.type==='transfer';
const effect=(i,a)=>i.type==='income'?(i.account===a?i.amount:0):i.type==='outgoing'?(i.account===a?-i.amount:0):(i.account===a?-i.amount:0)+(i.to===a?i.amount:0);
const touches=(i,a)=>i.account===a||(isTr(i)&&i.to===a);
const sumT=(items,t,a)=>r2(items.filter(i=>i.type===t&&(!a||i.account===a)).reduce((s,i)=>s+i.amount,0));
const delta=(items,a)=>r2(items.reduce((s,i)=>s+effect(i,a),0));
function opening(k,a){
  if(cmp(k,S.startMonth)<=0)return(acc(a)||{opening:0}).opening;
  return closing(addM(k,-1),a);
}
function closing(k,a){const mk='c'+k+a;if(mk in MEMO)return MEMO[mk];return MEMO[mk]=r2(opening(k,a)+delta(itemsOf(k),a))}
function cleared(k,a){return r2(opening(k,a)+delta(itemsOf(k).filter(i=>i.paid),a))}
const total=(f,k)=>r2(S.accounts.reduce((s,a)=>s+f(k,a.id),0));

// ---- modal
function modal(html){$('#sheet').innerHTML=html;$('#modal').hidden=false}
function closeModal(){$('#modal').hidden=true;$('#sheet').innerHTML=''}
$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});
const catOpts=sel=>cats().map(c=>`<option ${c===sel?'selected':''}>${esc(c)}</option>`).join('');
const accOpts=(sel,ex)=>S.accounts.filter(a=>a.id!==ex).map(a=>`<option value="${a.id}" ${a.id===sel?'selected':''}>${esc(a.name)}${a.type==='card'?' (card)':''}</option>`).join('');
const num=v=>{const n=parseFloat(String(v).replace(/[£,\s]/g,''));return isFinite(n)?r2(Math.abs(n)):NaN};
// shared entry form (name/type/amount/day/account/to/category)
function entryForm(it,p,amtLabel){
  const t=it.type;
  return `<label>Name</label><input id="${p}name" value="${esc(it.name)}">
  <label>Type</label><div class="seg" id="${p}seg">${[['outgoing','Outgoing'],['income','Income'],['transfer','Transfer / card payment']].map(([v,l])=>`<button data-t="${v}" class="${t===v?'on':''}">${l}</button>`).join('')}</div>
  <label>${amtLabel||'Amount (£)'}</label><input id="${p}amt" inputmode="decimal" value="${it.amount}">
  <label>Day of month</label><input id="${p}day" type="number" min="1" max="31" inputmode="numeric" value="${it.day}">
  <label id="${p}accl">${t==='transfer'?'From account':t==='income'?'Paid into account':'Paid from account'}</label><select id="${p}acc">${accOpts(it.account||S.accounts[0].id)}</select>
  <div id="${p}tow" ${t==='transfer'?'':'hidden'}><label>To account</label><select id="${p}to">${accOpts(it.to||(S.accounts.find(a=>a.type==='card')||S.accounts[1]||{}).id)}</select></div>
  <div id="${p}catw" ${t==='transfer'?'hidden':''}><label>Category</label><select id="${p}cat">${catOpts(it.cat==='Transfer'?'Other':it.cat)}</select></div>`;
}
function bindForm(p,type0){
  let type=type0;
  const upd=()=>{$('#'+p+'tow').hidden=type!=='transfer';$('#'+p+'catw').hidden=type==='transfer';$('#'+p+'accl').textContent=type==='transfer'?'From account':type==='income'?'Paid into account':'Paid from account'};
  document.querySelectorAll('#'+p+'seg button').forEach(b=>b.onclick=()=>{type=b.dataset.t;document.querySelectorAll('#'+p+'seg button').forEach(x=>x.classList.toggle('on',x===b));upd()});
  return()=>{const amount=num($('#'+p+'amt').value),name=$('#'+p+'name').value.trim(),day=Math.min(31,Math.max(1,parseInt($('#'+p+'day').value)||1)),account=$('#'+p+'acc').value;
    if(!name||isNaN(amount)){alert('Please enter a name and amount.');return null}
    const o={name,type,amount,day,account};
    if(type==='transfer'){o.to=$('#'+p+'to').value;o.cat='Transfer';if(o.to===account){alert('From and To accounts must differ.');return null}}
    else{o.cat=$('#'+p+'cat').value;o.to=undefined}
    return o};
}

// ---- render
function render(){
  MEMO={};
  document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab));
  $('#top').innerHTML='<h1>Budget</h1>';
  if(mFilter!=='all'&&!acc(mFilter))mFilter='all';
  ({month:rMonth,forecast:rForecast,recurring:rRecurring,analysis:rAnalysis,settings:rSettings})[tab]();
}
document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;render();scrollTo(0,0)});
const ord=d=>d%10==1&&d!=11?'st':d%10==2&&d!=12?'nd':d%10==3&&d!=13?'rd':'th';
const sortI=(a,b)=>a.day-b.day||a.name.localeCompare(b.name);

function entryRow(i,a,setup){
  const fut=isFut(view);
  const e=effect(i,a),tr=isTr(i);
  const sub=tr?(i.account===a?'→ '+esc(aname(i.to)):'← '+esc(aname(i.account)))+' · transfer':esc(i.cat);
  return `<div class="row ${i.paid?'done':''}">
   ${fut?'':`<input type="checkbox" class="chk" data-id="${i.id}" ${i.paid?'checked':''} ${setup?'':'disabled'} aria-label="paid/received">`}
   <div class="info" data-edit="${i.id}"><div class="nm">${tr?'⇄ ':''}${esc(i.name)}</div><div class="sub">${i.day}${ord(i.day)} · ${sub}${i.rid?'':' · one-off'}${i.adjusted?' <span class="tag adj">adjusted</span>':''}</div></div>
   <div class="amt ${tr?'trf':e>=0?'inc':'out'}" data-edit="${i.id}">${e>=0?'+':'-'}${gbp(Math.abs(e))}</div></div>`;
}
function rMonth(){
  const k=view,setup=!!S.months[k],fut=isFut(k),st=status(k),items=itemsOf(k).slice().sort(sortI);
  const shown=mFilter==='all'?S.accounts:S.accounts.filter(a=>a.id===mFilter);
  let h=`<div class="card nav"><button class="sm" id="prev" ${cmp(k,S.startMonth)<=0?'disabled':''}>‹</button><b>${mlabel(k)}<br><span class="st st-${st}">${st==='past'?'Past':st==='current'?'Current month':'Future · projection'}</span></b><button class="sm" id="next">›</button></div>`;
  if(k!==curMonth())h+=`<div class="btns" style="margin:-4px 0 12px"><button id="today">Jump to current month</button></div>`;
  h+=`<select id="mf" aria-label="Account filter"><option value="all">All accounts (grouped)</option>${S.accounts.map(a=>`<option value="${a.id}" ${a.id===mFilter?'selected':''}>${esc(a.name)}</option>`).join('')}</select><div style="height:12px"></div>`;
  if(fut)h+=`<div class="card"><b>Projection.</b><div class="mut">Built from your recurring items plus any changes you make here. Tap an item to adjust or skip it for this month only, or add a one-off. Future default changes still flow in unless adjusted.</div></div>`;
  else if(!setup)h+=`<div class="card"><b>${mlabel(k)} isn't checked in yet.</b><div class="mut">Showing projection${S.plans[k]?' (with your planned changes)':''}.</div><div class="btns"><button class="pri" id="chk">Start month check-in</button></div></div>`;
  if(mFilter==='all'){
    h+=`<div class="card"><h2>All accounts</h2><table><tr><th>Account</th><th>Opening</th><th>Closing</th>${fut?'':'<th>Cleared</th>'}</tr>`+
     S.accounts.map(a=>`<tr><td>${esc(a.name)}</td><td>${fmtBal(a.id,opening(k,a.id))}</td><td><b>${fmtBal(a.id,closing(k,a.id))}</b></td>${fut?'':`<td>${fmtBal(a.id,cleared(k,a.id))}</td>`}</tr>`).join('')+
     `<tr><td><b>Combined</b></td><td><b>${gbp(total(opening,k))}</b></td><td><b>${gbp(total(closing,k))}</b></td>${fut?'':`<td><b>${gbp(total(cleared,k))}</b></td>`}</tr></table>
     <div class="sub mut" style="font-size:13px">Combined = current accounts minus card balances owed. Closing is projected; cleared counts ticked items only.</div></div>`;
  }
  shown.forEach(a=>{
    const its=items.filter(i=>touches(i,a.id)),card=a.type==='card';
    const inc=r2(its.reduce((s,i)=>s+Math.max(0,effect(i,a.id)),0)),out=r2(its.reduce((s,i)=>s+Math.max(0,-effect(i,a.id)),0));
    const cl=closing(k,a.id);
    h+=`<div class="card"><h2>${esc(a.name)}${card?' <span class="tag">card</span>':''}</h2><div class="sum">
     <span>Opening ${card?'balance':'balance'}</span><span class="amt">${fmtBal(a.id,opening(k,a.id))}</span>
     <span>${card?'Payments / refunds in':'Money in'}</span><span class="amt inc">${gbp(inc)}</span><span>${card?'Card spending':'Money out'}</span><span class="amt out">${gbp(out)}</span>
     <span><b>Closing (projected)</b></span><span class="big ${card&&cl<0?'out':''}">${fmtBal(a.id,cl)}</span>
     ${fut?'':`<span><b>Cleared so far</b></span><span class="amt">${fmtBal(a.id,cleared(k,a.id))}</span>`}</div>
     ${card&&cl<0?`<div class="btns"><button id="po_${a.id}" data-po="${a.id}">Pay off card balance (${gbp(-cl)})</button></div>`:''}
     <div style="margin-top:8px">${its.map(i=>entryRow(i,a.id,setup)).join('')||'<div class="empty">No entries.</div>'}</div></div>`;
  });
  h+=`<button class="pri fab" id="addone">+ Add one-off item</button>`;
  $('#main').innerHTML=h;
  $('#prev').onclick=()=>{view=addM(k,-1);render();maybeCheckin()};
  $('#next').onclick=()=>{view=addM(k,1);render();maybeCheckin()};
  if($('#today'))$('#today').onclick=()=>{view=curMonth();render();maybeCheckin()};
  $('#mf').onchange=()=>{mFilter=$('#mf').value;render()};
  if($('#chk'))$('#chk').onclick=()=>startCheckin(k);
  $('#addone').onclick=()=>editEntry(null);
  document.querySelectorAll('.chk').forEach(c=>c.onchange=()=>{const it=S.months[k].items.find(x=>x.id===c.dataset.id);it.paid=c.checked;save();render()});
  document.querySelectorAll('[data-edit]').forEach(e=>e.onclick=()=>editEntry(e.dataset.edit));
  document.querySelectorAll('[data-po]').forEach(b=>b.onclick=()=>payOff(k,b.dataset.po));
}
let asked={};
function maybeCheckin(){ if(!isFut(view)&&!S.months[view]&&S.recurring.length&&!asked[view]){asked[view]=1;startCheckin(view)} }

// edit/add entry in month (materialises the month if needed)
function ensureMonth(k){if(!S.months[k]){S.months[k]={items:itemsOf(k).map(i=>{const c={...i};delete c.projected;delete c.adjusted;if(c.extra){c.rid=null;delete c.extra}c.id=uid();return c})};delete S.plans[k]}return S.months[k]}
function editEntry(id,preset){
  const k=view;let it=null;
  if(id)it=itemsOf(k).find(x=>x.id===id);
  const isNew=!it;it=it||Object.assign({name:'',type:'outgoing',amount:'',day:1,cat:'Other',paid:false,account:mFilter!=='all'?mFilter:S.accounts[0].id},preset||{});
  modal(`<h2>${isNew?'Add one-off item':'Edit entry'} · ${mshort(k)}</h2>
  ${entryForm(it,'f_')}
  ${it.rid?`<label class="ck"><input type="checkbox" id="f_def"> Also update default amount going forward</label>`:''}
  ${isFut(k)?`<div class="sub mut">${it.rid?'Changes apply to '+mlabel(k)+' only.':''}</div>${it.adjusted?'<div class="btns"><button id="rst">Reset to default</button></div>':''}`:`<label class="ck"><input type="checkbox" id="f_paid" ${it.paid?'checked':''}> Paid / received</label>`}
  <div class="btns"><button id="c">Cancel</button><button class="pri" id="s">Save</button></div>
  ${isNew?'':`<div class="btns"><button class="danger" id="d">${isFut(k)&&it.rid?'Skip this month':'Delete from this month'}</button></div>`}`);
  const get=bindForm('f_',it.type);
  $('#c').onclick=closeModal;
  if(isFut(k))return planEdit(k,it,isNew,get);
  $('#s').onclick=()=>{
    const o=get();if(!o)return;
    const m=ensureMonth(k);
    let t;
    if(isNew){t={id:uid(),rid:null};m.items.push(t)}
    else t=m.items.find(x=>x.id===id)||m.items.find(x=>it.rid&&x.rid===it.rid);
    Object.assign(t,o,{paid:$('#f_paid').checked});if(t.to===undefined)delete t.to;
    if(t.rid&&$('#f_def')&&$('#f_def').checked){const r=S.recurring.find(x=>x.id===t.rid);if(r)r.amount=o.amount}
    save();closeModal();render();
  };
  if($('#d'))$('#d').onclick=()=>{if(!confirm('Delete this entry from '+mlabel(k)+'?'))return;const m=ensureMonth(k);m.items=m.items.filter(x=>x.id!==id&&!(it.rid&&x.rid===it.rid&&id.startsWith('p')));save();closeModal();render()};
}
const plan=k=>S.plans[k]||(S.plans[k]={ov:{},extra:[]});
function tidyPlan(k){const p=S.plans[k];if(p&&!Object.keys(p.ov).length&&!p.extra.length)delete S.plans[k]}
function planEdit(k,it,isNew,get){
  $('#s').onclick=()=>{const o=get();if(!o)return;const p=plan(k);
    if(isNew){const e={id:uid(),rid:null,...o};if(e.to===undefined)delete e.to;p.extra.push(e)}
    else if(it.extra){const e=p.extra.find(x=>'e'+x.id===it.id);Object.assign(e,o);if(e.to===undefined)delete e.to}
    else{const r=S.recurring.find(x=>x.id===it.rid),ov={};
      ['name','type','amount','day','cat','account','to'].forEach(f=>{const base=f==='amount'?upAmt(r,k):f==='day'?Math.min(r.day,dim(k)):r[f];if(o[f]!==undefined&&o[f]!==base)ov[f]=o[f]});
      if($('#f_def')&&$('#f_def').checked){r.amount=o.amount;delete ov.amount}
      if(Object.keys(ov).length)p.ov[r.id]=ov;else delete p.ov[r.id]}
    tidyPlan(k);save();closeModal();render()};
  if($('#rst'))$('#rst').onclick=()=>{delete plan(k).ov[it.rid];tidyPlan(k);save();closeModal();render()};
  if($('#d'))$('#d').onclick=()=>{const p=plan(k);if(it.extra)p.extra=p.extra.filter(x=>'e'+x.id!==it.id);else p.ov[it.rid]={skip:true};tidyPlan(k);save();closeModal();render()};
}
function payOff(k,cardId){
  const owed=-closing(k,cardId);if(!(owed>0))return;
  const from=(S.accounts.find(a=>a.type!=='card')||S.accounts.find(a=>a.id!==cardId)).id;
  editEntry(null,{name:'Pay off '+aname(cardId),type:'transfer',amount:r2(owed),day:dim(k),account:from,to:cardId,cat:'Transfer'});
}

// ---- check-in
function startCheckin(k){
  const prev=addM(k,-1),pm=S.months[prev],ai=id=>S.accounts.findIndex(a=>a.id===id);
  const proj=itemsOf(k).filter(x=>!x.extra);
  const queue=proj.slice().sort((a,b)=>ai(a.account)-ai(b.account)||a.day-b.day).map(pi=>{
    const r0=S.recurring.find(x=>x.id===pi.rid),p=pm&&pm.items.find(x=>x.rid===pi.rid);
    const r=Object.assign(Object.create(null),{...r0,...pi,id:r0.id,day:pi.day});r.base=r0;
    return{r,last:pi.adjusted&&'amount' in ((S.plans[k]||{ov:{}}).ov[pi.rid]||{})?pi.amount:p?p.amount:pi.amount};
  });
  const out=(S.plans[k]?S.plans[k].extra:[]).map(e=>({...e,id:uid(),rid:null,paid:false}));let i=0;
  function step(){
    if(i>=queue.length)return oneoffs();
    const q=queue[i],r=q.r,tr=r.type==='transfer';
    modal(`<div class="mut">${mlabel(k)} · item ${i+1} of ${queue.length}</div>
    <div class="acchdr">${esc(aname(r.account))}</div>
    <div class="big-q">${esc(r.name)}</div><div class="mut">${tr?'Transfer → '+esc(aname(r.to)):(r.type==='income'?'Income':'Outgoing')+' · '+esc(r.cat)} · day ${r.day}</div>
    <div class="big-q">Same as last month? <span class="amt ${tr?'trf':r.type==='income'?'inc':'out'}">${gbp(q.last)}</span></div>
    <div id="ex"></div>
    <div class="btns"><button class="pri" id="y">Yes</button><button id="n">No</button></div>
    <div class="btns"><button id="skip">Skip this month</button><button id="x">Cancel check-in</button></div>`);
    const add=a=>{const o={id:uid(),rid:r.id,name:r.name,type:r.type,amount:a,day:Math.min(r.day,dim(k)),cat:r.cat,account:r.account,paid:false};if(tr)o.to=r.to;out.push(o);i++;step()};
    $('#y').onclick=()=>add(q.last);
    $('#skip').onclick=()=>{i++;step()};
    $('#x').onclick=closeModal;
    $('#n').onclick=()=>{
      $('#ex').innerHTML=`<label>New amount (£)</label><input id="na" inputmode="decimal" autofocus value="${q.last}">
      <label class="ck"><input type="checkbox" id="nd"> Also update default going forward</label>
      <div class="btns"><button class="pri" id="ok">Next</button></div>`;
      $('#na').focus();
      $('#ok').onclick=()=>{const a=num($('#na').value);if(isNaN(a))return alert('Enter an amount');
        if($('#nd').checked)r.base.amount=a;add(a)};
    };
  }
  let lastAcc=S.accounts[0].id;
  function oneoffs(){
    const blankIt={name:'',type:'outgoing',amount:'',day:1,cat:'Other',account:lastAcc};
    modal(`<h2>One-off items · ${mlabel(k)}</h2>
    ${out.filter(x=>!x.rid).map(x=>`<div class="row"><div class="info"><div class="nm">${esc(x.name)}</div><div class="sub">${esc(aname(x.account))}${isTr(x)?' → '+esc(aname(x.to)):''}</div></div><div class="amt">${gbp(x.amount)}</div></div>`).join('')}
    ${entryForm(blankIt,'o_')}
    <div class="btns"><button id="oa">+ Add item</button><button class="pri" id="fin">Finish</button></div>`);
    const get=bindForm('o_','outgoing');
    const push=o=>{lastAcc=o.account;const e={id:uid(),rid:null,...o,paid:false};if(e.to===undefined)delete e.to;out.push(e)};
    $('#oa').onclick=()=>{const o=get();if(!o)return;push(o);oneoffs()};
    $('#fin').onclick=()=>{ // add pending if filled
      if($('#o_name').value.trim()||$('#o_amt').value.trim()){const o=get();if(!o)return;push(o)}
      S.months[k]={items:out};delete S.plans[k];save();closeModal();render()};
  }
  step();
}

// ---- recurring
function rRecurring(){
  let h=`<button class="pri fab" id="addr">+ Add recurring item</button>`;
  if(!S.recurring.length)h+=`<div class="card"><div class="empty">No recurring items yet. Add your wages, bills, card payoff and so on.</div></div>`;
  S.accounts.forEach(a=>{
    const list=S.recurring.filter(r=>r.account===a.id).sort((x,y)=>x.day-y.day);if(!list.length)return;
    h+=`<div class="card"><h2>${esc(a.name)}</h2>`+list.map(r=>`<div class="row" data-r="${r.id}"><div class="info"><div class="nm">${r.type==='transfer'?'⇄ ':''}${esc(r.name)}</div><div class="sub">Day ${r.day} · ${r.type==='transfer'?'transfer → '+esc(aname(r.to)):esc(r.cat)+' · '+r.type}${r.uplift?' · +'+r.uplift+'%/yr':''}</div></div><div class="amt ${r.type==='transfer'?'trf':r.type==='income'?'inc':'out'}">${gbp(r.amount)}</div></div>`).join('')+'</div>';
  });
  $('#main').innerHTML=h;
  $('#addr').onclick=()=>editRec(null);
  document.querySelectorAll('[data-r]').forEach(e=>e.onclick=()=>editRec(e.dataset.r));
}
function editRec(id){
  const isNew=!id,r=isNew?{name:'',type:'outgoing',amount:'',day:1,cat:'Other',account:S.accounts[0].id}:S.recurring.find(x=>x.id===id);
  modal(`<h2>${isNew?'Add':'Edit'} recurring item</h2>
  ${entryForm(r,'f_','Default amount (£)')}
  <label>Annual rise % (optional, projections only)</label><input id="f_up" inputmode="decimal" value="${r.uplift||''}" placeholder="e.g. 5">
  <label>Rises each year from</label><input type="month" id="f_upf" value="${r.upFrom||addM(curMonth(),1)}">
  <div class="btns"><button id="c">Cancel</button><button class="pri" id="s">Save</button></div>
  ${isNew?'':'<div class="btns"><button class="danger" id="d">Delete</button></div><div class="sub mut">Deleting keeps entries already in past/set-up months.</div>'}`);
  const get=bindForm('f_',r.type);
  $('#c').onclick=closeModal;
  $('#s').onclick=()=>{const o=get();if(!o)return;
    const up=parseFloat($('#f_up').value);if(isFinite(up)&&up!==0){o.uplift=r2(up);o.upFrom=$('#f_upf').value||addM(curMonth(),1)}else{o.uplift=undefined;o.upFrom=undefined}
    const cl=x=>{['to','uplift','upFrom'].forEach(f=>{if(x[f]===undefined)delete x[f]});return x};if(isNew)S.recurring.push(cl({id:uid(),...o}));else cl(Object.assign(r,o))
    save();closeModal();render()};
  if($('#d'))$('#d').onclick=()=>{if(!confirm('Delete "'+r.name+'"?'))return;S.recurring=S.recurring.filter(x=>x.id!==id);save();closeModal();render()};
}

// ---- analysis (transfers always excluded)
let aRange=3,aMonth=curMonth(),aAcc='';
const PAL=['#0f766e','#2563eb','#d97706','#9333ea','#dc2626','#0891b2','#65a30d','#db2777','#ea580c','#4f46e5','#059669','#ca8a04','#64748b','#be123c','#7c3aed'];
function rAnalysis(){
  if(aAcc&&!acc(aAcc))aAcc='';
  const months=[];for(let i=aRange-1;i>=0;i--)months.push(addM(aMonth,-i));
  const tot={};let all=0;
  months.forEach(m=>itemsOf(m).filter(i=>i.type==='outgoing'&&(!aAcc||i.account===aAcc)).forEach(i=>{tot[i.cat]=r2((tot[i.cat]||0)+i.amount);all=r2(all+i.amount)}));
  const rows=Object.entries(tot).sort((a,b)=>b[1]-a[1]);
  const colour=c=>PAL[cats().indexOf(c)%PAL.length]||'#64748b';
  let h=`<div class="card nav"><button class="sm" id="ap">‹</button><b>${mlabel(aMonth)}</b><button class="sm" id="an">›</button></div>
  <select id="aacc" aria-label="Account filter"><option value="">All accounts</option>${S.accounts.map(a=>`<option value="${a.id}" ${a.id===aAcc?'selected':''}>${esc(a.name)}</option>`).join('')}</select>
  <div class="seg">${[1,3,6,12].map(n=>`<button data-n="${n}" class="${n===aRange?'on':''}">${n===1?'This month':'Last '+n}</button>`).join('')}</div>
  <div class="card"><h2>Spending by category</h2><div class="sub mut" style="font-size:13px;margin-bottom:6px">Transfers and card payments are excluded.</div>`;
  if(!rows.length)h+=`<div class="empty">No outgoings in this period.</div>`;
  else{
    h+=donut(rows,all,colour)+`<table><tr><th>Category</th><th>Total</th><th>%</th>${aRange>1?'<th>Avg/mo</th>':''}</tr>`+
    rows.map(([c,v])=>`<tr><td><span class="sw" style="background:${colour(c)}"></span>${esc(c)}</td><td>${gbp(v)}</td><td>${(v/all*100).toFixed(0)}%</td>${aRange>1?`<td>${gbp(v/aRange)}</td>`:''}</tr>`).join('')+
    `<tr><td><b>Total</b></td><td><b>${gbp(all)}</b></td><td></td>${aRange>1?`<td><b>${gbp(all/aRange)}</b></td>`:''}</tr></table>`;
  }
  h+=`</div><div class="card"><h2>Income vs outgoings</h2>${trend(months)}<table><tr><th>Month</th><th>In</th><th>Out</th><th>Net</th></tr>`+
   months.map(m=>{const it=itemsOf(m),a=sumT(it,'income',aAcc),b=sumT(it,'outgoing',aAcc);return`<tr><td>${mshort(m)}</td><td class="inc">${gbp(a)}</td><td class="out">${gbp(b)}</td><td>${gbp(a-b)}</td></tr>`}).join('')+`</table></div>`;
  $('#main').innerHTML=h;
  $('#ap').onclick=()=>{aMonth=addM(aMonth,-1);render()};$('#an').onclick=()=>{aMonth=addM(aMonth,1);render()};
  $('#aacc').onchange=()=>{aAcc=$('#aacc').value;render()};
  document.querySelectorAll('[data-n]').forEach(b=>b.onclick=()=>{aRange=+b.dataset.n;render()});
}
function donut(rows,all,colour){
  const R=70,C=2*Math.PI*R;let off=0,s=`<svg viewBox="0 0 200 200" style="width:100%;max-width:260px;display:block;margin:0 auto 10px"><g transform="rotate(-90 100 100)">`;
  rows.forEach(([c,v])=>{const len=v/all*C;s+=`<circle cx="100" cy="100" r="${R}" fill="none" stroke="${colour(c)}" stroke-width="32" stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-off}"/>`;off+=len});
  return s+`</g><text x="100" y="96" text-anchor="middle" font-size="13" fill="#6b7783">Total</text><text x="100" y="116" text-anchor="middle" font-size="16" font-weight="700">${gbp(all)}</text></svg>`;
}
function trend(months){
  const d=months.map(m=>{const it=itemsOf(m);return[m,sumT(it,'income',aAcc),sumT(it,'outgoing',aAcc)]});
  const mx=Math.max(1,...d.flatMap(x=>[x[1],x[2]])),W=320,H=160,bw=W/d.length;
  let s=`<svg viewBox="0 0 ${W} ${H+22}" style="width:100%;margin-bottom:8px">`;
  d.forEach((x,i)=>{const w=Math.min(18,bw/2-3),cx=i*bw+bw/2,h1=x[1]/mx*H,h2=x[2]/mx*H;
    s+=`<rect x="${cx-w-1}" y="${H-h1}" width="${w}" height="${h1}" fill="#15803d" rx="2"/><rect x="${cx+1}" y="${H-h2}" width="${w}" height="${h2}" fill="#b91c1c" rx="2"/>`;
    if(d.length<=6||i%2==0)s+=`<text x="${cx}" y="${H+15}" text-anchor="middle" font-size="10" fill="#6b7783">${mshort(x[0]).split(' ')[0]}</text>`});
  return s+`</svg><div class="mut" style="font-size:13px"><span class="sw" style="background:#15803d"></span>Income <span class="sw" style="background:#b91c1c;margin-left:10px"></span>Outgoings</div>`;
}

// ---- forecast
let fH=12;
const ACOL=['#2563eb','#d97706','#9333ea','#db2777','#0891b2','#65a30d'];
function rForecast(){
  const now=curMonth(),months=[];for(let i=0;i<fH;i++)months.push(addM(now,i));
  const rows=months.map(k=>{const it=itemsOf(k);const inc=sumT(it,'income'),out=sumT(it,'outgoing');
    const bal={};S.accounts.forEach(a=>bal[a.id]=closing(k,a.id));return{k,inc,out,net:r2(inc-out),bal,tot:total(closing,k)}});
  const low=rows.reduce((m,r)=>r.tot<m.tot?r:m,rows[0]);
  const neg=r=>S.accounts.some(a=>a.type!=='card'&&r.bal[a.id]<0);
  const firstNeg=rows.find(neg);
  const W=340,H=180,P=6,vals=rows.flatMap(r=>[r.tot,...Object.values(r.bal)]),mn=Math.min(0,...vals),mx=Math.max(1,...vals);
  const X=i=>P+i*(W-2*P)/Math.max(1,rows.length-1),Y=v=>P+(mx-v)/(mx-mn||1)*(H-2*P);
  const line=(f,c,w)=>`<polyline fill="none" stroke="${c}" stroke-width="${w}" points="${rows.map((r,i)=>X(i).toFixed(1)+','+Y(f(r)).toFixed(1)).join(' ')}"/>`;
  let svg=`<svg viewBox="0 0 ${W} ${H+18}" style="width:100%"><line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}" stroke="#94a3b8" stroke-dasharray="3 3"/>`;
  S.accounts.forEach((a,j)=>svg+=line(r=>r.bal[a.id],ACOL[j%ACOL.length],1.5));
  svg+=line(r=>r.tot,'#0f766e',3);
  const li=rows.indexOf(low);svg+=`<circle cx="${X(li)}" cy="${Y(low.tot)}" r="4" fill="#b91c1c"/>`;
  rows.forEach((r,i)=>{if(r.k.endsWith('-01')||(i===0&&+r.k.slice(5)<11))svg+=`<text x="${X(i)}" y="${H+14}" font-size="10" text-anchor="${i===0?'start':'middle'}" fill="#6b7783">${mshort(r.k)}</text>`});
  svg+='</svg>';
  const legend=`<div class="mut" style="font-size:13px"><span class="sw" style="background:#0f766e"></span>Combined ${S.accounts.map((a,j)=>`<span class="sw" style="background:${ACOL[j%ACOL.length]};margin-left:8px"></span>${esc(a.name)}`).join(' ')} <span class="sw" style="background:#b91c1c;border-radius:6px;margin-left:8px"></span>Lowest</div>`;
  let h=`<div class="seg">${[[12,'12 months'],[24,'2 years'],[36,'3 years'],[60,'5 years']].map(([n,l])=>`<button data-h="${n}" class="${n===fH?'on':''}">${l}</button>`).join('')}</div>
  <div class="card"><h2>Projected month-end balances</h2>${svg}${legend}
  <div class="sum" style="margin-top:10px"><span>Lowest combined</span><span class="amt ${low.tot<0?'out':''}">${gbp(low.tot)} · ${mshort(low.k)}</span>
  <span>End of horizon</span><span class="amt">${gbp(rows.at(-1).tot)} · ${mshort(rows.at(-1).k)}</span></div>
  ${firstNeg?`<div class="warn">⚠️ A current account goes overdrawn in ${mlabel(firstNeg.k)}.</div>`:''}</div>
  <div class="card"><h2>By month</h2><div class="sub mut" style="font-size:13px">Tap a month to open it. Transfers excluded from in/out. Closing = combined.</div>
  <table class="fc"><tr><th>Month</th><th>In</th><th>Out</th><th>Net</th><th>Closing</th></tr>`;
  let ya={inc:0,out:0};
  rows.forEach((r,i)=>{
    h+=`<tr data-k="${r.k}" class="${neg(r)?'neg':''} ${r===low?'low':''}"><td>${mshort(r.k)}${r.k===now?' •':''}</td><td class="inc">${gbp(r.inc)}</td><td class="out">${gbp(r.out)}</td><td>${gbp(r.net)}</td><td><b>${gbp(r.tot)}</b></td></tr>`;
    ya.inc=r2(ya.inc+r.inc);ya.out=r2(ya.out+r.out);
    const nx=rows[i+1];if(!nx||nx.k.slice(0,4)!==r.k.slice(0,4)){h+=`<tr class="yr"><td>${r.k.slice(0,4)} total</td><td>${gbp(ya.inc)}</td><td>${gbp(ya.out)}</td><td>${gbp(ya.inc-ya.out)}</td><td>${gbp(r.tot)}</td></tr>`;ya={inc:0,out:0}}
  });
  h+=`</table><div class="sub mut" style="font-size:13px;margin-top:6px">Red rows: a current account is below £0. Red border: lowest point.</div></div>
  <div class="card"><h2>Per account (month-end)</h2><div style="overflow-x:auto"><table class="fc"><tr><th>Month</th>${S.accounts.map(a=>`<th>${esc(a.name)}</th>`).join('')}</tr>`+
  rows.map(r=>`<tr data-k="${r.k}"><td>${mshort(r.k)}</td>${S.accounts.map(a=>`<td class="${r.bal[a.id]<0?'out':''}">${fmtBal(a.id,r.bal[a.id])}</td>`).join('')}</tr>`).join('')+`</table></div></div>`;
  $('#main').innerHTML=h;
  document.querySelectorAll('[data-h]').forEach(b=>b.onclick=()=>{fH=+b.dataset.h;render()});
  document.querySelectorAll('tr[data-k]').forEach(t=>t.onclick=()=>{view=t.dataset.k;tab='month';render();scrollTo(0,0);maybeCheckin()});
}

// ---- settings
function rSettings(){
  $('#main').innerHTML=`<div class="card"><h2>Start month</h2><div class="mut">Each account's opening balance applies at the start of this month.</div>
  <label>First month</label><input type="month" id="sm" value="${S.startMonth}"><div class="btns"><button class="pri" id="sv">Save</button></div></div>
  <div class="card"><h2>Accounts</h2>${S.accounts.map(a=>`<div class="row" data-ea="${a.id}"><div class="info"><div class="nm">${esc(a.name)}</div><div class="sub">${a.type==='card'?'Credit card':'Current account'} · opening ${fmtBal(a.id,a.opening)}</div></div><span class="mut">›</span></div>`).join('')}
  <div class="btns"><button id="aa">+ Add account</button></div></div>
  <div class="card"><h2>Custom categories</h2>${S.categories.map(c=>`<div class="row"><div class="info nm">${esc(c)}</div><button class="sm danger" data-dc="${esc(c)}">✕</button></div>`).join('')||'<div class="mut">None yet.</div>'}
  <label>New category</label><input id="nc"><div class="btns"><button id="ac">Add category</button></div></div>
  <div class="card"><h2>Backup</h2><div class="mut">Data lives only on this device. Export regularly. Older backups are upgraded automatically on import.</div>
  <div class="btns"><button class="pri" id="ex">Export JSON</button><button id="im">Import JSON</button></div>
  <input type="file" id="fi" accept="application/json,.json" hidden>
  <div class="btns"><button class="danger" id="wipe">Erase all data</button></div></div>`;
  $('#sv').onclick=()=>{if(!$('#sm').value)return alert('Check values');S.startMonth=$('#sm').value;save();view=cmp(view,S.startMonth)<0?S.startMonth:view;alert('Saved')};
  $('#aa').onclick=()=>editAcc(null);
  document.querySelectorAll('[data-ea]').forEach(e=>e.onclick=()=>editAcc(e.dataset.ea));
  $('#ac').onclick=()=>{const c=$('#nc').value.trim();if(!c||cats().some(x=>x.toLowerCase()===c.toLowerCase()))return alert('Empty or already exists');S.categories.push(c);save();render()};
  document.querySelectorAll('[data-dc]').forEach(b=>b.onclick=()=>{S.categories=S.categories.filter(x=>x!==b.dataset.dc);save();render()});
  $('#ex').onclick=()=>{const blob=new Blob([JSON.stringify(S,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='budget-backup-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove()};
  $('#im').onclick=()=>$('#fi').click();
  $('#fi').onchange=e=>{const f=e.target.files[0];if(!f)return;const rd=new FileReader();rd.onload=()=>{try{const d=JSON.parse(rd.result);if(!d||typeof d.months!=='object'||!Array.isArray(d.recurring))throw 0;if(!confirm('Replace all current data with this backup?'))return;importData(d);alert('Imported');render()}catch(x){alert('Not a valid backup file')}};rd.readAsText(f)};
  $('#wipe').onclick=()=>{if(confirm('Erase ALL data?')&&confirm('Really erase everything?')){S=blank();save();view=curMonth();asked={};render()}};
}
function importData(d){S=migrate(d);save();view=curMonth();if(cmp(view,S.startMonth)<0)view=S.startMonth;asked={}}
function editAcc(id){
  const isNew=!id,a=isNew?{name:'',type:'current',opening:0}:acc(id);
  const card=a.type==='card';
  modal(`<h2>${isNew?'Add':'Edit'} account</h2>
  <label>Name</label><input id="a_name" value="${esc(a.name)}">
  <label>Type</label><div class="seg" id="a_seg"><button data-t="current" class="${!card?'on':''}">Current account</button><button data-t="card" class="${card?'on':''}">Credit card</button></div>
  <label id="a_obl">${card?'Amount owed at start month (£)':'Opening balance at start month (£, minus if overdrawn)'}</label><input id="a_ob" inputmode="decimal" value="${card?-a.opening:a.opening}">
  <div class="btns"><button id="c">Cancel</button><button class="pri" id="s">Save</button></div>
  ${isNew?'':'<div class="btns"><button class="danger" id="d">Delete account</button></div>'}`);
  let type=a.type;
  document.querySelectorAll('#a_seg button').forEach(b=>b.onclick=()=>{type=b.dataset.t;document.querySelectorAll('#a_seg button').forEach(x=>x.classList.toggle('on',x===b));$('#a_obl').textContent=type==='card'?'Amount owed at start month (£)':'Opening balance at start month (£, minus if overdrawn)'});
  $('#c').onclick=closeModal;
  $('#s').onclick=()=>{const name=$('#a_name').value.trim(),v=parseFloat($('#a_ob').value.replace(/[£,\s]/g,'')||'0');
    if(!name||!isFinite(v))return alert('Enter a name and a valid balance');
    const o={name,type,opening:r2(type==='card'?-v:v)};
    if(isNew)S.accounts.push({id:'a'+uid(),...o});else Object.assign(a,o);
    save();closeModal();render()};
  if($('#d'))$('#d').onclick=()=>{
    if(S.accounts.length<2)return alert('You need at least one account.');
    const used=S.recurring.some(i=>touches(i,id))||Object.values(S.months).some(m=>m.items.some(i=>touches(i,id)));
    if(used)return alert('"'+a.name+'" is used by recurring items or month entries. Move or delete those first.');
    if(!confirm('Delete account "'+a.name+'"?'))return;
    S.accounts=S.accounts.filter(x=>x.id!==id);save();closeModal();render()};
}

if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('sw.js').catch(()=>{});
render();
setTimeout(maybeCheckin,300);
