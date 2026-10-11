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

let S=load();
function blank(){return{opening:0,startMonth:curMonth(),categories:[],recurring:[],months:{}}}
function load(){try{const s=JSON.parse(localStorage.getItem(KEY));if(s&&s.months)return Object.assign(blank(),s)}catch(e){}return blank()}
function save(){localStorage.setItem(KEY,JSON.stringify(S))}
const cats=()=>DEFCATS.concat(S.categories);
let tab='month',view=curMonth();
if(cmp(view,S.startMonth)<0)view=S.startMonth;

// ---- model
function itemsOf(k){ // real items if set up, else projection from recurring
  const m=S.months[k];
  if(m)return m.items;
  return S.recurring.map(r=>({id:'p'+r.id,rid:r.id,name:r.name,type:r.type,amount:r.amount,day:Math.min(r.day,dim(k)),cat:r.cat,paid:false,projected:true}));
}
const sumT=(items,t)=>r2(items.filter(i=>i.type===t).reduce((a,i)=>a+i.amount,0));
function opening(k){
  if(cmp(k,S.startMonth)<=0)return S.opening;
  return closing(addM(k,-1));
}
function closing(k){
  const it=itemsOf(k);
  return r2(opening(k)+sumT(it,'income')-sumT(it,'outgoing'));
}
function cleared(k){
  const it=itemsOf(k).filter(i=>i.paid);
  return r2(opening(k)+sumT(it,'income')-sumT(it,'outgoing'));
}

// ---- modal
function modal(html){$('#sheet').innerHTML=html;$('#modal').hidden=false}
function closeModal(){$('#modal').hidden=true;$('#sheet').innerHTML=''}
$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});
const catOpts=sel=>cats().map(c=>`<option ${c===sel?'selected':''}>${esc(c)}</option>`).join('');
const num=v=>{const n=parseFloat(String(v).replace(/[£,\s]/g,''));return isFinite(n)?r2(Math.abs(n)):NaN};

// ---- render
function render(){
  document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab));
  $('#top').innerHTML='<h1>Budget</h1>';
  ({month:rMonth,recurring:rRecurring,analysis:rAnalysis,settings:rSettings})[tab]();
}
document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;render();scrollTo(0,0)});

function rMonth(){
  const k=view,setup=!!S.months[k],items=itemsOf(k).slice().sort((a,b)=>a.day-b.day||a.name.localeCompare(b.name));
  const inc=sumT(items,'income'),out=sumT(items,'outgoing');
  let h=`<div class="card nav"><button class="sm" id="prev" ${cmp(k,S.startMonth)<=0?'disabled':''}>‹</button><b>${mlabel(k)}</b><button class="sm" id="next">›</button></div>`;
  if(!setup)h+=`<div class="card"><b>${mlabel(k)} isn't set up yet.</b><div class="mut">Showing projection from your recurring items.</div><div class="btns"><button class="pri" id="chk">Start month check-in</button></div></div>`;
  h+=`<div class="card sum"><span>Opening balance</span><span class="amt">${gbp(opening(k))}</span>
   <span>Income</span><span class="amt inc">${gbp(inc)}</span><span>Outgoings</span><span class="amt out">${gbp(out)}</span>
   <span><b>Closing (projected)</b></span><span class="big">${gbp(closing(k))}</span>
   <span><b>Cleared so far</b><div class="sub mut" style="font-size:13px">paid/received only</div></span><span class="big">${gbp(cleared(k))}</span></div>`;
  h+=`<div class="card"><h2>Entries</h2>`;
  if(!items.length)h+=`<div class="empty">No entries.${setup?'':' Add recurring items first.'}</div>`;
  items.forEach(i=>{h+=`<div class="row ${i.paid?'done':''}">
   <input type="checkbox" class="chk" data-id="${i.id}" ${i.paid?'checked':''} ${setup?'':'disabled'} aria-label="paid/received">
   <div class="info" data-edit="${i.id}"><div class="nm">${esc(i.name)}</div><div class="sub">${i.day}${ord(i.day)} · ${esc(i.cat)}${i.rid?'':' · one-off'}</div></div>
   <div class="amt ${i.type==='income'?'inc':'out'}" data-edit="${i.id}">${i.type==='income'?'+':'-'}${gbp(i.amount).replace('-','')}</div></div>`});
  h+=`</div><button class="pri fab" id="addone">+ Add one-off item</button>`;
  $('#main').innerHTML=h;
  $('#prev').onclick=()=>{view=addM(k,-1);render();maybeCheckin()};
  $('#next').onclick=()=>{view=addM(k,1);render();maybeCheckin()};
  if($('#chk'))$('#chk').onclick=()=>startCheckin(k);
  $('#addone').onclick=()=>editEntry(null);
  document.querySelectorAll('.chk').forEach(c=>c.onchange=()=>{const it=S.months[k].items.find(x=>x.id===c.dataset.id);it.paid=c.checked;save();render()});
  document.querySelectorAll('[data-edit]').forEach(e=>e.onclick=()=>editEntry(e.dataset.edit));
}
const ord=d=>d%10==1&&d!=11?'st':d%10==2&&d!=12?'nd':d%10==3&&d!=13?'rd':'th';
let asked={};
function maybeCheckin(){ if(!S.months[view]&&S.recurring.length&&!asked[view]){asked[view]=1;startCheckin(view)} }

