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

const DV=2;
function seedAccounts(op){return[{id:'a1',name:'Current Account 1',type:'current',opening:r2(op||0)},{id:'a2',name:'Current Account 2',type:'current',opening:0},{id:'a3',name:'Credit Card',type:'card',opening:0}]}
function blank(){return{version:DV,startMonth:curMonth(),accounts:seedAccounts(0),categories:[],recurring:[],months:{}}}
function migrate(d){ // upgrade any older data shape to current version
  d=Object.assign({categories:[],recurring:[],months:{}},d);
  if(!d.startMonth)d.startMonth=curMonth();
  if(!(d.version>=2)){
    if(!Array.isArray(d.accounts)||!d.accounts.length)d.accounts=seedAccounts(+d.opening||0);
    delete d.opening;
  }
  const ids=d.accounts.map(a=>a.id),def=ids[0];
  const fix=i=>{if(!ids.includes(i.account))i.account=def;if(i.type==='transfer'){if(!ids.includes(i.to)||i.to===i.account)i.to=ids.find(x=>x!==i.account);i.cat='Transfer'}else delete i.to};
  d.recurring.forEach(fix);Object.values(d.months).forEach(m=>(m.items||(m.items=[])).forEach(fix));
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
if(cmp(view,S.startMonth)<0)view=S.startMonth;

// ---- model
function itemsOf(k){ // real items if set up, else projection from recurring
  const m=S.months[k];
  if(m)return m.items;
  return S.recurring.map(r=>({id:'p'+r.id,rid:r.id,name:r.name,type:r.type,amount:r.amount,day:Math.min(r.day,dim(k)),cat:r.cat,account:r.account,to:r.to,paid:false,projected:true}));
}
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
  ({month:rMonth,recurring:rRecurring,analysis:rAnalysis,settings:rSettings})[tab]();
}
document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;render();scrollTo(0,0)});
const ord=d=>d%10==1&&d!=11?'st':d%10==2&&d!=12?'nd':d%10==3&&d!=13?'rd':'th';
const sortI=(a,b)=>a.day-b.day||a.name.localeCompare(b.name);

function entryRow(i,a,setup){
  const e=effect(i,a),tr=isTr(i);
  const sub=tr?(i.account===a?'→ '+esc(aname(i.to)):'← '+esc(aname(i.account)))+' · transfer':esc(i.cat);
  return `<div class="row ${i.paid?'done':''}">
   <input type="checkbox" class="chk" data-id="${i.id}" ${i.paid?'checked':''} ${setup?'':'disabled'} aria-label="paid/received">
   <div class="info" data-edit="${i.id}"><div class="nm">${tr?'⇄ ':''}${esc(i.name)}</div><div class="sub">${i.day}${ord(i.day)} · ${sub}${i.rid?'':' · one-off'}</div></div>
   <div class="amt ${tr?'trf':e>=0?'inc':'out'}" data-edit="${i.id}">${e>=0?'+':'-'}${gbp(Math.abs(e))}</div></div>`;
}
function rMonth(){
  const k=view,setup=!!S.months[k],items=itemsOf(k).slice().sort(sortI);
  const shown=mFilter==='all'?S.accounts:S.accounts.filter(a=>a.id===mFilter);
  let h=`<div class="card nav"><button class="sm" id="prev" ${cmp(k,S.startMonth)<=0?'disabled':''}>‹</button><b>${mlabel(k)}</b><button class="sm" id="next">›</button></div>`;
  h+=`<select id="mf" aria-label="Account filter"><option value="all">All accounts (grouped)</option>${S.accounts.map(a=>`<option value="${a.id}" ${a.id===mFilter?'selected':''}>${esc(a.name)}</option>`).join('')}</select><div style="height:12px"></div>`;
  if(!setup)h+=`<div class="card"><b>${mlabel(k)} isn't set up yet.</b><div class="mut">Showing projection from your recurring items.</div><div class="btns"><button class="pri" id="chk">Start month check-in</button></div></div>`;
  if(mFilter==='all'){
    h+=`<div class="card"><h2>All accounts</h2><table><tr><th>Account</th><th>Opening</th><th>Closing</th><th>Cleared</th></tr>`+
     S.accounts.map(a=>`<tr><td>${esc(a.name)}</td><td>${fmtBal(a.id,opening(k,a.id))}</td><td><b>${fmtBal(a.id,closing(k,a.id))}</b></td><td>${fmtBal(a.id,cleared(k,a.id))}</td></tr>`).join('')+
     `<tr><td><b>Combined</b></td><td><b>${gbp(total(opening,k))}</b></td><td><b>${gbp(total(closing,k))}</b></td><td><b>${gbp(total(cleared,k))}</b></td></tr></table>
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
     <span><b>Cleared so far</b></span><span class="amt">${fmtBal(a.id,cleared(k,a.id))}</span></div>
     ${card&&cl<0?`<div class="btns"><button id="po_${a.id}" data-po="${a.id}">Pay off card balance (${gbp(-cl)})</button></div>`:''}
     <div style="margin-top:8px">${its.map(i=>entryRow(i,a.id,setup)).join('')||'<div class="empty">No entries.</div>'}</div></div>`;
  });
  h+=`<button class="pri fab" id="addone">+ Add one-off item</button>`;
  $('#main').innerHTML=h;
  $('#prev').onclick=()=>{view=addM(k,-1);render();maybeCheckin()};
  $('#next').onclick=()=>{view=addM(k,1);render();maybeCheckin()};
  $('#mf').onchange=()=>{mFilter=$('#mf').value;render()};
  if($('#chk'))$('#chk').onclick=()=>startCheckin(k);
  $('#addone').onclick=()=>editEntry(null);
  document.querySelectorAll('.chk').forEach(c=>c.onchange=()=>{const it=S.months[k].items.find(x=>x.id===c.dataset.id);it.paid=c.checked;save();render()});
  document.querySelectorAll('[data-edit]').forEach(e=>e.onclick=()=>editEntry(e.dataset.edit));
  document.querySelectorAll('[data-po]').forEach(b=>b.onclick=()=>payOff(k,b.dataset.po));
}
let asked={};
function maybeCheckin(){ if(!S.months[view]&&S.recurring.length&&!asked[view]){asked[view]=1;startCheckin(view)} }

