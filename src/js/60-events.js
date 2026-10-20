/* Tonight's sky events: Jupiter's moons, Moon features on the terminator, satellite passes.
   Lunar occultations are added to the calendar. */

S.jupFlip = store.get('jupFlip', true); // show as seen in a Newtonian reflector (rotated 180°)

/* --- Jupiter's moons --- */
function jupiterHTML(n){
  if(!S.interests.planets) return '';
  // pick the best hour Jupiter is up during this night
  let bi=-1, ba=-90;
  for(let i=n.start;i<n.end;i++){ const a=C.topo('Jupiter',tDate(i),S.sel.lat,S.sel.lon).alt; if(a>ba){ ba=a; bi=i; } }
  if(ba<10) return '';
  const useI = (S.ti>=n.start && S.ti<n.end && C.topo('Jupiter',tDate(S.ti),S.sel.lat,S.sel.lon).alt>5) ? S.ti : bi;
  const d=tDate(useI), jm=C.jupiterMoons(d), flip=S.jupFlip?-1:1;
  const W2=300, H2=90, cx=W2/2, cy=H2/2, sc=4.2;
  const moons=Object.entries(jm).map(([k,m])=>({k, name:k[0].toUpperCase()+k.slice(1), x:cx + flip*(-m.x)*sc, y:cy + flip*(-m.y)*sc, m}));
  const evs = C.jupiterEvents(tDate(n.start), tDate(n.end-1)).filter(e=>e.end==null || e.end>tDate(n.start));
  const evText = e => `${e.moon} ${e.kind==='transit'?'crosses in front of Jupiter':'is hidden behind Jupiter'} ${e.start<tDate(n.start)?'until':'from '+hourLabel(e.start)}${e.end?` ${e.start<tDate(n.start)?'':'to '}${hourLabel(e.end)}`:''}`;
  return `<div><div class="row" style="justify-content:space-between;margin-bottom:6px"><h4 style="margin:0">Jupiter's moons · ${hourLabel(d)}</h4>
      <label class="sub" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="jupFlip" ${S.jupFlip?'checked':''}> As in your reflector</label></div>
    <svg viewBox="0 0 ${W2} ${H2}" width="100%" style="max-width:${W2*1.4}px;background:#04060c;border-radius:6px;display:block" role="img" aria-label="Positions of Jupiter's four large moons">
      <ellipse cx="${cx}" cy="${cy}" rx="${sc}" ry="${(sc*0.935).toFixed(2)}" fill="#e9cf9f"/>
      ${moons.map(o=>{ if(Math.abs(o.x-cx)>W2/2-6) return `<text x="${o.x<cx?6:W2-6}" y="${cy+3}" text-anchor="${o.x<cx?'start':'end'}" font-size="9" fill="#9aa6bd">${o.name} ${o.x<cx?'◂':'▸'}</text>`;
        return `<circle cx="${o.x.toFixed(1)}" cy="${o.y.toFixed(1)}" r="1.8" fill="${o.m.hidden?'#555':'#f4f6fb'}"/><text x="${o.x.toFixed(1)}" y="${(o.y + (o.k==='io'||o.k==='ganymede'?-6:12)).toFixed(1)}" text-anchor="middle" font-size="8.5" fill="#9aa6bd">${o.name}${o.m.transit?' (on disk)':o.m.hidden?' (behind)':''}</text>`; }).join('')}
    </svg>
    <p class="note" style="margin:4px 0 0">${S.jupFlip?'Rotated 180°, the way your Newtonian shows it. ':'North up, east left, as with the naked eye or binoculars. '}${evs.length?esc(evs.map(evText).join('. '))+'.':'No moon crosses in front of Jupiter during darkness tonight.'}</p></div>`;
}

