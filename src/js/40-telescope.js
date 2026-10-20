/* At the telescope: tonight's plan, red "at the eyepiece" view, all-sky chart, observing log. */

/* --- constellation lookup --- */
const consMemo = new Map();
function constellationOf(raH, dec){
  const k = raH.toFixed(2)+':'+dec.toFixed(1);
  if(consMemo.has(k)) return consMemo.get(k);
  const lon = raH*15 > 180 ? raH*15-360 : raH*15;
  const f = SKY.bounds.features.find(f=>d3.geoContains(f,[lon,dec]));
  const name = f && SKY.cons[f.id] ? SKY.cons[f.id][0] : '';
  consMemo.set(k,name); return name;
}

/* --- observing log --- */
S.log = store.get('log', []);
function logged(id){ return S.log.some(e=>e.target===id); }
function addLog(r, i){
  const w = wxAt(i);
  S.log.push({ id:Date.now(), at:S.times[i], target:r.t.id, name:r.t.name, loc:locName(), lat:+S.sel.lat.toFixed(3), lon:+S.sel.lon.toFixed(3),
    cloud: w?Math.round(w.cloud):null, seeing: w?+w.seeing.toFixed(1):null, transp: w?+w.transp.toFixed(1):null, gear: activeGear().name || '' });
  store.set('log', S.log);
}
function logHTML(){
  const seenM = new Set(S.log.filter(e=>/^M\d+$/.test(e.target)).map(e=>e.target));
  let h = `<div><h4>Observing log</h4>`;
  h += `<div class="row" style="gap:10px;margin-bottom:8px"><div class="stat" style="flex:1"><span class="l">Messier objects seen</span><span class="v">${seenM.size} / 110</span><span class="n"><span class="mbar"><i style="width:${(seenM.size/110*100).toFixed(1)}%"></i></span></span></div>
    <div class="stat" style="flex:1"><span class="l">Logged sightings</span><span class="v">${S.log.length}</span><span class="n">${S.log.length?`last ${fmtMD.format(new Date(S.log[S.log.length-1].at*1000))}`:'none yet'}</span></div></div>`;
  if(!S.log.length) h += `<p class="note" style="margin:0">Press <b>Seen it</b> in tonight's plan or the red view to log what you observed, with that night's conditions.</p>`;
  else h += `<ul class="slist">${S.log.slice().reverse().slice(0,10).map(e=>`<li class="sv"><div class="info"><b>${esc(e.name)}</b><span class="sub">${esc(fmtFull.format(new Date(e.at*1000)))} · ${esc(e.loc)}${e.cloud!=null?` · ${e.cloud}% cloud, seeing ${e.seeing}`:''}</span></div><button class="btn ghost" data-logdel="${e.id}" aria-label="Remove from log">✕</button></li>`).join('')}</ul>
    ${S.log.length>10?`<p class="note">Showing the latest 10 of ${S.log.length}.</p>`:''}`;
  return h + `</div>`;
}

/* --- tonight's plan --- */
function buildPlan(ev, n){
  const gs = C.gearStats(gearForCalc(), bortleFor(S.sel));
  const rows = ev.res.map(r=>{
    let pk={s:0,i:-1}; const ser=[];
    for(let i=n.start;i<n.end;i++){ ser.push(r.scores[i].s); if(r.scores[i].s>pk.s) pk={s:r.scores[i].s,i}; }
    const win = C.bestWindow(ser,50)||C.bestWindow(ser,35);
    return {r,pk,win};
  }).filter(x=>x.pk.s>=35).sort((a,b)=>b.pk.s-a.pk.s).slice(0,12);
  return rows.map(x=>{
    // observe near the middle of its good window, nudged toward the peak
    const i = x.win ? Math.round((n.start+x.win.start + n.start+x.win.end-1 + 2*x.pk.i)/4) : x.pk.i;
    const sc = x.r.scores[i], t = x.r.t, w = wxAt(i);
    const st = x.r.st || {};
    let ra=t.ra, dec=t.dec;
    if(t.body){ const e=C.topo(t.body, tDate(i), S.sel.lat, S.sel.lon); ra=e.ra; dec=e.dec; }
    return { x, i, t, score:x.pk.s, alt:sc.alt, az:sc.az, where:C.whereText(sc.alt, sc.az), con:constellationOf(ra,dec),
      view:C.suggestView(t, st, gs, w?w.seeing:null), detail:x.r.detail, reach:x.r.reach };
  }).sort((a,b)=>a.i-b.i || b.score-a.score);
}
function planHTML(ev, n){
  const plan = buildPlan(ev, n);
  S.plan = plan;
  let h = `<div><div class="row" style="justify-content:space-between;margin-bottom:8px"><h4 style="margin:0">Observing plan · ${esc(nightLabel(n))}</h4>
    <span class="row"><button class="btn" id="skyOpen">Sky chart</button><button class="btn primary" id="redOpen" ${plan.length?'':'disabled'}>Red view</button></span></div>`;
  if(!plan.length) return h + `<p class="note" style="margin:0">Nothing scores well enough ${esc(nightLabel(n).toLowerCase())} to plan around. Try another night.</p></div>`;
  h += `<ol class="plan">${plan.map((p,k)=>`<li><span class="ptime mono">${hourLabel(tDate(p.i))}</span><div style="min-width:0"><b>${esc(p.t.name)}</b>${logged(p.t.id)?' <span class="tag green">seen</span>':''}
    <div class="sub">${esc(p.where)}${p.con?` · in ${esc(p.con)}`:''}</div><div class="sub">Use: ${esc(p.view.text)}</div></div>
    <button class="btn ghost" data-seen="${k}" title="Add to your observing log">${logged(p.t.id)?'Seen again':'Seen it'}</button></li>`).join('')}</ol></div>`;
  return h;
}

