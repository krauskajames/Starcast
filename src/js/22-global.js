/* Worldwide weather: NOAA GFS forecasts published with the site (data/wx/), refreshed
   every 6 hours by .github/workflows/site.yml (pipeline/gfs.py). One file per 3-hour
   step, 1° grid, one byte per value. This is the base layer everywhere; Open-Meteo still
   supplies spot forecasts and the zoomed-in detail tiles, which blend in on top.
   If the files can't be loaded (opened from disk, old browser), the North American
   Open-Meteo grid is used instead. */
const GLOBAL_BASE = 'data/wx/';
const GL = { man:null, raw:new Map(), dec:new Map(), ready:false, failed:false, job:null, checked:0 };
const GL_KEEP = 6; // decoded steps kept in memory

async function glFetchStep(man, name){
  const key = 'gfs:'+name;
  const n = man.grid.nLat*man.grid.nLon*man.channels.length;
  const hit = await cacheGet(key);
  if(hit && hit.b && hit.b.length===n) return hit.b;
  const r = await fetch(GLOBAL_BASE+name);
  if(!r.ok) throw new Error('HTTP '+r.status);
  let buf = new Uint8Array(await r.arrayBuffer());
  if(buf[0]===0x1f && buf[1]===0x8b){ // gzip (unless the server already unpacked it)
    const st = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    buf = new Uint8Array(await new Response(st).arrayBuffer());
  }
  if(buf.length !== n) throw new Error('unexpected size');
  cachePut(key, {b:buf});
  return buf;
}
async function glPrune(cycle){
  const db=await idb(); if(!db) return;
  try{ const st=db.transaction('wx','readwrite').objectStore('wx'), q=st.getAllKeys();
    q.onsuccess=()=>q.result.forEach(k=>{ if(typeof k==='string' && k.startsWith('gfs:') && !k.startsWith('gfs:'+cycle+'/')) st.delete(k); }); }catch(e){}
}
// hours after the run's start time for map hour t
const glHours = (t, man) => (S.times[t] - (man||GL.man).t0)/3600;
function glCovers(m){ // does the run reach far enough ahead to be the map's base?
  if(!m) return false;
  const end = m.t0 + m.hours[m.hours.length-1]*3600;
  return m.t0 <= S.times[0] + 3*3600 && end >= S.times[0] + 48*3600;
}
function loadGlobal(force){
  if(GL.job) return GL.job;
  if(typeof DecompressionStream==='undefined' || DEMO){ GL.failed=true; return Promise.resolve(false); }
  GL.job = loadGlobalNow(force).finally(()=>{ GL.job=null; });
  return GL.job;
}
async function loadGlobalNow(force){
  try{
    const r = await fetch(GLOBAL_BASE+'manifest.json', {cache:'no-cache'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const man = await r.json();
    GL.checked = Date.now();
    if(!man || man.v!==1 || !man.files || !man.grid || !man.channels) throw new Error('bad manifest');
    if(!glCovers(man)) throw new Error('published run is out of date');
    const fresh = !GL.man || GL.man.cycle !== man.cycle;
    const raw = fresh ? new Map() : GL.raw;
    let live = !fresh;
    // the steps around now first, so the map shows weather quickly; the rest follow.
    // A new run replaces the old one only once its first steps are in, so the map never goes blank.
    const now = glHours(0, man) / (man.dt/3600), first = [Math.floor(now), Math.min(Math.ceil(now), man.files.length-1)];
    const order = man.files.map((f,i)=>i).sort((a,b)=>Math.abs(a-now-0.5)-Math.abs(b-now-0.5));
    for(const i of order){
      if(man.t0 + man.hours[i]*3600 < S.times[0] - man.dt) continue; // already past
      if(!raw.has(i)) raw.set(i, await glFetchStep(man, man.files[i]));
      if(!live && first.every(j=>raw.has(j))){
        live = true;
        GL.man = man; GL.raw = raw; GL.dec = new Map(); glPrune(man.cycle);
        if(!GL.ready){ GL.ready = true; afterGlobal(); } else { afterGlobal(); }
      } else if(live && glShowing(man, i)) render();
    }
    GL.failed = false;
  }catch(e){
    console.warn('Worldwide forecast not available:', e.message);
    if(!GL.ready) GL.failed = true;
  }
  if(GL.ready){ S.eval=null; render(); drawBand(); if(S.tab==='loc') renderPanel(); }
  return GL.ready;
}
// is step i one of the two the map is showing right now?
function glShowing(man, i){ const x=glHours(S.ti, man)/(man.dt/3600); return i===Math.floor(x) || i===Math.ceil(x); }
function afterGlobal(){
  S.grid = GL; buildLayers();
  WX.at = Date.parse(GL.man.made) || Date.now(); WX.error = null;
  clearTimeout(coarseRetry);
  setStatus('live', `Live forecast · NOAA GFS, updated ${fmtTime.format(new Date(WX.at))}`);
  S.eval=null; render(); drawBand(); selectLocation(S.sel, {fly:false, keepView:true});
  scheduleTiles();
}
// all channels of one step as numbers (NaN = missing), plus the values Starcast derives
function glStep(i){
  let d = GL.dec.get(i); if(d) return d;
  const b = GL.raw.get(i); if(!b) return null;
  const m = GL.man, n = m.grid.nLat*m.grid.nLon; d = {};
  m.channels.forEach((c,k)=>{ const a=new Float32Array(n); for(let p=0;p<n;p++){ const v=b[k*n+p]; a[p] = v===255 ? NaN : c.offset + v*c.scale; } d[c.key]=a; });
  d.td = new Float32Array(n); d.seeing = new Float32Array(n); d.transp = new Float32Array(n);
  for(let p=0;p<n;p++){
    d.td[p] = d.temp[p] - d.spread[p];
    d.seeing[p] = C.estSeeing(d.j250[p], d.w500[p], d.w10[p]);
    d.transp[p] = C.estTransparency(d.hcloud[p], d.rh[p], null);
  }
  GL.dec.set(i, d);
  if(GL.dec.size > GL_KEEP) GL.dec.delete(GL.dec.keys().next().value);
  return d;
}
// smooth value at one step: Catmull-Rom over 4×4 points, wrapping around in longitude
function glSpace(a, lat, lon){
  const g = GL.man.grid;
  const fi = (lat-g.lat0)/g.d, fj = (((lon-g.lon0)%360)+360)%360/g.d;
  const i = Math.min(Math.floor(fi), g.nLat-2), j = Math.floor(fj), di = fi-i, dj = fj-j;
  const at = (ii,jj) => a[Math.max(0,Math.min(g.nLat-1,ii))*g.nLon + ((jj%g.nLon)+g.nLon)%g.nLon];
  const rows=[]; let ok=true;
  for(let m=-1;m<=2;m++){ const r=[at(i+m,j-1),at(i+m,j),at(i+m,j+1),at(i+m,j+2)]; if(r.some(isNaN)){ ok=false; break; } rows.push(cr(r[0],r[1],r[2],r[3],dj)); }
  const c00=at(i,j), c01=at(i,j+1), c10=at(i+1,j), c11=at(i+1,j+1);
  if(ok){
    const v=cr(rows[0],rows[1],rows[2],rows[3],di);
    return Math.max(Math.min(c00,c01,c10,c11), Math.min(Math.max(c00,c01,c10,c11), v));
  }
  let s=0,w=0; [[c00,(1-di)*(1-dj)],[c01,(1-di)*dj],[c10,di*(1-dj)],[c11,di*dj]].forEach(([v,wt])=>{ if(!isNaN(v)&&wt>0){ s+=v*wt; w+=wt; } });
  return w>0 ? s/w : NaN;
}
// value for map hour t, interpolated between the 3-hourly steps
function globalValue(key, t, lat, lon){
  if(!GL.ready || !GL.man || t<0 || t>=S.times.length) return NaN;
  const x = glHours(t) / (GL.man.dt/3600);
  if(x < 0 || x > GL.man.files.length-1) return NaN;
  const i0 = Math.floor(x), i1 = Math.min(i0+1, GL.man.files.length-1), f = x-i0;
  const d0 = glStep(i0); if(!d0 || !d0[key]) return NaN;
  const v0 = glSpace(d0[key], lat, lon);
  if(f < 1e-6 || i1===i0) return v0;
  const d1 = glStep(i1); if(!d1) return v0;
  const v1 = glSpace(d1[key], lat, lon);
  return isNaN(v1) ? v0 : isNaN(v0) ? v1 : v0 + (v1-v0)*f;
}
// start-up and hourly refresh: worldwide files first, the North American grid only as a fallback
async function refreshWeather(force){
  if(force) WX.tiles.clear();
  const ok = await loadGlobal(force);
  if(!ok) loadCoarse(force);
  else scheduleTiles();
}

/* --- land mask for the whole world (detail tiles skip open ocean to save requests) --- */
// A 0.25° land raster drawn once from the 1:50m land polygons (a lookup is then instant)
let LAND_MASK = null;
function landMask(){
  if(LAND_MASK) return LAND_MASK;
  const w=1440, h=720, cv=document.createElement('canvas'); cv.width=w; cv.height=h;
  const cx=cv.getContext('2d', {willReadFrequently:true});
  const pr=d3.geoEquirectangular().scale(w/(2*Math.PI)).translate([w/2,h/2]);
  cx.fillStyle='#000'; cx.beginPath(); d3.geoPath(pr, cx)(land); cx.fill();
  const px=cx.getImageData(0,0,w,h).data, m=new Uint8Array(w*h);
  for(let i=0;i<m.length;i++) m[i]=px[i*4+3]>100?1:0;
  LAND_MASK={w,h,m}; return LAND_MASK;
}
function inLand(lat, lon){
  if(inNA(lat,lon)) return true; // the detailed US states and Canada outline
  const L=landMask(), x=Math.floor(((((lon+180)%360)+360)%360)/360*L.w), y=Math.floor((90-lat)/180*L.h);
  return !!L.m[Math.max(0,Math.min(L.h-1,y))*L.w + Math.min(L.w-1,x)];
}
function nearLand(lat, lon, dLat, dLon){
  return inLand(lat,lon) || inLand(lat+dLat*.6,lon) || inLand(lat-dLat*.6,lon) || inLand(lat,lon+dLon*.6) || inLand(lat,lon-dLon*.6);
}