// edit/add entry in month (materialises the month if needed)
function ensureMonth(k){if(!S.months[k])S.months[k]={items:itemsOf(k).map(i=>{const c={...i};delete c.projected;c.id=uid();return c})};return S.months[k]}
function editEntry(id,preset){
  const k=view;let it=null;
  if(id)it=itemsOf(k).find(x=>x.id===id);
  const isNew=!it;it=it||Object.assign({name:'',type:'outgoing',amount:'',day:1,cat:'Other',paid:false,account:mFilter!=='all'?mFilter:S.accounts[0].id},preset||{});
  modal(`<h2>${isNew?'Add one-off item':'Edit entry'} · ${mshort(k)}</h2>
  ${entryForm(it,'f_')}
  ${it.rid?`<label class="ck"><input type="checkbox" id="f_def"> Also update default amount going forward</label>`:''}
  <label class="ck"><input type="checkbox" id="f_paid" ${it.paid?'checked':''}> Paid / received</label>
  <div class="btns"><button id="c">Cancel</button><button class="pri" id="s">Save</button></div>
  ${isNew?'':'<div class="btns"><button class="danger" id="d">Delete from this month</button></div>'}`);
  const get=bindForm('f_',it.type);
  $('#c').onclick=closeModal;
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
function payOff(k,cardId){
  const owed=-closing(k,cardId);if(!(owed>0))return;
  const from=(S.accounts.find(a=>a.type!=='card')||S.accounts.find(a=>a.id!==cardId)).id;
  editEntry(null,{name:'Pay off '+aname(cardId),type:'transfer',amount:r2(owed),day:dim(k),account:from,to:cardId,cat:'Transfer'});
}

// ---- check-in
function startCheckin(k){
  const prev=addM(k,-1),pm=S.months[prev],ai=id=>S.accounts.findIndex(a=>a.id===id);
  const queue=S.recurring.slice().sort((a,b)=>ai(a.account)-ai(b.account)||a.day-b.day).map(r=>{
    const p=pm&&pm.items.find(x=>x.rid===r.id);
    return{r,last:p?p.amount:r.amount};
  });
  const out=[];let i=0;
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
        if($('#nd').checked)r.amount=a;add(a)};
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
      S.months[k]={items:out};save();closeModal();render()};
  }
  step();
}

// ---- recurring
function rRecurring(){
  let h=`<button class="pri fab" id="addr">+ Add recurring item</button>`;
  if(!S.recurring.length)h+=`<div class="card"><div class="empty">No recurring items yet. Add your wages, bills, card payoff and so on.</div></div>`;
  S.accounts.forEach(a=>{
    const list=S.recurring.filter(r=>r.account===a.id).sort((x,y)=>x.day-y.day);if(!list.length)return;
    h+=`<div class="card"><h2>${esc(a.name)}</h2>`+list.map(r=>`<div class="row" data-r="${r.id}"><div class="info"><div class="nm">${r.type==='transfer'?'⇄ ':''}${esc(r.name)}</div><div class="sub">Day ${r.day} · ${r.type==='transfer'?'transfer → '+esc(aname(r.to)):esc(r.cat)+' · '+r.type}</div></div><div class="amt ${r.type==='transfer'?'trf':r.type==='income'?'inc':'out'}">${gbp(r.amount)}</div></div>`).join('')+'</div>';
  });
  $('#main').innerHTML=h;
  $('#addr').onclick=()=>editRec(null);
  document.querySelectorAll('[data-r]').forEach(e=>e.onclick=()=>editRec(e.dataset.r));
}
function editRec(id){
  const isNew=!id,r=isNew?{name:'',type:'outgoing',amount:'',day:1,cat:'Other',account:S.accounts[0].id}:S.recurring.find(x=>x.id===id);
  modal(`<h2>${isNew?'Add':'Edit'} recurring item</h2>
  ${entryForm(r,'f_','Default amount (£)')}
  <div class="btns"><button id="c">Cancel</button><button class="pri" id="s">Save</button></div>
  ${isNew?'':'<div class="btns"><button class="danger" id="d">Delete</button></div><div class="sub mut">Deleting keeps entries already in past/set-up months.</div>'}`);
  const get=bindForm('f_',r.type);
  $('#c').onclick=closeModal;
  $('#s').onclick=()=>{const o=get();if(!o)return;
    if(isNew){const n={id:uid(),...o};if(n.to===undefined)delete n.to;S.recurring.push(n)}else{Object.assign(r,o);if(r.to===undefined)delete r.to}
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