/* --- red "at the eyepiece" view --- */
S.redIdx = 0;
let wakeLock = null;
function openRed(){
  const m = ensureModal('redModal','red-modal');
  S.redIdx = Math.min(S.redIdx, Math.max(0,(S.plan||[]).length-1));
  try{ navigator.wakeLock && navigator.wakeLock.request('screen').then(l=>wakeLock=l).catch(()=>{}); }catch(e){}
  m.hidden=false; renderRed(); m.querySelector('[data-rclose]').focus();
}
function closeModal(id){ const m=$('#'+id); if(m) m.hidden=true; if(id==='redModal' && wakeLock){ try{ wakeLock.release(); }catch(e){} wakeLock=null; } }
function renderRed(){
  const m=$('#redModal'), plan=S.plan||[], p=plan[S.redIdx]; if(!m||!p) return;
  m.innerHTML = `<div class="rv">
    <div class="rv-top"><span>${esc(locName())} · ${S.redIdx+1} of ${plan.length}</span><button class="rbtn" data-rclose aria-label="Close red view">Close</button></div>
    <div class="rv-time mono">${hourLabel(tDate(p.i))}</div>
    <h2 class="rv-name">${esc(p.t.name)}</h2>
    <div class="rv-where">${esc(p.where[0].toUpperCase()+p.where.slice(1))}</div>
    ${p.con?`<div class="rv-line">In ${esc(p.con)}</div>`:''}
    <div class="rv-line">Use ${esc(p.view.text)}</div>
    <p class="rv-detail">${esc(p.detail)}</p>
    <div class="rv-nav"><button class="rbtn" data-rprev ${S.redIdx?'':'disabled'}>Previous</button>
      <button class="rbtn strong" data-rseen>${logged(p.t.id)?'Seen again':'Seen it'}</button>
      <button class="rbtn" data-rnext ${S.redIdx<plan.length-1?'':'disabled'}>Next</button></div>
  </div>`;
  m.querySelector('[data-rclose]').onclick=()=>closeModal('redModal');
  const pv=m.querySelector('[data-rprev]'), nx=m.querySelector('[data-rnext]');
  pv.onclick=()=>{ S.redIdx--; renderRed(); }; nx.onclick=()=>{ S.redIdx++; renderRed(); };
  m.querySelector('[data-rseen]').onclick=()=>{ addLog(p.x.r, p.i); toast(`Logged ${p.t.name}`); renderRed(); };
}
function ensureModal(id, cls){
  let m=$('#'+id);
  if(!m){ m=document.createElement('div'); m.id=id; m.className='modal '+cls; m.hidden=true; m.setAttribute('role','dialog'); m.setAttribute('aria-modal','true');
    document.body.appendChild(m);
    m.addEventListener('keydown',e=>{ if(e.key==='Escape') closeModal(id); if(id==='redModal'){ if(e.key==='ArrowRight'&&S.redIdx<(S.plan||[]).length-1){S.redIdx++;renderRed();} if(e.key==='ArrowLeft'&&S.redIdx>0){S.redIdx--;renderRed();} } }); }
  return m;
}

