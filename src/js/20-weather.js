/* Weather data for North America (contiguous US, Alaska, Canada).
   A coarse continental grid loads first; detailed 0.5-degree tiles load for whatever
   region you zoom into. Everything is cached in the browser (IndexedDB) for 90 minutes. */

const VARS = ['cloud_cover','cloud_cover_high','relative_humidity_2m','dew_point_2m','temperature_2m','wind_speed_10m','wind_speed_250hPa','wind_speed_500hPa'];
const KEYS = ['cloud','hcloud','rh','td','temp','w10','j250','w500'];
const API = 'https://api.open-meteo.com/v1/forecast';
const CACHE_MS = 90*60e3;
function omURL(lats, lons, days){
  return `${API}?latitude=${lats.join(',')}&longitude=${lons.join(',')}&hourly=${VARS.join(',')}&forecast_days=${days||4}&timeformat=unixtime&timezone=GMT`;
}
async function getJSON(url, signal){
  const r = await fetch(url, {signal});
  if(!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}

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
const COARSE = { id:'coarse', lat0:24, lon0:-170, dLat:2.5, dLon:3, nLat:20, nLon:40 };
const TILE_DEG = 5, FINE = 0.5;
function tileSpec(lat, lon){
  const la = Math.floor(lat/TILE_DEG)*TILE_DEG, lo = Math.floor(lon/TILE_DEG)*TILE_DEG;
  return { id:`t${la}_${lo}`, lat0:la, lon0:lo, dLat:FINE, dLon:FINE, nLat:TILE_DEG/FINE+1, nLon:TILE_DEG/FINE+1 };
}
const WX = { coarse:null, tiles:new Map(), pending:new Map(), demo:false, at:0 };

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
async function fetchLayer(spec){
  const {pts, idx} = specPoints(spec);
  const L = Object.assign({}, spec, { idx, np:pts.length, t0:0, nT:0, f:{}, at:Date.now() });
  if(!pts.length){ L.empty=true; return L; }
  if(WX.demo) return demoLayer(L, pts);
  const B=60, chunks=[];
  for(let s=0;s<pts.length;s+=B) chunks.push(pts.slice(s,s+B));
  const results=[];
  for(let c=0;c<chunks.length;c+=3){ // at most 3 requests at a time
    const part = await Promise.all(chunks.slice(c,c+3).map(ch=>getJSON(omURL(ch.map(p=>p[0]), ch.map(p=>p[1])))));
    part.forEach(p=>results.push(...(Array.isArray(p)?p:[p])));
  }
  if(results.length!==pts.length) throw new Error('unexpected response size');
  const times = results[0].hourly.time; L.t0=times[0]; L.nT=times.length;
  KEYS.forEach((k,vi)=>{ const a=new Float32Array(L.nT*L.np);
    results.forEach((r,p)=>{ const arr=r.hourly[VARS[vi]]; for(let t=0;t<L.nT;t++){ const v=arr[t]; a[t*L.np+p]= v==null?NaN:v; } });
    L.f[k]=a; });
  deriveLayer(L);
  return L;
}
function demoLayer(L, pts){
  // moving cloud bands so the interface can be explored offline
  L.t0 = Math.floor(Date.now()/86400000)*86400; L.nT=96;
  KEYS.forEach(k=>L.f[k]=new Float32Array(L.nT*L.np));
  pts.forEach(([lat,lon],p)=>{ for(let t=0;t<L.nT;t++){ const k=t*L.np+p, x=lon/12, y=lat/9, tt=(L.t0+t*3600)/3600;
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
async function cachePut(key, val){ const db=await idb(); if(!db) return; try{ db.transaction('wx','readwrite').objectStore('wx').put(val,key); }catch(e){} }
function usable(L){ return L && (L.empty || (Date.now()-L.at < CACHE_MS && L.t0 <= S.times[0] && L.t0+(L.nT-1)*3600 >= S.times[71])); }

async function loadCoarse(force){
  setStatus('loading','Loading forecast…');
  if(!force){ const c=await cacheGet('coarse'); if(usable(c)){ WX.coarse=c; WX.at=c.at; afterCoarse('live'); return; } }
  try{ WX.demo=false; const L=await fetchLayer(COARSE); WX.coarse=L; WX.at=L.at; cachePut('coarse',L); afterCoarse('live'); }
  catch(err){ console.warn('Forecast fetch failed, using sample data:', err); WX.demo=true; WX.tiles.clear(); WX.coarse=await fetchLayer(COARSE); afterCoarse('demo'); }
}
function afterCoarse(kind){
  S.grid = WX.coarse;
  if(kind==='live') setStatus('live', `Live forecast · updated ${fmtTime.format(new Date(WX.at))}`);
  else setStatus('demo', 'Sample weather: forecast service unreachable');
  S.eval=null; render(); drawBand(); selectLocation(S.sel, {fly:false, keepView:true});
  scheduleTiles();
}
async function loadTile(spec){
  if(WX.tiles.has(spec.id) && usable(WX.tiles.get(spec.id))) return WX.tiles.get(spec.id);
  if(WX.pending.has(spec.id)) return WX.pending.get(spec.id);
  const job=(async()=>{
    let L = WX.demo ? null : await cacheGet(spec.id);
    if(!usable(L)){ try{ L=await fetchLayer(spec); if(!WX.demo) cachePut(spec.id,L); }catch(e){ console.warn('tile failed',spec.id,e); L=null; } }
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
  await Promise.all([...want.values()].map(loadTile));
}
let tileTimer=null;
function scheduleTiles(){ clearTimeout(tileTimer); tileTimer=setTimeout(loadVisibleTiles, 500); }
async function loadVisibleTiles(){
  if(!WX.coarse || proj.scale() < baseScale*4.5) return;
  const c=proj.invert([W/2,H/2]); if(!c) return;
  const want=new Map();
  for(let i=0;i<=6;i++) for(let j=0;j<=6;j++){
    const ll=proj.invert([W*j/6, H*i/6]); if(!ll||isNaN(ll[0])||!visiblePt(ll)) continue;
    if(ll[1]<24||ll[1]>72||ll[0]<-170||ll[0]>-50) continue;
    const sp=tileSpec(ll[1],ll[0]); if(!want.has(sp.id)) want.set(sp.id,{sp,d:d3.geoDistance(ll,c)});
  }
  const list=[...want.values()].sort((a,b)=>a.d-b.d).slice(0,8).map(x=>x.sp).filter(sp=>!(WX.tiles.has(sp.id)&&usable(WX.tiles.get(sp.id))));
  if(!list.length) return;
  for(let k=0;k<list.length;k+=2){ await Promise.all(list.slice(k,k+2).map(loadTile)); render(); }
}

/* --- reading values --- */
function layerValue(L, key, t, lat, lon){
  if(!L || L.empty || !L.f[key]) return NaN;
  const tt = t + Math.round((S.times[0]-L.t0)/3600);
  if(tt<0 || tt>=L.nT) return NaN;
  const fi=(lat-L.lat0)/L.dLat, fj=(lon-L.lon0)/L.dLon;
  if(fi<0||fj<0||fi>L.nLat-1||fj>L.nLon-1) return NaN;
  const i=Math.min(Math.floor(fi),L.nLat-2), j=Math.min(Math.floor(fj),L.nLon-2), di=fi-i, dj=fj-j, a=L.f[key], b=tt*L.np;
  let s=0, w=0;
  const add=(ii,jj,wt)=>{ const p=L.idx[ii*L.nLon+jj]; if(p<0||wt<=0) return; const v=a[b+p]; if(isNaN(v)) return; s+=v*wt; w+=wt; };
  add(i,j,(1-di)*(1-dj)); add(i,j+1,(1-di)*dj); add(i+1,j,di*(1-dj)); add(i+1,j+1,di*dj);
  return w>0.05 ? s/w : NaN;
}
function gridVal(key, t, lat, lon){
  const tile = WX.tiles.get(tileSpec(lat,lon).id);
  if(tile){ const v=layerValue(tile,key,t,lat,lon); if(!isNaN(v)) return v; }
  return layerValue(WX.coarse,key,t,lat,lon);
}
function setStatus(kind, text){
  const el = $('#status'); el.className = 'status '+kind;
  el.innerHTML = `<span class="dot"></span><span>${esc(text)}</span>` + (kind!=='loading' ? ` <button id="refreshBtn" type="button">Refresh</button>` : '');
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
