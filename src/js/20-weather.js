/* Weather data for North America (contiguous US, Alaska, Canada).
   Open-Meteo's free tier allows 600 calls a minute, 5,000 an hour and 10,000 a day, and a
   request for many places counts once per place. So Starcast keeps a running budget below
   those limits, loads a light continental grid first, adds detail only for the area you
   zoom into, and caches everything in the browser (IndexedDB) for 90 minutes.
   If data can't be loaded, the map shows no weather rather than made-up weather. */

const VARS = ['cloud_cover','cloud_cover_high','relative_humidity_2m','dew_point_2m','temperature_2m','wind_speed_10m','wind_speed_250hPa','wind_speed_500hPa'];
const KEYS = ['cloud','hcloud','rh','td','temp','w10','j250','w500'];
const API = 'https://api.open-meteo.com/v1/forecast';
const CACHE_MS = 120*60e3;
const DEMO = /[?&]demo\b/.test(location.search); // sample weather only when asked for (testing)
function omURL(lats, lons, days){
  return `${API}?latitude=${lats.join(',')}&longitude=${lons.join(',')}&hourly=${VARS.join(',')}&forecast_days=${days||4}&timeformat=unixtime&timezone=GMT`;
}
async function getJSON(url, signal){
  const r = await fetch(url, {signal});
  if(!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}

/* --- Open-Meteo budget: stay well under the free limits --- */
const LIMITS = { minute:420, hour:3800, day:8500 };
const OM = { use: store.get('omUse', []), blockedUntil: store.get('omBlocked', 0), reason:'' };
function omUsed(ms){ const t=Date.now()-ms; return OM.use.reduce((s,u)=>u[0]>t?s+u[1]:s,0); }
function omWait(w){
  // milliseconds until w more weighted calls fit inside all three windows (0 = now)
  if(Date.now() < OM.blockedUntil) return OM.blockedUntil-Date.now();
  if(omUsed(864e5)+w > LIMITS.day) return -1;
  if(omUsed(36e5)+w > LIMITS.hour) return 10*60e3;
  if(omUsed(6e4)+w > LIMITS.minute) return 62e3;
  return 0;
}
function omSpend(w){ const now=Date.now(); OM.use = OM.use.filter(u=>u[0]>now-864e5); OM.use.push([now, Math.round(w*10)/10]); store.set('omUse', OM.use); }
class RateLimited extends Error { constructor(until, reason){ super(reason); this.until=until; } }
// weight per Open-Meteo: places × (variables / 10), minimum one week of data
async function omGet(url, places, nVars, signal){
  const w = places * Math.max(1, nVars/10); // counted conservatively: at least one call per place
  const wait = omWait(w);
  if(wait !== 0) throw new RateLimited(wait<0 ? nextUtcMidnight() : Date.now()+wait, wait<0 ? 'daily' : 'budget');
  omSpend(w);
  const r = await fetch(url, {signal});
  if(r.status === 429){
    let reason=''; try{ reason=(await r.json()).reason||''; }catch(e){}
    const until = /daily/i.test(reason) ? nextUtcMidnight() : /hour/i.test(reason) ? Date.now()+ (60-new Date().getMinutes())*60e3 + 30e3 : Date.now()+65e3;
    OM.blockedUntil = until; OM.reason = reason; store.set('omBlocked', until);
    throw new RateLimited(until, reason || 'rate limit');
  }
  if(!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}
function nextUtcMidnight(){ const d=new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()+1) + 60e3; }

/* --- land mask: US states (detailed) + Canada --- */
const US_STATES = topojson.feature(GEO.states, GEO.states.objects.states).features;
const CANADA = topojson.feature(GEO.countries, GEO.countries.objects.countries).features.find(f=>f.id==='124');
const NA_MASK = { type:'FeatureCollection', features: US_STATES.concat(CANADA ? [CANADA] : []) };
const landMemo = new Map();
const MASK_BOUNDS = NA_MASK.features.map(f => d3.geoBounds(f));
function inNA(lat, lon){
  const k = (Math.round(lat*10))+':'+(Math.round(lon*10));
  if(landMemo.has(k)) return landMemo.get(k);
  const v = NA_MASK.features.some((f,i) => { const b=MASK_BOUNDS[i];
    const inLon = b[0][0] <= b[1][0] ? (lon>=b[0][0]-0.01 && lon<=b[1][0]+0.01) : (lon>=b[0][0]-0.01 || lon<=b[1][0]+0.01);
    return lat>=b[0][1]-0.01 && lat<=b[1][1]+0.01 && inLon && d3.geoContains(f, [lon, lat]); });
  landMemo.set(k, v); return v;
}
function nearNA(lat, lon, dLat, dLon){
  return inNA(lat,lon) || inNA(lat+dLat*.6,lon) || inNA(lat-dLat*.6,lon) || inNA(lat,lon+dLon*.6) || inNA(lat,lon-dLon*.6);
}

/* --- grid layers --- */
const COARSE = { id:'coarse3', lat0:24, lon0:-168, dLat:3, dLon:3.5, nLat:17, nLon:34 };
const TILE_DEG = 5, FINE = 0.5;
function tileSpec(lat, lon){
  const la = Math.floor(lat/TILE_DEG)*TILE_DEG, lo = Math.floor(lon/TILE_DEG)*TILE_DEG;
  return { id:`t${la}_${lo}`, lat0:la, lon0:lo, dLat:FINE, dLon:FINE, nLat:TILE_DEG/FINE+1, nLon:TILE_DEG/FINE+1 };
}
const WX = { coarse:null, tiles:new Map(), pending:new Map(), at:0, error:null };

function specPoints(spec){
  const pts=[], idx=new Int32Array(spec.nLat*spec.nLon).fill(-1);
  for(let i=0;i<spec.nLat;i++) for(let j=0;j<spec.nLon;j++){
    const lat = spec.lat0+i*spec.dLat, lon = spec.lon0+j*spec.dLon;
    if(lat>72 || !nearNA(lat,lon,spec.dLat,spec.dLon)) continue;
    idx[i*spec.nLon+j]=pts.length; pts.push([+lat.toFixed(3), +lon.toFixed(3)]);
  }
  return {pts, idx};
}
function deriveLayer(L){
  const n = L.nT*L.np; L.f.seeing=new Float32Array(n); L.f.transp=new Float32Array(n);
  for(let k=0;k<n;k++){ L.f.seeing[k]=C.estSeeing(L.f.j250[k],L.f.w500[k],L.f.w10[k]); L.f.transp[k]=C.estTransparency(L.f.hcloud[k],L.f.rh[k],null); }
}
const CHUNK = 50;
function newLayer(spec){
  const {pts, idx} = specPoints(spec);
  const L = Object.assign({}, spec, { idx, np:pts.length, pts, t0:0, nT:0, f:{}, at:Date.now(), todo:[] });
  for(let s=0;s<pts.length;s+=CHUNK) L.todo.push(s);
  if(!pts.length) L.empty=true;
  return L;
}
// fetch the chunks still missing; stops early (keeping what it has) if the budget runs out
async function fillLayer(L){
  if(L.empty) return L;
  if(DEMO) return demoLayer(L);
  while(L.todo.length){
    const s=L.todo[0], ch=L.pts.slice(s,s+CHUNK);
    const res = await omGet(omURL(ch.map(p=>p[0]), ch.map(p=>p[1])), ch.length, VARS.length);
    const list = Array.isArray(res)?res:[res];
    if(list.length!==ch.length) throw new Error('unexpected response size');
    if(!L.nT){ const times=list[0].hourly.time; L.t0=times[0]; L.nT=times.length; KEYS.forEach(k=>{ L.f[k]=new Float32Array(L.nT*L.np).fill(NaN); }); }
    list.forEach((r,q)=>{ const p=s+q; KEYS.forEach((k,vi)=>{ const arr=r.hourly[VARS[vi]], a=L.f[k]; for(let t=0;t<L.nT;t++){ const v=arr[t]; a[t*L.np+p]= v==null?NaN:v; } }); });
    L.todo.shift();
  }
  deriveLayer(L); L.at=Date.now();
  return L;
}
function demoLayer(L){
  L.t0 = Math.floor(Date.now()/86400000)*86400; L.nT=96; L.todo=[];
  KEYS.forEach(k=>L.f[k]=new Float32Array(L.nT*L.np));
  L.pts.forEach(([lat,lon],p)=>{ for(let t=0;t<L.nT;t++){ const k=t*L.np+p, x=lon/12, y=lat/9, tt=(L.t0+t*3600)/3600;
    const band=Math.sin(x*2.2 - tt/16)*Math.cos(y*1.4 + tt/40);
    L.f.cloud[k]=clamp(50+70*band+15*Math.sin(tt/5+x*9),0,100); L.f.hcloud[k]=clamp(30+50*Math.sin(tt/9+y*4),0,100);
    L.f.rh[k]=clamp(65+25*Math.sin(tt/12*Math.PI+x*3),20,100); L.f.temp[k]=18-(lat-30)*0.7+6*Math.sin((tt%24-14)/24*2*Math.PI);
    L.f.td[k]=L.f.temp[k]-(2+18*(1-L.f.rh[k]/100)); L.f.w10[k]=8+14*Math.abs(Math.sin(tt/14+x*2));
    L.f.j250[k]=90+110*Math.abs(Math.sin(tt/20+y*2-x)); L.f.w500[k]=40+50*Math.abs(Math.sin(tt/18+y)); } });
  deriveLayer(L); return L;
}

/* --- IndexedDB cache --- */
let idbP=null;
function idb(){ if(idbP) return idbP; idbP=new Promise(res=>{ try{ const r=indexedDB.open('starcast',1); r.onupgradeneeded=()=>r.result.createObjectStore('wx'); r.onsuccess=()=>res(r.result); r.onerror=()=>res(null); }catch(e){ res(null); } }); return idbP; }
async function cacheGet(key){ const db=await idb(); if(!db) return null; return new Promise(res=>{ try{ const q=db.transaction('wx').objectStore('wx').get(key); q.onsuccess=()=>res(q.result||null); q.onerror=()=>res(null);}catch(e){res(null);} }); }
async function cachePut(key, val){ const db=await idb(); if(!db) return; try{ const v=Object.assign({},val); delete v.pts; db.transaction('wx','readwrite').objectStore('wx').put(v,key); }catch(e){} }
function usable(L){ return L && (L.empty || (!(L.todo&&L.todo.length) && Date.now()-L.at < CACHE_MS && L.t0 <= S.times[0] && L.t0+(L.nT-1)*3600 >= S.times[71])); }

let coarseRetry=null;
async function loadCoarse(force){
  clearTimeout(coarseRetry);
  if(!force && !WX.coarse){ const c=await cacheGet(COARSE.id); if(usable(c)){ WX.coarse=c; WX.at=c.at; WX.error=null; afterCoarse(); return; } }
  setStatus('loading','Loading forecast…');
  const L = (WX.coarse && WX.coarse.todo && WX.coarse.todo.length && !force) ? Object.assign(WX.coarse, specPoints(COARSE)) : newLayer(COARSE);
  try{
    await fillLayer(L);
    WX.coarse=L; WX.at=L.at; WX.error=null; if(!DEMO) cachePut(COARSE.id,L); afterCoarse();
  }catch(err){
    console.warn('Forecast loading stopped:', err);
    if(L.nT) WX.coarse=L; // keep whatever arrived
    if(err instanceof RateLimited){
      WX.error={kind:'limit', until:err.until};
      const when=fmtTime.format(new Date(err.until));
      setStatus('demo', err.until-Date.now() > 3*3600e3 ? `Daily forecast limit reached; more data after ${when}` : `Pausing to stay within the free forecast limit; continuing at ${when}`);
      coarseRetry=setTimeout(()=>loadCoarse(false), Math.max(5e3, err.until-Date.now()+2e3));
    } else {
      WX.error={kind:'network'};
      setStatus('demo', 'Can’t reach the forecast service right now');
      coarseRetry=setTimeout(()=>loadCoarse(false), 5*60e3);
    }
    S.grid = WX.coarse && WX.coarse.nT ? WX.coarse : null;
    S.eval=null; render(); drawBand();
    if(S.tab==='loc') renderPanel();
  }
}
function afterCoarse(){
  S.grid = WX.coarse;
  setStatus('live', DEMO ? 'Sample weather (demo mode)' : `Live forecast · updated ${fmtTime.format(new Date(WX.at))}`);
  S.eval=null; render(); drawBand(); selectLocation(S.sel, {fly:false, keepView:true});
  scheduleTiles();
}
async function loadTile(spec){
  if(WX.tiles.has(spec.id) && usable(WX.tiles.get(spec.id))) return WX.tiles.get(spec.id);
  if(WX.pending.has(spec.id)) return WX.pending.get(spec.id);
  const job=(async()=>{
    let L = DEMO ? null : await cacheGet(spec.id);
    if(!usable(L)){
      L = WX.tiles.get(spec.id); if(!L || !L.todo || !L.todo.length) L=newLayer(spec); else Object.assign(L, specPoints(spec));
      try{ await fillLayer(L); if(!DEMO) cachePut(spec.id,L); }
      catch(e){ if(!(e instanceof RateLimited)) console.warn('tile failed',spec.id,e); if(!L.nT) L=null; }
    }
    if(L) WX.tiles.set(spec.id,L);
    WX.pending.delete(spec.id);
    return L;
  })();
  WX.pending.set(spec.id, job);
  return job;
}
async function ensureTilesAround(lat, lon, km){
  const dLat=km/111, dLon=km/(111*Math.max(0.2,Math.cos(lat*Math.PI/180))), want=new Map();
  for(let la=lat-dLat; la<=lat+dLat+TILE_DEG; la+=TILE_DEG) for(let lo=lon-dLon; lo<=lon+dLon+TILE_DEG; lo+=TILE_DEG){
    const sp=tileSpec(Math.min(la,lat+dLat), Math.min(lo,lon+dLon)); want.set(sp.id,sp); }
  for(const sp of want.values()) await loadTile(sp); // one at a time keeps within the per-minute limit
}
let tileTimer=null;
function scheduleTiles(){ clearTimeout(tileTimer); tileTimer=setTimeout(loadVisibleTiles, 700); }
async function loadVisibleTiles(){
  if(!WX.coarse || DEMO && false || proj.scale() < baseScale*5) return;
  const c=proj.invert([W/2,H/2]); if(!c) return;
  const want=new Map();
  for(let i=0;i<=6;i++) for(let j=0;j<=6;j++){
    const ll=proj.invert([W*j/6, H*i/6]); if(!ll||isNaN(ll[0])||!visiblePt(ll)) continue;
    if(ll[1]<24||ll[1]>72||ll[0]<-170||ll[0]>-50) continue;
    const sp=tileSpec(ll[1],ll[0]); if(!want.has(sp.id)) want.set(sp.id,{sp,d:d3.geoDistance(ll,c)});
  }
  const list=[...want.values()].sort((a,b)=>a.d-b.d).slice(0,4).map(x=>x.sp).filter(sp=>!(WX.tiles.has(sp.id)&&usable(WX.tiles.get(sp.id))));
  for(const sp of list){ if(omWait(60)!==0) break; await loadTile(sp); render(); }
}

/* --- reading values --- */
// value of one grid point (NaN when missing or not loaded)
function gridPoint(L, a, base, i, j){
  if(i<0||j<0||i>=L.nLat||j>=L.nLon) return NaN;
  const p=L.idx[i*L.nLon+j]; return p<0 ? NaN : a[base+p];
}
const cr = (p0,p1,p2,p3,t) => p1 + 0.5*t*(p2-p0 + t*(2*p0-5*p1+4*p2-p3 + t*(3*(p1-p2)+p3-p0)));
function layerValue(L, key, t, lat, lon){
  if(!L || L.empty || !L.f[key] || !L.nT) return NaN;
  const tt = t + Math.round((S.times[0]-L.t0)/3600);
  if(tt<0 || tt>=L.nT) return NaN;
  const fi=(lat-L.lat0)/L.dLat, fj=(lon-L.lon0)/L.dLon;
  if(fi<0||fj<0||fi>L.nLat-1||fj>L.nLon-1) return NaN;
  const i=Math.min(Math.floor(fi),L.nLat-2), j=Math.min(Math.floor(fj),L.nLon-2), di=fi-i, dj=fj-j, a=L.f[key], b=tt*L.np;
  // smooth (Catmull-Rom) interpolation over the 4x4 neighbourhood when it is complete
  const g=[]; let full=true;
  for(let m=-1;m<=2&&full;m++){ const row=[]; for(let n=-1;n<=2;n++){ const v=gridPoint(L,a,b,i+m,j+n); if(isNaN(v)){ full=false; break; } row.push(v); } g.push(row); }
  if(full){
    const rows=g.map(r=>cr(r[0],r[1],r[2],r[3],dj));
    const v=cr(rows[0],rows[1],rows[2],rows[3],di);
    const lo=Math.min(g[1][1],g[1][2],g[2][1],g[2][2]), hi=Math.max(g[1][1],g[1][2],g[2][1],g[2][2]);
    return Math.max(lo, Math.min(hi, v)); // no overshoot beyond the surrounding values
  }
  // near edges or gaps: bilinear over the corners that exist
  let s2=0, w=0;
  const add=(ii,jj,wt)=>{ const v=gridPoint(L,a,b,ii,jj); if(isNaN(v)||wt<=0) return; s2+=v*wt; w+=wt; };
  add(i,j,(1-di)*(1-dj)); add(i,j+1,(1-di)*dj); add(i+1,j,di*(1-dj)); add(i+1,j+1,di*dj);
  return w>0 ? s2/w : NaN;
}
const tileReady = T => T && !T.empty && T.nT && !(T.todo && T.todo.length) && T.f.seeing;
// how far (0..1) to trust the detail tile here: fades out over 1 degree toward edges
// that have no finished neighbouring tile, so detail blends into the continental grid
function tileTrust(T, lat, lon){
  const F=1.0, sides=[
    [lat-T.lat0, tileSpec(T.lat0-0.1, lon)], [T.lat0+TILE_DEG-lat, tileSpec(T.lat0+TILE_DEG+0.1, lon)],
    [lon-T.lon0, tileSpec(lat, T.lon0-0.1)], [T.lon0+TILE_DEG-lon, tileSpec(lat, T.lon0+TILE_DEG+0.1)] ];
  let w=1;
  for(const [d,sp] of sides){ if(d>=F) continue; if(tileReady(WX.tiles.get(sp.id))) continue; w=Math.min(w, Math.max(0,d/F)); }
  return w*w*(3-2*w);
}
// detail=false gives the smooth continental view (used when zoomed out)
const PCT = new Set(['cloud','hcloud','rh']);
function gridVal(key, t, lat, lon, detail){
  const v = gridValRaw(key, t, lat, lon, detail);
  return PCT.has(key) ? Math.min(100, Math.max(0, v)) : v; // blending can overshoot 100% by a rounding hair
}
function gridValRaw(key, t, lat, lon, detail){
  const base = layerValue(WX.coarse,key,t,lat,lon);
  if(detail===false) return base;
  const tile = WX.tiles.get(tileSpec(lat,lon).id);
  if(!tileReady(tile)) return base;
  const v=layerValue(tile,key,t,lat,lon); if(isNaN(v)) return base;
  if(isNaN(base)) return v;
  const w=tileTrust(tile,lat,lon);
  return base*(1-w) + v*w;
}
function setStatus(kind, text){
  const el = $('#status'); el.className = 'status '+kind;
  el.innerHTML = `<span class="dot"></span><span>${esc(text)}</span>` + (kind==='live' ? ` <button id="refreshBtn" type="button">Refresh</button>` : '');
  const b = $('#refreshBtn'); if(b) b.onclick = () => { WX.tiles.clear(); loadCoarse(true); };
}

/* --- light pollution: cached tiles of the city-glow model --- */
const LP = new Map();
function lpTile(lat, lon, res){
  const size = res>=0.2 ? 10 : 2, la=Math.floor(lat/size)*size, lo=Math.floor(lon/size)*size, key=`${res}:${la}:${lo}`;
  let t=LP.get(key); if(t) return t;
  const n=Math.round(size/res)+1, a=new Float32Array(n*n);
  for(let i=0;i<n;i++) for(let j=0;j<n;j++) a[i*n+j]=21.95-2.5*Math.log10(1+C.skyGlow(la+i*res, lo+j*res));
  t={la,lo,res,n,a}; LP.set(key,t); return t;
}
function lpVal(lat, lon, res){
  if(!C.inLPBox(lat,lon)) return NaN;
  const t=lpTile(lat,lon,res||0.05), fi=(lat-t.la)/t.res, fj=(lon-t.lo)/t.res;
  const i=Math.min(Math.floor(fi),t.n-2), j=Math.min(Math.floor(fj),t.n-2), di=fi-i, dj=fj-j, a=t.a, n=t.n;
  return (a[i*n+j]*(1-dj)+a[i*n+j+1]*dj)*(1-di) + (a[(i+1)*n+j]*(1-dj)+a[(i+1)*n+j+1]*dj)*di;
}