/* --- Moon on the terminator --- */
function moonFeaturesHTML(n){
  if(!S.interests.moon) return '';
  let bi=-1, ba=-90;
  for(let i=n.start;i<n.end;i++){ const a=C.topo('Moon',tDate(i),S.sel.lat,S.sel.lon).alt; if(a>ba){ ba=a; bi=i; } }
  if(ba<10) return '';
  const mt=C.moonTerminator(tDate(bi));
  if(!mt.features.length) return '';
  return `<div><h4>On the Moon tonight</h4><p class="note" style="margin:0 0 6px">Features near the ${mt.waxing?'sunrise':'sunset'} line show the most relief, with long shadows. Best around ${hourLabel(tDate(bi))}, when the Moon is ${Math.round(ba)}° up.</p>
    <ul class="tlist">${mt.features.map(f=>`<li class="sv"><div class="info"><b>${esc(f.name)}</b><span class="sub" style="white-space:normal">${esc(f.note)}</span></div></li>`).join('')}</ul></div>`;
}

/* --- satellite passes (ISS, Tiangong) via CelesTrak orbital elements --- */
const SATS = [[25544,'International Space Station'],[48274,'Tiangong space station']];
S.sat = { tle:null, passes:null, err:null, busy:false, key:'' };
async function loadTLE(){
  const cached = store.get('tle', null);
  if(cached && Date.now()-cached.at < 12*3600e3) return cached.list;
  const list=[];
  for(const [id,name] of SATS){
    try{ const r=await fetch(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${id}&FORMAT=TLE`); if(!r.ok) continue;
      const lines=(await r.text()).trim().split(/\r?\n/).map(s=>s.trim()); const l1=lines.find(s=>s.startsWith('1 ')), l2=lines.find(s=>s.startsWith('2 '));
      if(l1&&l2) list.push({id,name,l1,l2}); }catch(e){}
  }
  if(list.length) store.set('tle',{at:Date.now(),list});
  return list;
}
function computePasses(list, lat, lon){
  if(typeof satellite==='undefined') return [];
  const gd={ latitude:lat*Math.PI/180, longitude:lon*Math.PI/180, height:0.2 };
  const out=[];
  for(const s of list){
    const rec=satellite.twoline2satrec(s.l1,s.l2);
    let cur=null;
    const t0=S.times[0]*1000, t1=S.times[71]*1000;
    for(let t=t0;t<=t1;){
      const d=new Date(t), pv=satellite.propagate(rec,d); if(!pv||!pv.position){ t+=60e3; continue; }
      const gm=satellite.gstime(d), la=satellite.ecfToLookAngles(gd, satellite.eciToEcf(pv.position,gm));
      const el=la.elevation*180/Math.PI, az=(la.azimuth*180/Math.PI+360)%360;
      if(el>10){
        const sunAlt=C.topo('Sun',d,lat,lon).alt;
        const sv=C.A.GeoVector('Sun',d,false), sl=Math.hypot(sv.x,sv.y,sv.z), su=[sv.x/sl,sv.y/sl,sv.z/sl], p=pv.position;
        const dot=p.x*su[0]+p.y*su[1]+p.z*su[2], perp=Math.hypot(p.x-dot*su[0],p.y-dot*su[1],p.z-dot*su[2]);
        const lit = !(dot<0 && perp<6371);
        const vis = lit && sunAlt<-6;
        if(!cur) cur={ sat:s.name, start:d, startAz:az, maxEl:el, maxT:d, endAz:az, end:d, visible:vis };
        if(el>cur.maxEl){ cur.maxEl=el; cur.maxT=d; }
        cur.end=d; cur.endAz=az; cur.visible = cur.visible || vis;
        t+=20e3;
      } else { if(cur){ out.push(cur); cur=null; } t+= el< -20 ? 180e3 : 30e3; }
    }
    if(cur) out.push(cur);
  }
  return out.filter(p=>p.visible).sort((a,b)=>a.start-b.start);
}
async function loadPasses(){
  const key=S.sel.lat.toFixed(2)+','+S.sel.lon.toFixed(2)+','+S.times[0];
  if(S.sat.key===key && (S.sat.passes||S.sat.err)) return;
  S.sat.key=key; S.sat.busy=true; S.sat.passes=null; S.sat.err=null;
  try{ const list=await loadTLE(); if(!list.length) throw new Error('no orbital data');
    S.sat.passes=computePasses(list,S.sel.lat,S.sel.lon); }
  catch(e){ S.sat.err='Satellite pass predictions are unavailable right now.'; }
  S.sat.busy=false; if(S.tab==='loc'){ const b=$('#pbody'), y=b.scrollTop; renderPanel(); b.scrollTop=y; }
}
function satHTML(n){
  if(!S.interests.satellites) return '';
  if(!S.sat.passes && !S.sat.err){ setTimeout(loadPasses,50); return `<div><h4>Satellite passes</h4><p class="note" style="margin:0">Calculating passes…</p></div>`; }
  if(S.sat.err) return `<div><h4>Satellite passes</h4><p class="note" style="margin:0">${esc(S.sat.err)}</p></div>`;
  const list=S.sat.passes.filter(p=>p.start>=tDate(n.start) && p.start<tDate(n.end));
  const all=S.sat.passes.length;
  return `<div><h4>Satellite passes · ${esc(nightLabel(n))}</h4>${list.length?`<ul class="tlist">${list.map(p=>`<li class="sv"><div class="info"><b>${esc(p.sat)}</b><span class="sub" style="white-space:normal">${fmtTime.format(p.start)}: rises in the ${C.compass(p.startAz)}, highest ${Math.round(p.maxEl)}° at ${fmtTime.format(p.maxT)}, sets in the ${C.compass(p.endAz)} · ${Math.max(1,Math.round((p.end-p.start)/60000))} min${p.maxEl>60?' · very bright':''}</span></div></li>`).join('')}</ul>`
    : `<p class="note" style="margin:0">No visible passes ${esc(nightLabel(n).toLowerCase())}${all?`; ${all} in the next 3 days`:''}.</p>`}
    <p class="note">Satellites shine by reflected sunlight, so only passes in a dark sky while the satellite is still sunlit are listed. Orbits from CelesTrak.</p></div>`;
}

/* --- lunar occultations for the calendar (computed once per location) --- */
S.occ = { key:'', list:null };
function occultationEvents(){
  const key=S.sel.lat.toFixed(1)+','+S.sel.lon.toFixed(1)+','+new Date().toDateString();
  if(S.occ.key===key && S.occ.list) return S.occ.list;
  if(S.occ.key!==key){ S.occ.key=key; S.occ.list=null; setTimeout(()=>{ S.occ.list=C.occultations(new Date(S.times[0]*1000),12,S.sel.lat,S.sel.lon).map(o=>({
      date:o.time, kind:'occultation', title:`The Moon covers ${o.name}`,
      note:`${o.dark?'In a dark sky':'In daylight or twilight'}, Moon ${Math.round(o.moonAlt)}° up and ${Math.round(o.illum*100)}% lit. ${/Pleiades/.test(o.name)?'The Moon slides across the cluster, hiding stars one by one.':'Watch the moment it vanishes behind the Moon’s edge, and reappears on the other side.'}${o.dark?'':' Bright planets can still be seen in a telescope before dark.'}` }));
    if(S.tab==='cal'){ const b=$('#pbody'), y=b.scrollTop; renderPanel(); b.scrollTop=y; } }, 30); }
  return [];
}

function eventsHTML(n){
  return jupiterHTML(n) + moonFeaturesHTML(n) + satHTML(n);
}
function wireEvents(b){
  const jf=$('#jupFlip'); if(jf) jf.onchange=()=>{ S.jupFlip=jf.checked; store.set('jupFlip',S.jupFlip); const y=b.scrollTop; renderPanel(); b.scrollTop=y; };
}