// edit/add entry in month (materialises the month if needed)
function ensureMonth(k){if(!S.months[k])S.months[k]={items:itemsOf(k).map(i=>{const c={...i};delete c.projected;c.id=uid();return c})};return S.months[k]}
function editEntry(id){
  const k=view;let it=null;
  if(id){const src=itemsOf(k).find(x=>x.id===id);it=src}
  const isNew=!it;it=it||{name:'',type:'outgoing',amount:'',day:1,cat:'Other',paid:false};
  modal(`<h2>${isNew?'Add one-off item':'Edit entry'} · ${mshort(k)}</h2>
  <label>Name</label><input id="f_name" value="${esc(it.name)}">
  <label>Type</label><div class="seg"><button data-t="outgoing" class="${it.type==='outgoing'?'on':''}">Outgoing</button><button data-t="income" class="${it.type==='income'?'on':''}">Income</button></div>
  <label>Amount (£)</label><input id="f_amt" inputmode="decimal" value="${it.amount}">
  <label>Day of month</label><input id="f_day" type="number" min="1" max="31" inputmode="numeric" value="${it.day}">
  <label>Category</label><select id="f_cat">${catOpts(it.cat)}</select>
  ${it.rid?`<label class="ck"><input type="checkbox" id="f_def"> Also update default amount going forward</label>`:''}
  <label class="ck"><input type="checkbox" id="f_paid" ${it.paid?'checked':''}> Paid / received</label>
  <div class="btns"><button id="c">Cancel</button><button class="pri" id="s">Save</button></div>
  ${isNew?'':'<div class="btns"><button class="danger" id="d">Delete from this month</button></div>'}`);
  let type=it.type;
  document.querySelectorAll('.seg button').forEach(b=>b.onclick=()=>{type=b.dataset.t;document.querySelectorAll('.seg button').forEach(x=>x.classList.toggle('on',x===b))});
  $('#c').onclick=closeModal;
  $('#s').onclick=()=>{
    const amount=num($('#f_amt').value),name=$('#f_name').value.trim(),day=Math.min(31,Math.max(1,parseInt($('#f_day').value)||1));
    if(!name||isNaN(amount))return alert('Please enter a name and amount.');
    const m=ensureMonth(k);
    let t;
    if(isNew){t={id:uid(),rid:null};m.items.push(t)}
    else{ // match by position among projected ids
      t=m.items.find(x=>x.id===id)||m.items.find(x=>it.rid&&x.rid===it.rid);
    }
    Object.assign(t,{name,type,amount,day,cat:$('#f_cat').value,paid:$('#f_paid').checked});
    if(t.rid&&$('#f_def')&&$('#f_def').checked){const r=S.recurring.find(x=>x.id===t.rid);if(r)r.amount=amount}
    save();closeModal();render();
  };
  if($('#d'))$('#d').onclick=()=>{if(!confirm('Delete this entry from '+mlabel(k)+'?'))return;const m=ensureMonth(k);m.items=m.items.filter(x=>x.id!==id&&!(it.rid&&x.rid===it.rid&&id.startsWith('p')));save();closeModal();render()};
}