/* --- all-sky chart --- */
function openSky(){
  const m = ensureModal('skyModal','sky-modal');
  if(S.plan && S.plan.length && C.topo('Sun',tDate(S.ti),S.sel.lat,S.sel.lon).alt > -8) setTime(S.plan[0].i);
  m.innerHTML = `<div class="sky-head"><div style="min-width:0"><b>Sky chart</b> <span class="sub" id="skyWhen"></span></div>
    <div class="row"><button class="btn" data-sk="-1" aria-label="One hour earlier">−1 h</button><button class="btn" data-sk="1" aria-label="One hour later">+1 h</button><button class="btn" data-skclose>Close</button></div></div>
    <div class="sky-wrap"><canvas id="skyCanvas" aria-label="Chart of the sky above you"></canvas><div class="tip" id="skyTip" hidden></div></div>
    <p class="note sky-foot">Hold the chart overhead with the top toward north: east is on the left. Dashed ring: 30° up. Circled names are tonight's plan.</p>`;
  m.hidden=false;
  m.querySelector('[data-skclose]').onclick=()=>closeModal('skyModal');
  m.querySelectorAll('[data-sk]').forEach(b=>b.onclick=()=>{ setTime(clamp(S.ti+ +b.dataset.sk,0,71)); drawSky(); });
  const cv=$('#skyCanvas');
  cv.onpointermove = e => skyHover(e); cv.onclick = e => skyHover(e, true);
  drawSky(); m.querySelector('[data-skclose]').focus();
}
let skyHits=[];
function drawSky(){
  const cv=$('#skyCanvas'); if(!cv) return;
  const wrap=cv.parentElement, size=Math.min(wrap.clientWidth, wrap.clientHeight||wrap.clientWidth);
  const dpr=Math.min(2,window.devicePixelRatio||1);
  cv.style.width=size+'px'; cv.style.height=size+'px'; cv.width=Math.round(size*dpr); cv.height=Math.round(size*dpr);
  const g=cv.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0);
  const d=tDate(S.ti), lat=S.sel.lat, lon=S.sel.lon, gst=C.gast(d), R=size/2-22, cx=size/2, cy=size/2;
  $('#skyWhen').textContent = `${locName()} · ${fmtFull.format(d)}`;
  const sun=C.topo('Sun',d,lat,lon).alt;
  const red = S.red, css=getComputedStyle(document.documentElement);
  const fg=css.getPropertyValue('--fg').trim(), muted=css.getPropertyValue('--muted').trim(), accent=css.getPropertyValue('--accent').trim();
  const skyCol = sun>0?'#5d86b8':sun>-6?'#2c4670':sun>-12?'#16233f':sun>-18?'#0c1428':'#05080f';
  const proj2 = (alt, az) => { if(alt< -1) return null; const r=R*Math.tan((90-alt)*Math.PI/360); return [cx - r*Math.sin(az*Math.PI/180), cy - r*Math.cos(az*Math.PI/180)]; };
  const P = (raH, dec) => proj2(C.altFast(lat,lon,raH,dec,gst), C.azFast(lat,lon,raH,dec,gst));
  g.clearRect(0,0,size,size);
  g.beginPath(); g.arc(cx,cy,R,0,7); g.fillStyle=skyCol; g.fill();
  g.save(); g.beginPath(); g.arc(cx,cy,R,0,7); g.clip();
  // 30-degree ring
  g.setLineDash([3,4]); g.strokeStyle='rgba(180,200,230,.25)'; g.beginPath(); g.arc(cx,cy,R*Math.tan(60*Math.PI/360),0,7); g.stroke(); g.setLineDash([]);
  // constellation lines
  g.strokeStyle='rgba(150,180,230,.35)'; g.lineWidth=0.8;
  for(const id in SKY.lines){ for(const line of SKY.lines[id]){ g.beginPath(); let pen=false;
    for(const [lo,la] of line){ const p=P(((lo+360)%360)/15, la); if(!p){ pen=false; continue; } if(!pen){ g.moveTo(p[0],p[1]); pen=true; } else g.lineTo(p[0],p[1]); } g.stroke(); } }
  // stars
  SKY.stars.forEach(([lo,la,mag],i)=>{ const p=P(((lo+360)%360)/15, la); if(!p) return; const rr=Math.max(0.5, 3.4-0.6*mag);
    g.beginPath(); g.arc(p[0],p[1],rr,0,7); g.fillStyle='rgba(245,248,255,'+(mag<3?1:0.85)+')'; g.fill();
    const nm=SKY.names[i]; if(nm){ g.fillStyle='rgba(220,230,250,.75)'; g.font='10px "Atkinson Hyperlegible", system-ui, sans-serif'; g.fillText(nm,p[0]+4,p[1]-3); } });
  // constellation names
  g.font='600 9.5px "Chakra Petch", system-ui, sans-serif'; g.fillStyle='rgba(150,180,230,.6)'; g.textAlign='center';
  for(const id in SKY.cons){ const [nm,lo,la,rank]=SKY.cons[id]; if(rank>2) continue; const p=P(((lo+360)%360)/15, la); if(p) g.fillText(nm.toUpperCase(),p[0],p[1]); }
  g.textAlign='left';
  skyHits=[];
  // horizon profile
  const sv=S.saved.find(x=>near(x,S.sel));
  if(sv && sv.horizon && sv.horizon.some(a=>a>0)){
    g.beginPath(); for(let az=0;az<=360;az+=5){ const p=proj2(C.horizonAt(sv.horizon,az),az); if(az===0) g.moveTo(p[0],p[1]); else g.lineTo(p[0],p[1]); }
    for(let az=360;az>=0;az-=5){ const p=proj2(0,az); g.lineTo(p[0],p[1]); }
    g.closePath(); g.fillStyle='rgba(20,40,20,.75)'; g.fill();
  }
  // planets, Moon, Sun
  const bodies=['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune'];
  const bcol={Sun:'#ffd27a',Moon:'#e8ecf5',Mercury:'#c9bba8',Venus:'#fff1c4',Mars:'#ff8a5c',Jupiter:'#f3cf9b',Saturn:'#e8d58a',Uranus:'#9fe0e0',Neptune:'#8fb0ff'};
  bodies.forEach(b=>{ const e=C.topo(b,d,lat,lon); const p=proj2(e.alt,e.az); if(!p) return;
    g.beginPath(); g.arc(p[0],p[1], b==='Sun'||b==='Moon'?7:4.5,0,7); g.fillStyle=bcol[b]; g.fill();
    g.font='600 11px "Atkinson Hyperlegible", system-ui, sans-serif'; g.fillStyle=bcol[b]; g.fillText(b,p[0]+8,p[1]+4);
    skyHits.push({p,name:b,alt:e.alt,az:e.az}); });
  // tonight's plan targets
  (S.plan||[]).forEach(pl=>{ const t=pl.t; let ra=t.ra, dec=t.dec; if(t.body) return;
    const alt=C.altFast(lat,lon,ra,dec,gst), az=C.azFast(lat,lon,ra,dec,gst), p=proj2(alt,az); if(!p) return;
    g.beginPath(); g.arc(p[0],p[1],7,0,7); g.strokeStyle='#f1b450'; g.lineWidth=1.5; g.stroke();
    g.font='600 11px "Atkinson Hyperlegible", system-ui, sans-serif'; g.fillStyle='#f6d9a3'; g.fillText(t.name.replace(/ \(M\d+\)$/,''),p[0]+9,p[1]+4);
    skyHits.push({p,name:t.name,alt,az}); });
  g.restore();
  // rim + cardinal points
  g.beginPath(); g.arc(cx,cy,R,0,7); g.strokeStyle=muted; g.lineWidth=1; g.stroke();
  g.font='700 13px "Chakra Petch", system-ui, sans-serif'; g.fillStyle=fg; g.textAlign='center'; g.textBaseline='middle';
  [['N',0],['E',90],['S',180],['W',270]].forEach(([l,az])=>{ const r=R+12; g.fillText(l, cx - r*Math.sin(az*Math.PI/180), cy - r*Math.cos(az*Math.PI/180)); });
  g.textAlign='left'; g.textBaseline='alphabetic';
}
function skyHover(e, click){
  const cv=$('#skyCanvas'), tip=$('#skyTip'); const r=cv.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
  let best=null; skyHits.forEach(h=>{ const d=Math.hypot(h.p[0]-x,h.p[1]-y); if(d<16&&(!best||d<best.d)) best={...h,d}; });
  if(!best){ tip.hidden=true; return; }
  tip.textContent=`${best.name}: ${C.whereText(best.alt,best.az)}`; tip.hidden=false;
  tip.style.left=Math.min(x+12, r.width-200)+'px'; tip.style.top=(y+12)+'px';
}

function wireTelescope(b){
  const so=$('#skyOpen'); if(so) so.onclick=openSky;
  const ro=$('#redOpen'); if(ro) ro.onclick=()=>{ S.redIdx=0; openRed(); };
  b.querySelectorAll('[data-seen]').forEach(x=>x.onclick=()=>{ const p=S.plan[+x.dataset.seen]; addLog(p.x.r,p.i); toast(`Logged ${p.t.name}`); const y=b.scrollTop; renderPanel(); b.scrollTop=y; });
  b.querySelectorAll('[data-logdel]').forEach(x=>x.onclick=()=>{ S.log=S.log.filter(e=>e.id!==+x.dataset.logdel); store.set('log',S.log); renderPanel(); });
}
