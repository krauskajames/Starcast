/* Locations: place search, typed coordinates, device location, home spot, horizon profiles. */

S.search = { q:'', results:null, busy:false, err:null };

// Accepts "43.07, -89.40", "43.07 -89.40", "43.07N 89.40W", "43°4'12\"N 89°24'W"
function parseCoords(text){
  const t = text.trim().replace(/[′’']/g,"'").replace(/[″”"]/g,'"');
  const part = s => {
    const m = s.trim().match(/^([+-]?\d+(?:\.\d+)?)\s*°?\s*(?:(\d+(?:\.\d+)?)\s*'\s*)?(?:(\d+(?:\.\d+)?)\s*"\s*)?([NSEW])?$/i);
    if(!m) return null;
    let v = Math.abs(+m[1]) + (m[2]? +m[2]/60 : 0) + (m[3]? +m[3]/3600 : 0);
    if(+m[1] < 0 || /[SW]/i.test(m[4]||'')) v = -v;
    return { v, h: (m[4]||'').toUpperCase() };
  };
  let bits = t.split(/\s*[,;]\s*/);
  if(bits.length !== 2){ const m = t.match(/^(.+?[NS])\s+(.+[EW])$/i) || t.match(/^([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)$/); if(m) bits=[m[1],m[2]]; else return null; }
  const a = part(bits[0]), b = part(bits[1]); if(!a || !b) return null;
  let lat=a.v, lon=b.v;
  if(a.h==='E'||a.h==='W'||b.h==='N'||b.h==='S'){ lat=b.v; lon=a.v; }
  if(Math.abs(lat)>90 || Math.abs(lon)>180) return null;
  return { lat:+lat.toFixed(5), lon:+lon.toFixed(5) };
}
function fmtCoord(lat, lon){ return `${Math.abs(lat).toFixed(4)}°${lat>=0?'N':'S'}, ${Math.abs(lon).toFixed(4)}°${lon>=0?'E':'W'}`; }

async function runSearch(q){
  const Q = S.search; Q.q=q; Q.err=null; Q.results=null;
  const c = parseCoords(q);
  if(c){ Q.results=[{ name:'Coordinates', detail:fmtCoord(c.lat,c.lon), lat:c.lat, lon:c.lon, coords:true }]; renderPanel(); return; }
  if(q.trim().length<2){ renderPanel(); return; }
  Q.busy=true; renderPanel();
  try{
    const j = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=6&language=en&format=json`);
    Q.results = (j.results||[]).map(r=>({ name:r.name, detail:[r.admin1, r.country].filter(Boolean).join(', '), lat:r.latitude, lon:r.longitude }));
    if(!Q.results.length) Q.err='No places found. Try a town name, or type coordinates like 43.07, -89.40.';
  }catch(e){ Q.err='Place search is unavailable right now. You can still type coordinates like 43.07, -89.40.'; }
  Q.busy=false; renderPanel();
  const i=$('#placeQ'); if(i){ i.focus(); i.setSelectionRange(i.value.length,i.value.length); }
}
function useMyLocation(){
  const Q=S.search;
  if(!navigator.geolocation){ Q.err='This browser cannot share your location. Type coordinates instead.'; renderPanel(); return; }
  Q.busy=true; Q.err=null; renderPanel();
  navigator.geolocation.getCurrentPosition(pos=>{
    Q.busy=false; Q.results=null;
    selectLocation({lat:+pos.coords.latitude.toFixed(4), lon:+pos.coords.longitude.toFixed(4), name:'My location'},{fly:true,tab:'loc'});
  }, err=>{
    Q.busy=false; Q.err = err.code===1 ? 'Location access was blocked. Allow it in your browser settings, or type coordinates.' : 'Could not get your location. Type coordinates instead.'; renderPanel();
  }, {enableHighAccuracy:false, timeout:12000, maximumAge:600000});
}
function searchHTML(){
  const Q=S.search;
  let h = `<form class="row" id="placeForm" role="search" style="flex-wrap:nowrap">
    <input type="text" id="placeQ" value="${esc(Q.q)}" placeholder="Search a place or type coordinates" aria-label="Search a place or type coordinates" style="flex:1;min-width:0">
    <button class="btn" type="submit" ${Q.busy?'disabled':''}>${Q.busy?'…':'Go'}</button>
    <button class="btn ghost" type="button" id="myLoc" title="Use my current location">My location</button></form>`;
  if(Q.err) h += `<p class="note" style="margin:-10px 0 0;color:var(--warn)">${esc(Q.err)}</p>`;
  if(Q.results && Q.results.length) h += `<ul class="slist" style="margin-top:-8px">${Q.results.map((r,i)=>`<li class="sv"><div class="info"><b>${esc(r.name)}</b><span class="sub">${esc(r.detail)}${r.coords?'':' · '+fmtCoord(r.lat,r.lon)}</span></div><button class="btn" data-pick="${i}">View</button></li>`).join('')}</ul>`;
  return h;
}

/* --- home spot --- */
function homeSpot(){ return S.saved.find(x=>x.home) || null; }
function setHome(i){ S.saved.forEach((x,k)=>x.home = k===i ? !x.home : false); store.set('saved',S.saved); }

/* --- add by coordinates (Saved tab) --- */
function addLocationHTML(){
  return `<div><h4>Add a location</h4><form class="form" id="addLoc" autocomplete="off">
    <label class="f wide">Name<input type="text" id="al_name" placeholder="e.g. My Backyard"></label>
    <label class="f">Latitude<input type="text" id="al_lat" inputmode="decimal" placeholder="43.0731"></label>
    <label class="f">Longitude<input type="text" id="al_lon" inputmode="decimal" placeholder="-89.4012"></label>
    <p class="note wide" style="margin:0">Decimal degrees (west and south are negative) or degrees-minutes-seconds like 43°4'23"N and 89°24'4"W. Your phone's map app shows coordinates when you drop a pin.</p>
    <label class="checks wide" style="display:flex;gap:7px"><input type="checkbox" id="al_home"> Make this my home location (Starcast opens here)</label>
    <div class="wide row"><button class="btn primary" type="submit">Add location</button><span class="note" id="al_msg"></span></div>
  </form></div>`;
}

/* --- horizon profile for a saved spot --- */
const HZ_DIRS = ['N','NE','E','SE','S','SW','W','NW'];
function horizonHTML(saved){
  const hz = saved.horizon || [0,0,0,0,0,0,0,0];
  const pts = hz.map((a,i)=>{ const ang=(i*45-90)*Math.PI/180, r=46*(1-Math.min(a,60)/90); return [60+Math.cos(ang)*r, 60+Math.sin(ang)*r]; });
  const svg = `<svg viewBox="0 0 120 120" width="120" height="120" role="img" aria-label="Horizon profile preview">
    <circle cx="60" cy="60" r="46" fill="var(--raise)" stroke="var(--line-2)"/>
    <circle cx="60" cy="60" r="30.7" fill="none" stroke="var(--line)" stroke-dasharray="2 3"/>
    <polygon points="${pts.map(p=>p.map(v=>v.toFixed(1)).join(',')).join(' ')}" fill="var(--accent)" fill-opacity=".18" stroke="var(--accent)"/>
    ${HZ_DIRS.filter((d,i)=>i%2===0).map((d,i)=>{ const ang=(i*90-90)*Math.PI/180; return `<text x="${(60+Math.cos(ang)*55).toFixed(1)}" y="${(60+Math.sin(ang)*55+3.5).toFixed(1)}" text-anchor="middle" font-size="9" fill="var(--muted)">${d}</text>`; }).join('')}
  </svg>`;
  return `<details ${S.hzOpen?'open':''} id="hzBox"><summary class="sub" style="cursor:pointer">Your horizon: ${hz.some(a=>a>0)?'trees and buildings set':'flat (not set yet)'}</summary>
    <div class="row" style="align-items:flex-start;gap:14px;margin-top:8px;flex-wrap:wrap">${svg}
    <form id="hzForm" class="form" style="flex:1;min-width:200px;grid-template-columns:repeat(4,1fr)">${HZ_DIRS.map((d,i)=>`<label class="f">${d}<input type="number" id="hz_${i}" data-hz="${i}" min="0" max="60" step="1" value="${hz[i]}" style="width:100%"></label>`).join('')}</form></div>
    <p class="note" style="margin:6px 0 0">How high, in degrees, trees or buildings block the sky in each direction. A fist held at arm's length covers about 10°. Starcast then waits until targets clear your horizon.</p></details>`;
}

function wireLocations(b){
  const pf=$('#placeForm'); if(pf) pf.onsubmit=e=>{ e.preventDefault(); runSearch($('#placeQ').value); };
  const ml=$('#myLoc'); if(ml) ml.onclick=useMyLocation;
  b.querySelectorAll('[data-pick]').forEach(x=>x.onclick=()=>{ const r=S.search.results[+x.dataset.pick]; S.search.results=null; S.search.q='';
    selectLocation({lat:r.lat, lon:r.lon, name: r.coords ? null : r.name},{fly:true,tab:'loc'}); });
  const al=$('#addLoc'); if(al) al.onsubmit=e=>{ e.preventDefault();
    const c = parseCoords($('#al_lat').value+', '+$('#al_lon').value), msg=$('#al_msg');
    if(!c){ msg.textContent='Check the coordinates: latitude −90 to 90, longitude −180 to 180.'; msg.style.color='var(--bad)'; return; }
    const nm=$('#al_name').value.trim()||'My spot', lp=C.lightPollution(c.lat,c.lon);
    S.saved.push({name:nm, lat:c.lat, lon:c.lon, bortle: lp?lp.bortle:S.defBortle, alerts:true});
    if($('#al_home').checked) setHome(S.saved.length-1);
    store.set('saved',S.saved); toast(`Added “${nm}”`);
    selectLocation({lat:c.lat, lon:c.lon, name:nm},{fly:true,tab:'loc'}); };
  b.querySelectorAll('[data-home]').forEach(x=>x.onclick=()=>{ setHome(+x.dataset.home); renderPanel(); render(); });
  const hb=$('#hzBox'); if(hb) hb.addEventListener('toggle',()=>{ S.hzOpen=hb.open; });
  const hf=$('#hzForm'); if(hf) hf.addEventListener('change',()=>{ const s=S.saved.find(x=>near(x,S.sel)); if(!s) return;
    s.horizon = HZ_DIRS.map((d,i)=>clamp(parseFloat($('#hz_'+i).value)||0,0,60)); store.set('saved',S.saved); S.eval=null; S.hzOpen=true;
    const y=b.scrollTop; renderPanel(); b.scrollTop=y; });
}