// ---- check-in
function startCheckin(k){
  const prev=addM(k,-1),pm=S.months[prev];
  const queue=S.recurring.slice().sort((a,b)=>a.day-b.day).map(r=>{
    const p=pm&&pm.items.find(x=>x.rid===r.id);
    return{r,last:p?p.amount:r.amount,fromPrev:!!p};
  });
  const out=[];let i=0;
  function step(){
    if(i>=queue.length)return oneoffs();
    const q=queue[i],r=q.r;
    modal(`<div class="mut">${mlabel(k)} · item ${i+1} of ${queue.length}</div>
    <div class="big-q">${esc(r.name)}</div><div class="mut">${r.type==='income'?'Income':'Outgoing'} · ${esc(r.cat)} · day ${r.day}</div>
    <div class="big-q">Same as last month? <span class="amt ${r.type==='income'?'inc':'out'}">${gbp(q.last)}</span></div>
    <div id="ex"></div>
    <div class="btns"><button class="pri" id="y">Yes</button><button id="n">No</button></div>
    <div class="btns"><button id="skip">Skip this month</button><button id="x">Cancel check-in</button></div>`);
    const add=a=>{out.push({id:uid(),rid:r.id,name:r.name,type:r.type,amount:a,day:Math.min(r.day,dim(k)),cat:r.cat,paid:false});i++;step()};
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
  function oneoffs(){
    modal(`<h2>One-off items · ${mlabel(k)}</h2>
    ${out.filter(x=>!x.rid).map(x=>`<div class="row"><div class="info nm">${esc(x.name)}</div><div class="amt">${gbp(x.amount)}</div></div>`).join('')}
    <label>Name</label><input id="o_name"><div class="seg"><button data-t="outgoing" class="on">Outgoing</button><button data-t="income">Income</button></div>
    <label>Amount (£)</label><input id="o_amt" inputmode="decimal">
    <label>Day</label><input id="o_day" type="number" min="1" max="31" value="1">
    <label>Category</label><select id="o_cat">${catOpts('Other')}</select>
    <div class="btns"><button id="oa">+ Add item</button><button class="pri" id="fin">Finish</button></div>`);
    let type='outgoing';
    document.querySelectorAll('.seg button').forEach(b=>b.onclick=()=>{type=b.dataset.t;document.querySelectorAll('.seg button').forEach(x=>x.classList.toggle('on',x===b))});
    $('#oa').onclick=()=>{const a=num($('#o_amt').value),n=$('#o_name').value.trim();if(!n||isNaN(a))return alert('Enter a name and amount');
      out.push({id:uid(),rid:null,name:n,type,amount:a,day:Math.min(31,Math.max(1,parseInt($('#o_day').value)||1)),cat:$('#o_cat').value,paid:false});oneoffs()};
    $('#fin').onclick=()=>{ // add pending if filled
      const a=num($('#o_amt').value),n=$('#o_name').value.trim();
      if(n&&!isNaN(a))out.push({id:uid(),rid:null,name:n,type,amount:a,day:Math.min(31,Math.max(1,parseInt($('#o_day').value)||1)),cat:$('#o_cat').value,paid:false});
      S.months[k]={items:out};save();closeModal();render()};
  }
  step();
}

// ---- recurring
function rRecurring(){
  const list=S.recurring.slice().sort((a,b)=>a.day-b.day);
  let h=`<button class="pri fab" id="addr">+ Add recurring item</button><div class="card">`;
  if(!list.length)h+=`<div class="empty">No recurring items yet. Add your wages, bills and so on.</div>`;
  list.forEach(r=>h+=`<div class="row" data-r="${r.id}"><div class="info"><div class="nm">${esc(r.name)}</div><div class="sub">Day ${r.day} · ${esc(r.cat)} · ${r.type}</div></div><div class="amt ${r.type==='income'?'inc':'out'}">${gbp(r.amount)}</div></div>`);
  $('#main').innerHTML=h+'</div>';
  $('#addr').onclick=()=>editRec(null);
  document.querySelectorAll('[data-r]').forEach(e=>e.onclick=()=>editRec(e.dataset.r));
}
function editRec(id){
  const isNew=!id,r=isNew?{name:'',type:'outgoing',amount:'',day:1,cat:'Other'}:S.recurring.find(x=>x.id===id);
  modal(`<h2>${isNew?'Add':'Edit'} recurring item</h2>
  <label>Name</label><input id="f_name" value="${esc(r.name)}">
  <label>Type</label><div class="seg"><button data-t="outgoing" class="${r.type==='outgoing'?'on':''}">Outgoing</button><button data-t="income" class="${r.type==='income'?'on':''}">Income</button></div>
  <label>Default amount (£)</label><input id="f_amt" inputmode="decimal" value="${r.amount}">
  <label>Day of month</label><input id="f_day" type="number" min="1" max="31" inputmode="numeric" value="${r.day}">
  <label>Category</label><select id="f_cat">${catOpts(r.cat)}</select>
  <div class="btns"><button id="c">Cancel</button><button class="pri" id="s">Save</button></div>
  ${isNew?'':'<div class="btns"><button class="danger" id="d">Delete</button></div><div class="sub mut">Deleting keeps entries already in past/set-up months.</div>'}`);
  let type=r.type;
  document.querySelectorAll('.seg button').forEach(b=>b.onclick=()=>{type=b.dataset.t;document.querySelectorAll('.seg button').forEach(x=>x.classList.toggle('on',x===b))});
  $('#c').onclick=closeModal;
  $('#s').onclick=()=>{const amount=num($('#f_amt').value),name=$('#f_name').value.trim();
    if(!name||isNaN(amount))return alert('Please enter a name and amount.');
    const o={name,type,amount,day:Math.min(31,Math.max(1,parseInt($('#f_day').value)||1)),cat:$('#f_cat').value};
    if(isNew)S.recurring.push({id:uid(),...o});else Object.assign(r,o);
    save();closeModal();render()};
  if($('#d'))$('#d').onclick=()=>{if(!confirm('Delete "'+r.name+'"?'))return;S.recurring=S.recurring.filter(x=>x.id!==id);save();closeModal();render()};
}

// ---- analysis
let aRange=3,aMonth=curMonth();
const PAL=['#0f766e','#2563eb','#d97706','#9333ea','#dc2626','#0891b2','#65a30d','#db2777','#ea580c','#4f46e5','#059669','#ca8a04','#64748b','#be123c','#7c3aed'];
function rAnalysis(){
  const months=[];for(let i=aRange-1;i>=0;i--)months.push(addM(aMonth,-i));
  const tot={};let all=0;
  months.forEach(m=>itemsOf(m).filter(i=>i.type==='outgoing').forEach(i=>{tot[i.cat]=r2((tot[i.cat]||0)+i.amount);all+=i.amount}));
  const rows=Object.entries(tot).sort((a,b)=>b[1]-a[1]);
  const colour=c=>PAL[cats().indexOf(c)%PAL.length]||'#64748b';
  let h=`<div class="card nav"><button class="sm" id="ap">‹</button><b>${mlabel(aMonth)}</b><button class="sm" id="an">›</button></div>
  <div class="seg">${[1,3,6,12].map(n=>`<button data-n="${n}" class="${n===aRange?'on':''}">${n===1?'This month':'Last '+n}</button>`).join('')}</div>
  <div class="card"><h2>Spending by category</h2>`;
  if(!rows.length)h+=`<div class="empty">No outgoings in this period.</div>`;
  else{
    h+=donut(rows,all,colour)+`<table><tr><th>Category</th><th>Total</th><th>%</th>${aRange>1?'<th>Avg/mo</th>':''}</tr>`+
    rows.map(([c,v])=>`<tr><td><span class="sw" style="background:${colour(c)}"></span>${esc(c)}</td><td>${gbp(v)}</td><td>${(v/all*100).toFixed(0)}%</td>${aRange>1?`<td>${gbp(v/aRange)}</td>`:''}</tr>`).join('')+
    `<tr><td><b>Total</b></td><td><b>${gbp(all)}</b></td><td></td>${aRange>1?`<td><b>${gbp(all/aRange)}</b></td>`:''}</tr></table>`;
  }
  h+=`</div><div class="card"><h2>Income vs outgoings</h2>${trend(months)}<table><tr><th>Month</th><th>In</th><th>Out</th><th>Net</th></tr>`+
   months.map(m=>{const it=itemsOf(m),a=sumT(it,'income'),b=sumT(it,'outgoing');return`<tr><td>${mshort(m)}</td><td class="inc">${gbp(a)}</td><td class="out">${gbp(b)}</td><td>${gbp(a-b)}</td></tr>`}).join('')+`</table></div>`;
  $('#main').innerHTML=h;
  $('#ap').onclick=()=>{aMonth=addM(aMonth,-1);render()};$('#an').onclick=()=>{aMonth=addM(aMonth,1);render()};
  document.querySelectorAll('[data-n]').forEach(b=>b.onclick=()=>{aRange=+b.dataset.n;render()});
}
function donut(rows,all,colour){
  const R=70,C=2*Math.PI*R;let off=0,s=`<svg viewBox="0 0 200 200" style="width:100%;max-width:260px;display:block;margin:0 auto 10px"><g transform="rotate(-90 100 100)">`;
  rows.forEach(([c,v])=>{const len=v/all*C;s+=`<circle cx="100" cy="100" r="${R}" fill="none" stroke="${colour(c)}" stroke-width="32" stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-off}"/>`;off+=len});
  return s+`</g><text x="100" y="96" text-anchor="middle" font-size="13" fill="#6b7783">Total</text><text x="100" y="116" text-anchor="middle" font-size="16" font-weight="700">${gbp(all)}</text></svg>`;
}
function trend(months){
  const d=months.map(m=>{const it=itemsOf(m);return[m,sumT(it,'income'),sumT(it,'outgoing')]});
  const mx=Math.max(1,...d.flatMap(x=>[x[1],x[2]])),W=320,H=160,bw=W/d.length;
  let s=`<svg viewBox="0 0 ${W} ${H+22}" style="width:100%;margin-bottom:8px">`;
  d.forEach((x,i)=>{const w=Math.min(18,bw/2-3),cx=i*bw+bw/2,h1=x[1]/mx*H,h2=x[2]/mx*H;
    s+=`<rect x="${cx-w-1}" y="${H-h1}" width="${w}" height="${h1}" fill="#15803d" rx="2"/><rect x="${cx+1}" y="${H-h2}" width="${w}" height="${h2}" fill="#b91c1c" rx="2"/>`;
    if(d.length<=6||i%2==0)s+=`<text x="${cx}" y="${H+15}" text-anchor="middle" font-size="10" fill="#6b7783">${mshort(x[0]).split(' ')[0]}</text>`});
  return s+`</svg><div class="mut" style="font-size:13px"><span class="sw" style="background:#15803d"></span>Income <span class="sw" style="background:#b91c1c;margin-left:10px"></span>Outgoings</div>`;
}

// ---- settings
function rSettings(){
  $('#main').innerHTML=`<div class="card"><h2>Opening balance</h2><div class="mut">Balance at the start of your first month.</div>
  <label>First month</label><input type="month" id="sm" value="${S.startMonth}">
  <label>Opening balance (£)</label><input id="ob" inputmode="decimal" value="${S.opening}"><div class="btns"><button class="pri" id="sv">Save</button></div></div>
  <div class="card"><h2>Custom categories</h2>${S.categories.map(c=>`<div class="row"><div class="info nm">${esc(c)}</div><button class="sm danger" data-dc="${esc(c)}">✕</button></div>`).join('')||'<div class="mut">None yet.</div>'}
  <label>New category</label><input id="nc"><div class="btns"><button id="ac">Add category</button></div></div>
  <div class="card"><h2>Backup</h2><div class="mut">Data lives only on this device. Export regularly.</div>
  <div class="btns"><button class="pri" id="ex">Export JSON</button><button id="im">Import JSON</button></div>
  <input type="file" id="fi" accept="application/json,.json" hidden>
  <div class="btns"><button class="danger" id="wipe">Erase all data</button></div></div>`;
  $('#sv').onclick=()=>{const v=parseFloat($('#ob').value.replace(/[£,\s]/g,''));if(!isFinite(v)||!$('#sm').value)return alert('Check values');S.opening=r2(v);S.startMonth=$('#sm').value;save();view=cmp(view,S.startMonth)<0?S.startMonth:view;alert('Saved')};
  $('#ac').onclick=()=>{const c=$('#nc').value.trim();if(!c||cats().some(x=>x.toLowerCase()===c.toLowerCase()))return alert('Empty or already exists');S.categories.push(c);save();render()};
  document.querySelectorAll('[data-dc]').forEach(b=>b.onclick=()=>{S.categories=S.categories.filter(x=>x!==b.dataset.dc);save();render()});
  $('#ex').onclick=()=>{const blob=new Blob([JSON.stringify(S,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='budget-backup-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove()};
  $('#im').onclick=()=>$('#fi').click();
  $('#fi').onchange=e=>{const f=e.target.files[0];if(!f)return;const rd=new FileReader();rd.onload=()=>{try{const d=JSON.parse(rd.result);if(!d||typeof d.months!=='object'||!Array.isArray(d.recurring))throw 0;if(!confirm('Replace all current data with this backup?'))return;S=Object.assign(blank(),d);save();view=S.startMonth>curMonth()?S.startMonth:curMonth();if(cmp(view,S.startMonth)<0)view=S.startMonth;alert('Imported');render()}catch(x){alert('Not a valid backup file')}};rd.readAsText(f)};
  $('#wipe').onclick=()=>{if(confirm('Erase ALL data?')&&confirm('Really erase everything?')){S=blank();save();view=curMonth();asked={};render()}};
}

if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('sw.js').catch(()=>{});
render();
