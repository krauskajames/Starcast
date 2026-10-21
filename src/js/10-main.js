/* Core app: state, weather data, globe, time bar, panels. */
const C = window.Core;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp = C.clamp;

/* ---------------- storage ---------------- */
const store = {
  get(k, d){ try{ const v = localStorage.getItem('starcast.'+k); return v ? JSON.parse(v) : d; }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem('starcast.'+k, JSON.stringify(v)); }catch(e){} }
};
const DEFAULT_GEAR = {
  name:'Barska AE10758 reflector', aperture:114, focal:900, barlow:3,
  eyepieces:[{fl:20, afov:40, name:'K20 Kellner'}],
  cameraOn:true, camera:{name:'Canon EOS Rebel T3', w:22.0, h:14.7, px:5.2},
  filters:[{name:'UHC', type:'uhc'}]
};
const DEFAULT_INT = { planets:true, moon:true, deepsky:true, doubles:true, meteors:true, photo:true, nakedEye:true, solar:true, satellites:true };
const FILTER_TYPES = [['uhc','UHC (nebula)'],['oiii','OIII (nebula)'],['hbeta','H-beta (nebula)'],['lp','Light-pollution broadband'],['moon','Moon / neutral density'],['solar','Solar, white-light (full aperture)'],['color','Color / planetary']];
const S = {
  times:[], ti:0, layer:'cloud',
  ov:Object.assign({night:true, Sun:false, Moon:false, Mercury:false, Venus:false, Mars:false, Jupiter:false, Saturn:true}, store.get('ov',{})),
  grid:null, sel:store.get('sel',{lat:43.073, lon:-89.401, name:'Madison (example spot)'}), point:null, pointKey:'',
  saved:store.get('saved',[]), gear:store.get('gear',DEFAULT_GEAR), interests:Object.assign({},DEFAULT_INT,store.get('interests',{})),
  checks:store.get('checks',[]), checkOpen:false,
  units:store.get('units','F'), defBortle:store.get('defBortle',5), tab:'loc', night:0, showAll:false, calFilter:'all', red:false, playing:null,
  eval:null, savingName:null, confirmDel:null
};
S.layer = store.get('layer','cloud');
if(!S.gear.filters) S.gear.filters = [{name:'UHC', type:'uhc'}];
// gear profiles (v3): telescope, binoculars or naked eye; the old single gear becomes the first profile
S.gears = store.get('gears', null) || [Object.assign({id:1, kind:'telescope', mount:'manual'}, S.gear)];
S.gearIdx = clamp(store.get('gearIdx', 0), 0, S.gears.length-1);
S.gear = S.gears[S.gearIdx];
function activeGear(){ return S.gears[S.gearIdx] || S.gears[0]; }
function saveGear(){ store.set('gears', S.gears); store.set('gearIdx', S.gearIdx); S.gear = activeGear(); S.eval = null; }

/* ---------------- time ---------------- */
function buildTimes(){
  const h = Math.floor(Date.now()/3600000)*3600;
  S.times = Array.from({length:72},(_,i)=>h+i*3600);
}
buildTimes();
const fmtHour = new Intl.DateTimeFormat(undefined,{hour:'numeric'});
const fmtTime = new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'});
const fmtDay = new Intl.DateTimeFormat(undefined,{weekday:'short'});
const fmtDayLong = new Intl.DateTimeFormat(undefined,{weekday:'long'});
const fmtFull = new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric'});
const fmtMon = new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric'});
const fmtMD = new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'});
const tDate = i => new Date(S.times[i]*1000);
const hourLabel = d => fmtHour.format(d).replace(/\s?([AP])M/i,(m,a)=>a.toLowerCase()==='a'?' am':' pm');

/* ---------------- units ---------------- */
const tempU = c => S.units==='F' ? Math.round(c*9/5+32)+'°F' : Math.round(c)+'°C';
const windU = k => S.units==='F' ? Math.round(k*0.6214)+' mph' : Math.round(k)+' km/h';

/* ---------------- aurora (NOAA SWPC) ---------------- */
S.aur = { ov:null, ovTime:null, kp:[] };
async function loadAurora(){
  try{
    const kpRaw = await getJSON('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json');
    let rows = [];
    if(Array.isArray(kpRaw) && Array.isArray(kpRaw[0])){ const h=kpRaw[0]; const ti=h.indexOf('time_tag'), ki=h.indexOf('kp'); rows = kpRaw.slice(1).map(r=>({t:Date.parse(r[ti].replace(' ','T')+'Z')/1000, kp:+r[ki]})); }
    else if(Array.isArray(kpRaw)) rows = kpRaw.map(r=>({t:Date.parse(String(r.time_tag).replace(' ','T')+(String(r.time_tag).endsWith('Z')?'':'Z'))/1000, kp:+(r.kp ?? r.kp_index)}));
    S.aur.kp = rows.filter(r=>isFinite(r.t)&&isFinite(r.kp)).sort((a,b)=>a.t-b.t);
  }catch(e){ console.warn('Kp forecast unavailable', e); }
  try{
    const ov = await getJSON('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json');
    const a = new Float32Array(360*181);
    (ov.coordinates||[]).forEach(([lo,la,v])=>{ const j=((Math.round(lo)%360)+360)%360, i=Math.round(la)+90; if(i>=0&&i<181) a[i*360+j]=v; });
    S.aur.ov = a; S.aur.ovTime = Date.parse(ov['Forecast Time'])||Date.now();
  }catch(e){ console.warn('Aurora nowcast unavailable', e); }
  S.eval=null; buildLayers(); render(); if(S.tab==='loc') renderPanel();
}
function auroraSource(){
  const tu=S.times[S.ti];
  if(S.aur.ov && Math.abs(tu*1000-S.aur.ovTime) < 3*3600e3) return `NOAA’s aurora map for ${fmtTime.format(new Date(S.aur.ovTime))}.`;
  const kp=kpAt(tu); return kp!=null ? `Estimated from NOAA’s Kp ${kp.toFixed(1)} forecast for this hour.` : 'No NOAA aurora forecast for this hour.';
}
function kpAt(u){
  const k=S.aur.kp; if(!k.length) return null;
  let best=null; for(const r of k){ if(r.t<=u+60) best=r; else break; }
  if(!best) return null;
  return u - best.t <= 3*3600+60 ? best.kp : null;
}
// NOAA OVATION aurora probability (%) on a 1-degree grid, smoothly interpolated
function ovAt(lat, lon){
  const a=S.aur.ov; if(!a) return 0;
  const fi=clamp(lat+90,0,180), fj=((lon%360)+360)%360;
  const i=Math.min(Math.floor(fi),179), j=Math.floor(fj)%360, j2=(j+1)%360, di=fi-i, dj=fj-Math.floor(fj);
  return (a[i*360+j]*(1-dj)+a[i*360+j2]*dj)*(1-di) + (a[(i+1)*360+j]*(1-dj)+a[(i+1)*360+j2]*dj)*di;
}
// Beyond NOAA's next-hour map: a probability band around the oval implied by the Kp forecast
function kpProb(kp, lat, lon){
  const ml=C.geomagLat(lat,lon), edge=67-2.5*kp, mid=edge+4, w=3.2+0.25*kp;
  return Math.min(90, (12+9*kp)) * Math.exp(-Math.pow((ml-mid)/w,2));
}
// NOAA's colors: green at 10%, yellow at 50%, red at 90%
const AUR_RAMP = [[5,[0,170,60]],[10,[0,220,70]],[30,[90,235,40]],[50,[245,235,40]],[70,[250,150,30]],[90,[235,40,30]]];
function auroraRGB(p){
  if(p<=AUR_RAMP[0][0]) return AUR_RAMP[0][1];
  for(let k=1;k<AUR_RAMP.length;k++){ if(p<=AUR_RAMP[k][0]){ const [a,ca]=AUR_RAMP[k-1],[b,cb]=AUR_RAMP[k], t=(p-a)/(b-a); return [ca[0]+(cb[0]-ca[0])*t, ca[1]+(cb[1]-ca[1])*t, ca[2]+(cb[2]-ca[2])*t]; } }
  return AUR_RAMP[AUR_RAMP.length-1][1];
}

/* ---------------- point forecast ---------------- */
let pointAbort=null;
async function loadPoint(lat, lon){
  const key = lat.toFixed(3)+','+lon.toFixed(3)+','+S.times[0];
  if(S.pointKey===key && S.point) return;
  S.pointKey = key; S.point = null;
  if(pointAbort) pointAbort.abort();
  pointAbort = new AbortController();
  const sig = pointAbort.signal;
  try{
    const [w, aq] = await Promise.all([
      omGet(omURL([lat.toFixed(4)],[lon.toFixed(4)]), 1, VARS.length, sig),
      omGet(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&hourly=aerosol_optical_depth&forecast_days=4&timeformat=unixtime&timezone=GMT`, 1, 1, sig).catch(()=>null)
    ]);
    const off = w.hourly.time.indexOf(S.times[0]);
    if(off<0) throw new Error('misaligned');
    const P = {};
    KEYS.forEach((k,vi)=>{ P[k] = S.times.map((_,t)=>{ const v=w.hourly[VARS[vi]][off+t]; return v==null?NaN:v; }); });
    P.aod = S.times.map(u=>{ if(!aq) return null; const ix=aq.hourly.time.indexOf(u); const v = ix>=0 ? aq.hourly.aerosol_optical_depth[ix] : null; return v==null?null:v; });
    P.seeing = P.cloud.map((_,t)=>C.estSeeing(P.j250[t],P.w500[t],P.w10[t]));
    P.transp = P.cloud.map((_,t)=>C.estTransparency(P.hcloud[t],P.rh[t],P.aod[t]));
    if(S.pointKey!==key) return;
    S.point = P; S.eval=null; renderPanel(); drawBand();
  }catch(e){
    if(e.name==='AbortError') return;
    S.point=null; S.pointKey='';
    if(e instanceof RateLimited) setTimeout(()=>{ if(near(S.sel,{lat,lon})) loadPoint(lat,lon); }, Math.max(5e3, e.until-Date.now()+2e3));
  }
}
function wxAt(t){
  if(S.point) { const P=S.point; return {cloud:P.cloud[t],hcloud:P.hcloud[t],seeing:P.seeing[t],transp:P.transp[t],rh:P.rh[t],td:P.td[t],temp:P.temp[t],w10:P.w10[t],j250:P.j250[t],aod:P.aod[t]}; }
  const {lat,lon}=S.sel;
  const c = gridVal('cloud',t,lat,lon);
  if(isNaN(c)) return null;
  const o={}; ['cloud','hcloud','seeing','transp','rh','td','temp','w10','j250'].forEach(k=>o[k]=gridVal(k,t,lat,lon)); o.aod=null;
  return o;
}

/* ---------------- color scales ---------------- */
function ramp(stops){
  return v => {
    if(isNaN(v)) return null;
    if(v<=stops[0][0]) return stops[0][1];
    for(let i=1;i<stops.length;i++){
      if(v<=stops[i][0]){ const [a,ca]=stops[i-1],[b,cb]=stops[i], t=(v-a)/(b-a); return [ca[0]+(cb[0]-ca[0])*t, ca[1]+(cb[1]-ca[1])*t, ca[2]+(cb[2]-ca[2])*t]; }
    }
    return stops[stops.length-1][1];
  };
}
const SC = {
  cloud: ramp([[0,[18,52,138]],[25,[44,92,176]],[50,[104,138,196]],[75,[170,184,208]],[100,[232,234,240]]]),
  q5: ramp([[1,[228,230,238]],[2,[160,178,208]],[3,[92,128,192]],[4,[40,86,168]],[5,[16,48,132]]]),
  jet: ramp([[0,[28,40,84]],[70,[34,104,150]],[120,[96,170,140]],[160,[228,196,84]],[210,[230,116,52]],[280,[196,44,72]]]),
  dew: ramp([[0,[214,72,72]],[2,[226,148,68]],[4,[188,176,108]],[7,[64,128,150]],[12,[22,60,128]]]),
  obs: ramp([[0,[40,34,52]],[25,[70,62,96]],[50,[56,104,164]],[75,[48,156,176]],[100,[118,224,208]]]),
  kp: (level, kp) => level>=3 ? [70,230,140] : level===2 ? [60,170,110] : level===1 ? [50,120,96] : kp>=3 ? [52,72,96] : [34,48,72],
  wind: ramp([[0,[16,48,132]],[10,[40,86,168]],[20,[104,138,196]],[30,[180,190,210]],[45,[236,236,242]]]),
  lp: ramp([[17.6,[250,246,240]],[18.4,[236,96,72]],[18.9,[240,150,56]],[19.5,[236,212,72]],[20.5,[96,176,96]],[21.4,[44,104,176]],[21.7,[34,56,110]],[21.95,[16,18,34]]]),
  temp: ramp([[-20,[110,80,170]],[-5,[60,110,200]],[5,[60,160,180]],[15,[150,190,90]],[25,[230,170,60]],[35,[220,80,60]]])
};
const rgb = c => c ? `rgb(${c[0]|0},${c[1]|0},${c[2]|0})` : 'transparent';

/* ---------------- layers ---------------- */
const LAYERS = [
  {id:'cloud', name:'Cloud cover', key:'cloud', sc:SC.cloud, ticks:['Clear','50%','Overcast'], dom:[0,100], note:'Total cloud from the model blend. Dark blue is clear sky.'},
  {id:'obs', name:'Observing', key:'obs', sc:SC.obs, ticks:['Poor','Fair','Great'], dom:[0,100], note:'Clear sky, darkness, steady air and transparency combined into one score.'},
  {id:'seeing', name:'Seeing', key:'seeing', sc:SC.q5, ticks:['1 bad','3','5 steady'], dom:[1,5], note:'Estimated steadiness of the air. Matters most for planets, the Moon and double stars.'},
  {id:'transp', name:'Transparency', key:'transp', sc:SC.q5, ticks:['1 hazy','3','5 crisp'], dom:[1,5], note:'Estimated clarity from high cloud and moisture. Matters most for galaxies and nebulae.'},
  {id:'high', name:'High cloud', key:'hcloud', sc:SC.cloud, ticks:['None','50%','Full'], dom:[0,100], note:'Thin cirrus that hides faint objects even when the sky looks clear.'},
  {id:'jet', name:'Jet stream', key:'j250', sc:SC.jet, ticks:['Calm','150 km/h','280+'], dom:[0,280], note:'Wind at 250 hPa (about 34,000 ft). Fast jet streams blur planets.'},
  {id:'dew', name:'Dew risk', key:'dew', sc:SC.dew, ticks:['Dew likely','4°C','Dry'], dom:[0,12], note:'Gap between temperature and dew point. Under 2°C your optics will fog without a dew heater.'},
  {id:'none', name:'None', key:'none', sc:()=>null, ticks:['','',''], dom:[0,1], note:'No weather colors, so the base map shows clearly.'},
  {id:'lp', name:'Light pollution', key:'lp', sc:SC.lp, ticks:['City','Bortle 4','Dark'], dom:[17.6,21.95], note:'Estimated sky brightness from a city-glow model (Walker’s law). Same for every hour; does not include clouds or moonlight.'}
];
const OVERLAYS = [
  {id:'night', name:'Night side', col:[6,10,28]},
  {id:'Sun', name:'Sunlit side', col:[255,206,120]},
  {id:'aurora', name:'Aurora', col:[70,230,140]},
  {id:'Moon', name:'Moon up', col:[200,212,236]},
  {id:'Mercury', name:'Mercury', col:[196,186,172]},
  {id:'Venus', name:'Venus', col:[255,238,186]},
  {id:'Mars', name:'Mars', col:[236,112,72]},
  {id:'Jupiter', name:'Jupiter', col:[240,196,140]},
  {id:'Saturn', name:'Saturn', col:[226,206,112]}
];
function layerVal(L, t, lat, lon, sunAlt, detail){
  const GV=(k,tt,la,lo)=>gridVal(k,tt,la,lo,detail);
  if(L.key==='dew'){ const T=GV('temp',t,lat,lon), D=GV('td',t,lat,lon); return T-D; }
  if(L.key==='lp') return lpVal(lat,lon,0.05);
  if(L.key==='obs'){
    const c=GV('cloud',t,lat,lon); if(isNaN(c)) return NaN;
    const s=GV('seeing',t,lat,lon), tr=GV('transp',t,lat,lon);
    const dark = sunAlt<=-12?1:sunAlt<=0?(-sunAlt)/12*0.8:0;
    return 100*Math.pow(clamp((100-c)/100,0,1),1.5)*dark*(0.45+0.55*clamp((s+tr-2)/8,0,1));
  }
  return GV(L.key,t,lat,lon);
}
function buildLayers(){
  const L = LAYERS.find(l=>l.id===S.layer)||LAYERS[0];
  const n=12, grad= L.key==='none' ? 'transparent' : Array.from({length:n},(_,i)=>rgb(L.sc(L.dom[0]+(L.dom[1]-L.dom[0])*i/(n-1)))).join(',');
  $('#layers').innerHTML = `
    <div class="lgroup"><h3>Weather · US & Canada</h3><div class="chips">${LAYERS.map(l=>`<button class="chip radio" data-layer="${l.id}" aria-pressed="${l.id===S.layer}"><span class="sw" style="background:${l.key==='none'?'transparent':rgb(l.sc(l.dom[0]+(l.dom[1]-l.dom[0])*.2))}"></span>${l.name}</button>`).join('')}</div></div>
    <div class="lgroup legend"><div class="bar" style="background:linear-gradient(90deg,${grad})"></div><div class="ticks">${L.ticks.map(t=>`<span>${t}</span>`).join('')}</div><p class="layer-note">${L.note}</p></div>
    <div class="lgroup"><h3>Sky over the globe</h3><div class="chips">${OVERLAYS.map(o=>`<button class="chip" data-ov="${o.id}" aria-pressed="${!!S.ov[o.id]}"><span class="sw" style="background:${rgb(o.id==='night'?[60,70,110]:o.col)}"></span>${o.name}${o.id==='aurora'?'<span class="k">NOAA</span>':o.id!=='night'&&o.id!=='Moon'&&o.id!=='Sun'?'<span class="k">where visible</span>':''}</button>`).join('')}</div></div>`;
  if(S.ov.aurora) $('#layers').insertAdjacentHTML('beforeend', `<div class="lgroup legend"><h3>Aurora chance</h3><div class="bar" style="background:linear-gradient(90deg,${AUR_RAMP.map(r=>rgb(r[1])).join(',')})"></div><div class="ticks"><span>10%</span><span>50%</span><span>90%</span></div><p class="layer-note"><span id="aurSrc">${auroraSource()}</span> Brightest where it’s dark enough to see; faded on the daylight side.</p></div>`);
  $('#layers').insertAdjacentHTML('beforeend', basemapHTML()); wireBasemap($('#layers'));
  $('#layers').querySelectorAll('[data-layer]').forEach(b=>b.onclick=()=>{ S.layer=b.dataset.layer; store.set('layer',S.layer); buildLayers(); render(); });
  $('#layers').querySelectorAll('[data-ov]').forEach(b=>b.onclick=()=>{ S.ov[b.dataset.ov]=!S.ov[b.dataset.ov]; store.set('ov',S.ov); buildLayers(); render(); });
}

/* ---------------- globe ---------------- */
const canvas = $('#globe'), ctx = canvas.getContext('2d');
let PAL = {};
function readPalette(){
  const cs = getComputedStyle(document.documentElement), g = k => cs.getPropertyValue('--map-'+k).trim();
  PAL = { sea:g('sea'), land:g('land'), grat:g('grat'), border:g('border'), state:g('state'), coast:g('coast'), wi:g('wi'), rim:g('rim'),
    label:g('label'), sky:g('sky'), saved:g('saved'), savedLabel:g('saved-label'), sel:g('sel'), drive:g('drive'), night:parseFloat(g('night'))||0.6 };
}
readPalette();
const THEMES = ['auto','light','dark'];
function applyTheme(t){
  if(t==='auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
  $('#themeBtn').textContent = 'Theme: ' + t[0].toUpperCase()+t.slice(1);
  readPalette(); render(); drawBand && drawBand();
}
$('#themeBtn').onclick = () => { const t = THEMES[(THEMES.indexOf(store.get('theme','auto'))+1)%3]; store.set('theme',t); applyTheme(t); };
matchMedia('(prefers-color-scheme: light)').addEventListener('change', ()=>{ readPalette(); render(); });
const land = topojson.feature(GEO.land, GEO.land.objects.land);
const borders = topojson.mesh(GEO.countries, GEO.countries.objects.countries, (a,b)=>a!==b);
const stateMesh = topojson.mesh(GEO.states, GEO.states.objects.states, (a,b)=>a!==b);
const graticule = d3.geoGraticule10();
// Dark-sky places and observatories worth knowing about
const SKYPLACES = [
  ['Newport State Park · Dark Sky Park',45.239,-86.989],['Yerkes Observatory',42.570,-88.556],['Headlands Dark Sky Park',45.776,-84.778],
  ['Cherry Springs State Park',41.663,-77.823],['Big Bend National Park',29.250,-103.250],['Death Valley National Park',36.505,-117.079],
  ['Natural Bridges National Monument',37.601,-110.004],['Grand Canyon National Park',36.107,-112.113],['Great Basin National Park',38.983,-114.300],
  ['Jasper Dark Sky Preserve',52.873,-118.082],['Mont-Mégantic Dark Sky Reserve',45.455,-71.153],['McDonald Observatory',30.671,-104.022],
  ['Kitt Peak Observatory',31.958,-111.600],['Lowell Observatory',35.203,-111.665]
];
const proj = d3.geoOrthographic().clipAngle(90).precision(0.4);
const path = d3.geoPath(proj, ctx);
let W=0,H=0,DPR=1, baseScale=1;
const ovCanvas = document.createElement('canvas'), ovCtx = ovCanvas.getContext('2d');
const wxCanvas = document.createElement('canvas'), wxCtx = wxCanvas.getContext('2d');
function resize(){
  const r = canvas.getBoundingClientRect();
  DPR = Math.min(2, window.devicePixelRatio||1);
  W = r.width; H = r.height;
  canvas.width = Math.round(W*DPR); canvas.height = Math.round(H*DPR);
  const m = Math.min(W,H);
  const k = baseScale ? proj.scale()/baseScale : 1;
  baseScale = m*0.45;
  const phone = window.innerWidth<=860;
  const top = phone ? 64 : 0, bottom = phone ? 140 : 70;
  const avail = Math.max(120, Math.min(W, H-top-bottom));
  if(!resize.done){ proj.scale(avail*(phone?8.5:6.4)).rotate([89.6,-44.7]); resize.done=true; }
  else proj.scale(baseScale*k);
  proj.translate([W/2, top + (H-top-bottom)/2]);
  render(); drawBand();
}
let rafPending=false, quality='hi', idleTimer=null;
function render(q){
  if(q) quality=q;
  if(rafPending) return; rafPending=true;
  requestAnimationFrame(()=>{ rafPending=false; draw(); });
}
function interacting(){
  quality='lo'; clearTimeout(idleTimer);
  idleTimer=setTimeout(()=>{ quality='hi'; render(); }, 160);
  if(typeof scheduleTiles==='function') scheduleTiles();
}
function skyNow(){
  const d = tDate(S.ti);
  const out = { g:C.gast(d), sun:C.geoEq('Sun',d), bodies:[] };
  OVERLAYS.forEach(o=>{ if(o.id!=='night' && o.id!=='Sun' && o.id!=='aurora' && S.ov[o.id]){ const e=C.geoEq(o.id,d); out.bodies.push({o, ra:e.ra, dec:e.dec}); } });
  return out;
}
function bodyNeedsSun(id){ return id==='Moon' ? 90 : (id==='Venus'||id==='Mercury') ? -4 : id==='Jupiter' ? -5 : -7; }

function draw(){
  const sky = skyNow();
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.clearRect(0,0,W,H);
  // sphere + land
  ctx.beginPath(); path({type:'Sphere'}); ctx.fillStyle=PAL.sea; ctx.fill();
  const bmOn = S.basemap!=='simple' && drawBasemap();
  if(!bmOn){ ctx.beginPath(); path(land); ctx.fillStyle=PAL.land; ctx.fill(); }
  // global overlay raster: night + planet visibility
  const step = quality==='hi' ? 3 : 6;
  const ow = Math.ceil(W/step), oh = Math.ceil(H/step);
  ovCanvas.width=ow; ovCanvas.height=oh;
  const img = ovCtx.createImageData(ow,oh), px=img.data;
  const bodies = sky.bodies, nightOn = S.ov.night, sunOn = S.ov.Sun;
  const auroraOn = S.ov.aurora, tu = S.times[S.ti];
  const useOv = auroraOn && S.aur.ov && Math.abs(tu*1000 - S.aur.ovTime) < 3*3600e3;
  const kpNow = auroraOn ? kpAt(tu) : null;
  const r = proj.scale(), [cx,cy]=proj.translate();
  const y0 = Math.max(0, Math.floor((cy-r)/step)), y1=Math.min(oh, Math.ceil((cy+r)/step));
  const x0 = Math.max(0, Math.floor((cx-r)/step)), x1=Math.min(ow, Math.ceil((cx+r)/step));
  if(nightOn || sunOn || bodies.length || (auroraOn && (useOv || kpNow!=null))){
    for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){
      const ll = proj.invert([x*step+step/2, y*step+step/2]);
      if(!ll || isNaN(ll[0])) continue;
      const lon=ll[0], lat=ll[1];
      // reject far side (invert gives a value for any point inside the disk)
      const sunAlt = C.altFast(lat,lon,sky.sun.ra,sky.sun.dec,sky.g);
      let R=0,Gc=0,B=0,A=0;
      if(nightOn){
        const n = sunAlt>=0 ? 0 : sunAlt<=-18 ? 1 : (-sunAlt/18);
        A = PAL.night*n + (Math.random()-0.5)*0.008; R=4; Gc=7; B=20;
      }
      if(sunOn && sunAlt > -0.8){
        const a = 0.15*clamp((sunAlt+0.8)/6,0,1);
        R=255; Gc=206; B=120; A=Math.max(A,a);
      }
      if(auroraOn && lat>35 || auroraOn && lat<-35){
        // whole oval, like NOAA's map; full strength where it is dark enough to see, faded in daylight
        const pr = useOv ? ovAt(lat,lon) : kpNow!=null ? kpProb(kpNow,lat,lon) : 0;
        if(pr>4){
          const dark = sunAlt<=-12 ? 1 : sunAlt>=0 ? 0.3 : 0.3+0.7*(-sunAlt/12);
          const col = auroraRGB(pr), a = clamp((pr-4)/22,0,1)*0.78*dark, na=a+A*(1-a);
          R=(col[0]*a+R*A*(1-a))/na; Gc=(col[1]*a+Gc*A*(1-a))/na; B=(col[2]*a+B*A*(1-a))/na; A=na;
        }
      }
      for(const b of bodies){
        const alt = C.altFast(lat,lon,b.ra,b.dec,sky.g);
        const sunOk = clamp((bodyNeedsSun(b.o.id) - sunAlt)/3, 0, 1);
        if(alt>6 && sunOk>0){
          const a = (b.o.id==='Moon' ? 0.16 : 0.24) * Math.min(1,(alt-6)/6) * sunOk;
          const na = a + A*(1-a);
          R = (b.o.col[0]*a + R*A*(1-a))/na; Gc=(b.o.col[1]*a + Gc*A*(1-a))/na; B=(b.o.col[2]*a + B*A*(1-a))/na; A=na;
        }
      }
      if(A>0){ const k=(y*ow+x)*4; px[k]=R; px[k+1]=Gc; px[k+2]=B; px[k+3]=A*255; }
    }
    ovCtx.putImageData(img,0,0);
    ctx.save(); ctx.beginPath(); path({type:'Sphere'}); ctx.clip();
    ctx.imageSmoothingEnabled=true; ctx.drawImage(ovCanvas,0,0,ow*step,oh*step); ctx.restore();
  }
  // weather raster over North America (US + Canada), clipped to land
  const L = LAYERS.find(l=>l.id===S.layer)||LAYERS[0];
  const k = r/baseScale;
  const bb = path.bounds(NA_MASK);
  if(L.key!=='none' && (S.grid || L.key==='lp') && isFinite(bb[0][0])){
    const bx0=Math.max(0,bb[0][0]-2), by0=Math.max(0,bb[0][1]-2), bx1=Math.min(W,bb[1][0]+2), by1=Math.min(H,bb[1][1]+2);
    if(bx1>bx0+2 && by1>by0+2){
      const area=(bx1-bx0)*(by1-by0);
      const ws = Math.max(quality==='hi'?2:4, Math.sqrt(area/(quality==='hi'?70000:18000)));
      const ww=Math.max(1,Math.ceil((bx1-bx0)/ws)), wh=Math.max(1,Math.ceil((by1-by0)/ws));
      wxCanvas.width=ww; wxCanvas.height=wh;
      const wimg=wxCtx.createImageData(ww,wh), wp=wimg.data;
      const lpRes = k<6 ? 0.25 : 0.05;
      for(let y=0;y<wh;y++) for(let x=0;x<ww;x++){
        const ll=proj.invert([bx0+x*ws+ws/2, by0+y*ws+ws/2]); if(!ll||isNaN(ll[0])) continue;
        if(ll[1]<23||ll[1]>73||ll[0]<-172||ll[0]>-50) continue;
        const sunAlt = L.key==='obs' ? C.altFast(ll[1],ll[0],sky.sun.ra,sky.sun.dec,sky.g) : 0;
        const v = L.key==='lp' ? lpVal(ll[1],ll[0],lpRes) : layerVal(L,S.ti,ll[1],ll[0],sunAlt, k>=5); const c=L.sc(v); if(!c) continue;
        const kk=(y*ww+x)*4; wp[kk]=c[0]; wp[kk+1]=c[1]; wp[kk+2]=c[2]; wp[kk+3]=bmOn?170:232;
      }
      wxCtx.putImageData(wimg,0,0);
      ctx.save(); ctx.beginPath(); path(NA_MASK); ctx.clip(); ctx.imageSmoothingEnabled=true;
      ctx.drawImage(wxCanvas, bx0, by0, ww*ws, wh*ws); ctx.restore();
    }
  }
  // lines
  ctx.lineJoin='round';
  ctx.beginPath(); path(graticule); ctx.strokeStyle=PAL.grat; ctx.lineWidth=.6; ctx.stroke();
  ctx.beginPath(); path(borders); ctx.strokeStyle=PAL.border; ctx.lineWidth=.7; ctx.stroke();
  if(r > baseScale*2.5){ ctx.beginPath(); path(stateMesh); ctx.strokeStyle=PAL.state; ctx.lineWidth=.6; ctx.stroke(); }
  ctx.beginPath(); path(land); ctx.strokeStyle=PAL.coast; ctx.lineWidth=.6; ctx.stroke();
  ctx.beginPath(); path({type:'Sphere'}); ctx.strokeStyle=PAL.rim; ctx.lineWidth=1; ctx.stroke();
  // sub-body points (where the body is overhead)
  ctx.font='600 11px "Chakra Petch", system-ui, sans-serif'; ctx.textBaseline='middle';
  if(sunOn){
    const lon=((sky.sun.ra*15 - sky.g*15 + 540)%360)-180, p=visiblePt([lon,sky.sun.dec]);
    if(p){ ctx.beginPath(); ctx.arc(p[0],p[1],6,0,7); ctx.fillStyle='#ffce78'; ctx.fill(); ctx.strokeStyle='rgba(255,206,120,.5)'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(p[0],p[1],11,0,7); ctx.stroke(); ctx.fillStyle=PAL.label; ctx.fillText('Sun overhead',p[0]+15,p[1]); }
  }
  for(const b of sky.bodies){
    const lon = ((b.ra*15 - sky.g*15 + 540)%360)-180;
    const p = visiblePt([lon,b.dec]); if(!p) continue;
    ctx.beginPath(); ctx.arc(p[0],p[1],4,0,7); ctx.fillStyle=rgb(b.o.col); ctx.fill();
    ctx.fillStyle=PAL.label; ctx.fillText(b.o.id+' overhead', p[0]+7, p[1]);
  }
  // places
  if(k > 2.5){
    const minPop = k>20 ? 0 : k>11 ? 20000 : k>6 ? 150000 : k>3.5 ? 900000 : 3000000;
    const drawn=[];
    ctx.font='12px "Atkinson Hyperlegible", system-ui, sans-serif';
    S.saved.forEach(s=>{ const p=visiblePt([s.lon,s.lat]); if(p) drawn.push(p); });
    C.CITIES.filter(c=>c[3]>=minPop).sort((a,b)=>b[3]-a[3]).forEach(([n,la,lo])=>{
      const p=visiblePt([lo,la]); if(!p || p[0]<0||p[0]>W||p[1]<(W<600?70:0)||p[1]>H) return;
      if(drawn.some(q=>Math.abs(q[0]-p[0])<70&&Math.abs(q[1]-p[1])<16)) return; drawn.push(p);
      ctx.beginPath(); ctx.arc(p[0],p[1],2,0,7); ctx.fillStyle=PAL.label; ctx.fill(); ctx.fillText(n,p[0]+5,p[1]); });
    if(k > 4.5) SKYPLACES.forEach(([n,la,lo])=>{ const p=visiblePt([lo,la]); if(!p) return; star(p[0],p[1],5,PAL.sky); ctx.fillStyle=PAL.sky; ctx.fillText(n,p[0]+8,p[1]); });
  }
  // saved
  ctx.font='600 12px "Atkinson Hyperlegible", system-ui, sans-serif';
  S.saved.forEach(s=>{ const p=visiblePt([s.lon,s.lat]); if(!p) return;
    ctx.save(); ctx.translate(p[0],p[1]); ctx.rotate(Math.PI/4); ctx.fillStyle=PAL.saved; ctx.fillRect(-4,-4,8,8); ctx.restore();
    ctx.fillStyle=PAL.savedLabel; ctx.fillText(s.name,p[0]+8,p[1]); });
  if(S.drive && S.drive.results){
    ctx.font='600 12px "Atkinson Hyperlegible", system-ui, sans-serif';
    S.drive.results.forEach((d,i)=>{ const p=visiblePt([d.lon,d.lat]); if(!p) return; star(p[0],p[1],6,PAL.drive); if(r > baseScale*5){ ctx.fillStyle=PAL.drive; ctx.fillText(d.name.length>32?d.name.slice(0,30)+'…':d.name,p[0]+9,p[1]); } });
  }
  // selection
  const sp = visiblePt([S.sel.lon,S.sel.lat]);
  if(sp){ ctx.beginPath(); ctx.arc(sp[0],sp[1],9,0,7); ctx.strokeStyle=PAL.sel; ctx.lineWidth=1.6; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sp[0]-14,sp[1]); ctx.lineTo(sp[0]-5,sp[1]); ctx.moveTo(sp[0]+5,sp[1]); ctx.lineTo(sp[0]+14,sp[1]); ctx.moveTo(sp[0],sp[1]-14); ctx.lineTo(sp[0],sp[1]-5); ctx.moveTo(sp[0],sp[1]+5); ctx.lineTo(sp[0],sp[1]+14); ctx.stroke(); }
}
function star(x,y,r,col){ ctx.beginPath(); for(let i=0;i<10;i++){ const a=-Math.PI/2+i*Math.PI/5, rr=i%2?r*.45:r; ctx.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);} ctx.closePath(); ctx.fillStyle=col; ctx.fill(); }
function visiblePt(ll){
  const c = proj.invert(proj.translate());
  if(!c || d3.geoDistance(ll,c) > Math.PI/2 - 0.01) return null;
  return proj(ll);
}

/* interaction */
let dragStart=null, moved=false, pinch=null;
const pointers=new Map();
canvas.addEventListener('pointerdown', e=>{
  canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  moved=false;
  if(pointers.size===1){ dragStart={x:e.clientX,y:e.clientY,rot:proj.rotate()}; }
  else if(pointers.size===2){ const [a,b]=[...pointers.values()]; pinch={d:Math.hypot(a.x-b.x,a.y-b.y), s:proj.scale()}; dragStart=null; }
});
canvas.addEventListener('pointermove', e=>{
  if(!pointers.has(e.pointerId)){ hoverTip(e); return; }
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch && pointers.size===2){ const [a,b]=[...pointers.values()]; setScale(pinch.s*Math.hypot(a.x-b.x,a.y-b.y)/pinch.d); moved=true; return; }
  if(!dragStart) return;
  const dx=e.clientX-dragStart.x, dy=e.clientY-dragStart.y;
  if(Math.abs(dx)+Math.abs(dy)>4) moved=true;
  if(!moved) return;
  const k = 180/Math.PI/proj.scale();
  const r0=dragStart.rot;
  proj.rotate([r0[0]+dx*k, clamp(r0[1]-dy*k,-89,89), r0[2]]);
  interacting(); render();
});
function endPtr(e){
  const had = pointers.has(e.pointerId); pointers.delete(e.pointerId);
  if(pointers.size<2) pinch=null;
  if(had && e.type==='pointerup' && !moved && pointers.size===0){
    const r=canvas.getBoundingClientRect(); const ll=proj.invert([e.clientX-r.left,e.clientY-r.top]);
    if(ll && !isNaN(ll[0]) && visiblePt(ll)) selectLocation({lat:ll[1],lon:ll[0],name:null},{fly:false});
  }
  if(pointers.size===0) dragStart=null;
}
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('pointerleave', ()=>{ $('#tip').hidden=true; });
canvas.addEventListener('wheel', e=>{ e.preventDefault(); setScale(proj.scale()*Math.exp(-e.deltaY*0.0015)); }, {passive:false});
function setScale(s){ proj.scale(clamp(s, baseScale*0.9, baseScale*60)); interacting(); render(); }
function hoverTip(e){
  const tip=$('#tip'); if(!S.grid || e.pointerType==='touch'){ tip.hidden=true; return; }
  const r=canvas.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
  const ll=proj.invert([x,y]); if(!ll||isNaN(ll[0])||!visiblePt(ll)){ tip.hidden=true; return; }
  if(!inNA(ll[1],ll[0])){ tip.hidden=true; return; }
  const L=LAYERS.find(l=>l.id===S.layer); const sky=skyNow();
  const v=layerVal(L,S.ti,ll[1],ll[0],C.altFast(ll[1],ll[0],sky.sun.ra,sky.sun.dec,sky.g));
  if(isNaN(v)){ tip.hidden=true; return; }
  const lpb = L.id==='lp' ? C.lightPollution(ll[1],ll[0]) : null;
  const txt = L.id==='lp' ? `Bortle ${lpb?lpb.bortle:'?'} · ${v.toFixed(2)} mag/arcsec²` : L.id==='seeing'||L.id==='transp' ? v.toFixed(1)+' / 5' : L.id==='jet' ? windU(v) : L.id==='dew' ? (S.units==='F'?Math.round(v*1.8)+'°F':v.toFixed(1)+'°C')+' spread' : Math.round(v)+(L.id==='obs'?' / 100':'%');
  tip.textContent = `${L.name}: ${txt}`; tip.hidden=false;
  tip.style.left=Math.min(x+14, W-160)+'px'; tip.style.top=(y+14)+'px';
}
function flyTo(lat, lon, minScale){
  const r0=proj.rotate(), r1=[-lon,-lat,0], s0=proj.scale(), s1=Math.max(s0, minScale||s0);
  const dl = ((r1[0]-r0[0]+540)%360)-180;
  const t0=performance.now(), dur=matchMedia('(prefers-reduced-motion: reduce)').matches?1:850;
  (function step(now){
    const t=Math.min(1,(now-t0)/dur), e=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
    proj.rotate([r0[0]+dl*e, r0[1]+(r1[1]-r0[1])*e, 0]); proj.scale(s0+(s1-s0)*e);
    quality = t<1?'lo':'hi'; draw();
    if(t<1) requestAnimationFrame(step);
  })(t0);
}

/* ---------------- time bar ---------------- */
const slider=$('#tslider');
function nowIndex(){ const now=Date.now()/1000; let i=0; while(i<71 && S.times[i+1]<=now) i++; return i; }
function setTime(i){
  S.ti = clamp(i,0,71); slider.value=S.ti;
  { const as=$('#aurSrc'); if(as) as.textContent=auroraSource(); }
  const d=tDate(S.ti);
  $('#tTime').textContent = fmtFull.format(d).replace(/\s?([AP])M/,(m,a)=>a==='A'?' am':' pm');
  const sun = C.topo('Sun', d, S.sel.lat, S.sel.lon).alt;
  const mi = C.moonInfo(d), moon = C.topo('Moon', d, S.sel.lat, S.sel.lon).alt;
  $('#tSun').textContent = `${sun>0?'Daylight':sun>-6?'Civil twilight':sun>-12?'Nautical twilight':sun>-18?'Astronomical twilight':'Dark'} · Moon ${Math.round(mi.illum*100)}% ${moon>0?'up':'down'}`;
  render(); highlightStrip(); updateNowCards();
}
slider.addEventListener('input', ()=>setTime(+slider.value));
function drawBand(){
  const c=$('#tband'), r=c.getBoundingClientRect(); if(!r.width) return;
  c.width=Math.round(r.width*DPR); c.height=Math.round(12*DPR);
  const g=c.getContext('2d'), w=c.width/72;
  for(let i=0;i<72;i++){
    const d=tDate(i), sun=C.topo('Sun',d,S.sel.lat,S.sel.lon).alt;
    const base = sun>0?[70,92,128]:sun>-6?[44,58,92]:sun>-12?[26,36,64]:sun>-18?[16,22,44]:[8,11,24];
    const wx = wxAt(i);
    let col = base;
    if(wx && sun<-6){ const cl = SC.cloud(wx.cloud); col=[cl[0]*.75,cl[1]*.75,cl[2]*.75]; }
    g.fillStyle=rgb(col); g.fillRect(i*w,0,Math.ceil(w)+.5,c.height);
  }
  const ticks=$('#dayticks'); let h='';
  for(let i=0;i<72;i++){ const d=tDate(i); if(d.getHours()===0) h+=`<span style="left:${(i/72*100).toFixed(2)}%">${fmtDay.format(d)}</span>`; else if(d.getHours()===12 && i>2 && i<70) h+=`<span style="left:${(i/72*100).toFixed(2)}%;opacity:.6">noon</span>`; }
  ticks.innerHTML=h;
}
$('#playBtn').onclick=()=>{
  if(S.playing){ clearInterval(S.playing); S.playing=null; $('#playIcon').setAttribute('d','M3 1.5v11l9-5.5z'); return; }
  $('#playIcon').setAttribute('d','M2.5 1.5h3v11h-3zM8.5 1.5h3v11h-3z');
  S.playing=setInterval(()=>setTime((S.ti+1)%72), 450);
};

/* ---------------- location + panel ---------------- */
function bortleFor(sel){ const s=S.saved.find(x=>near(x,sel)); if(s) return s.bortle; const lp=C.lightPollution(sel.lat,sel.lon); return lp ? lp.bortle : S.defBortle; }
function bortleSource(sel){ if(S.saved.find(x=>near(x,sel))) return 'saved'; return C.lightPollution(sel.lat,sel.lon) ? 'estimated' : 'default'; }
function near(a,b){ return Math.abs(a.lat-b.lat)<0.002 && Math.abs(a.lon-b.lon)<0.002; }
function selectLocation(loc, o){
  o=o||{};
  S.sel = {lat:+loc.lat, lon:+loc.lon, name:loc.name||null};
  store.set('sel', S.sel);
  S.point=null; S.eval=null; S.night=0; S.showAll=false; S.savingName=null;
  if(S.sat){ S.sat.passes=null; S.sat.err=null; S.sat.key=''; }
  if(o.fly) flyTo(S.sel.lat,S.sel.lon, baseScale*12);
  S.tab = o.tab || (S.tab==='gear'||S.tab==='saved' ? 'loc' : S.tab);
  syncTabs(); renderPanel(); drawBand(); setTime(S.ti); render();
  loadPoint(S.sel.lat,S.sel.lon);
  loadConfidence(S.sel.lat,S.sel.lon);
  if(WX.coarse && S.sel.lat>23 && S.sel.lat<73) loadTile(tileSpec(S.sel.lat,S.sel.lon)).then(()=>{ drawBand(); render(); });
}
function syncTabs(){ document.querySelectorAll('.tab').forEach(t=>t.setAttribute('aria-selected', t.dataset.tab===S.tab)); }
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{ S.tab=t.dataset.tab; syncTabs(); renderPanel(); $('#pbody').scrollTop=0; if(window.innerWidth<=860) setSheet('mid'); });

function locName(){ const s=S.saved.find(x=>near(x,S.sel)); return s ? s.name : (S.sel.name || `${Math.abs(S.sel.lat).toFixed(2)}°${S.sel.lat>=0?'N':'S'}, ${Math.abs(S.sel.lon).toFixed(2)}°${S.sel.lon>=0?'E':'W'}`); }

function evaluate(){
  if(S.eval) return S.eval;
  const sv = S.saved.find(x=>near(x,S.sel));
  S.eval = C.evaluateTargets({ lat:S.sel.lat, lon:S.sel.lon, hours:S.times, wxAt, gear:gearForCalc(), bortle:bortleFor(S.sel), interests:S.interests, horizon: sv && sv.horizon });
  S.eval.nights = C.nights(S.times, S.sel.lat, S.sel.lon);
  return S.eval;
}
function gearForCalc(){ const g=Object.assign({},activeGear()); if(!g.cameraOn) delete g.camera; return g; }

function renderPanel(){
  const b=$('#pbody');
  if(S.tab==='loc') b.innerHTML = panelLoc();
  else if(S.tab==='saved') b.innerHTML = panelSaved();
  else if(S.tab==='cal') b.innerHTML = panelCal();
  else b.innerHTML = panelGear();
  wirePanel();
  if(S.tab==='loc'){ highlightStrip(); updateNowCards(); const sel=b.querySelector('.cell.sel'); if(sel){ const w=b.querySelector('.strip-wrap'); w.scrollLeft = Math.max(0, sel.offsetLeft - 120); } }
}

function nightLabel(n){
  const d=tDate(n.start), now=new Date();
  const same = d.toDateString()===now.toDateString() || (n.start===0);
  return same ? 'Tonight' : fmtDay.format(d)+' night';
}
function scoreClass(s){ return s>=70?'s-ex':s>=50?'s-gd':s>=30?'s-fr':'s-pr'; }
function rangeText(a,b){ return `${hourLabel(tDate(a))} – ${hourLabel(tDate(b))}`; }

function nightSummary(ev, n){
  const when = nightLabel(n)==='Tonight' ? 'tonight' : nightLabel(n);
  const r = C.nightAlert(ev, n, wxAt, locName(), i=>hourLabel(tDate(i)), when);
  let txt = r.text;
  const au = auroraNight(n);
  if(au) txt += ' ' + au.text;
  const cf = r.good ? confidenceText(n) : '';
  if(cf) txt += ' ' + cf;
  return txt;
}
function auroraNight(n){
  if(!S.aur.kp.length) return null;
  const ml = C.geomagLat(S.sel.lat, S.sel.lon);
  let best=null;
  for(let i=n.start;i<n.end;i++){
    const kp=kpAt(S.times[i]); if(kp==null) continue;
    const ch=C.auroraChance(kp, ml), w=wxAt(i);
    if(ch.level>0 && (!w || w.cloud<60) && (!best || ch.level>best.ch.level || kp>best.kp)) best={i,kp,ch};
  }
  if(!best) return null;
  return { ...best, text:`Aurora ${best.ch.text} around ${hourLabel(tDate(best.i))} (Kp ${best.kp.toFixed(1)} forecast).` };
}
function panelLoc(){
  const ev = evaluate();
  const saved = S.saved.find(x=>near(x,S.sel));
  const bort = bortleFor(S.sel);
  const nts = ev.nights;
  if(S.night>=nts.length) S.night=0;
  const n = nts[S.night];
  let h = searchHTML() + `<div class="locline"><div><h2>${esc(locName())}</h2><div class="sub mono">${S.sel.lat.toFixed(3)}°, ${S.sel.lon.toFixed(3)}° ${S.point?'· point forecast':wxAt(0)?'· map forecast':''}</div></div>
    <div class="row">${saved ? `<span class="tag saved">Saved</span>` : `<button class="btn primary" id="saveBtn">Save</button>`}</div></div>`;
  if(S.savingName!==null){
    h += `<form class="row" id="saveForm"><input type="text" id="saveName" value="${esc(S.savingName)}" placeholder="Name, e.g. My Backyard" aria-label="Location name" style="flex:1"><button class="btn primary" type="submit">Save location</button><button class="btn ghost" type="button" id="saveCancel">Cancel</button></form>`;
  }
  if(saved) h += horizonHTML(saved);
  if(!wxAt(0)){
    const why = WX.error && WX.error.kind==='limit' ? `The forecast is paused to stay within Open-Meteo’s free limit and continues at ${fmtTime.format(new Date(WX.error.until))}.`
      : WX.error && WX.error.kind==='network' ? 'The forecast service can’t be reached right now; Starcast will try again in a few minutes.'
      : 'Loading the forecast for this spot…';
    h += `<div class="empty">${why} Sky positions, plans and the calendar below don’t need it.</div>`;
  }
  h += `<div class="now" id="nowCards"></div>`;
  if(n){
    h += `<div class="alert"><div class="h">Alert preview · ${esc(nightLabel(n))}</div><p>${esc(nightSummary(ev,n))}</p></div>`;
  }
  h += `<div><h4>72-hour forecast</h4><div class="strip-wrap">${stripHTML(ev)}</div><p class="note">Tap a column to move the globe to that hour. Seeing and transparency are Starcast estimates from jet-stream wind, humidity, high cloud and aerosols.</p></div>`;
  // targets
  h += `<div><div class="row" style="justify-content:space-between;margin-bottom:8px"><h4 style="margin:0">Worth seeing</h4>${S.gears.length>1?`<select id="gearPick" aria-label="Observe with" style="padding:3px 6px">${S.gears.map((g,i)=>`<option value="${i}" ${i===S.gearIdx?'selected':''}>${esc(g.name||g.kind)}</option>`).join('')}</select>`:''}<span class="sub">Sky: Bortle ${bort}${bortleSource(S.sel)==='estimated'?' (est.)':''} <button class="more" id="bortleEdit" style="padding:0;font-size:12px">change</button></span></div>`;
  if(S.bortleOpen){
    h += `<div class="row" style="margin-bottom:8px"><select id="bortleSel" aria-label="Sky darkness (Bortle class)">${[1,2,3,4,5,6,7,8,9].map(v=>`<option value="${v}" ${v===bort?'selected':''}>Bortle ${v} · ${['','pristine','truly dark','rural','rural/suburban','suburban','bright suburban','suburban/urban','city','inner city'][v]}</option>`).join('')}</select><span class="sub">${saved?'Saved with this location.':'Save this spot to keep your own setting. Estimate: '+(C.lightPollution(S.sel.lat,S.sel.lon)?'Bortle '+C.lightPollution(S.sel.lat,S.sel.lon).bortle+' from the city-glow model':'none outside the Upper Midwest')+'.'}</span></div>`;
  }
  if(nts.length){
    h += `<div class="nights" style="margin-bottom:8px">${nts.map((x,i)=>`<button data-night="${i}" aria-pressed="${i===S.night}">${esc(nightLabel(x))}</button>`).join('')}</div>`;
    const rows = ev.res.map(r=>{
      let pk={s:0,i:-1}; const ser=[];
      for(let i=n.start;i<n.end;i++){ ser.push(r.scores[i].s); if(r.scores[i].s>pk.s) pk={s:r.scores[i].s,i}; }
      const win = C.bestWindow(ser,50)||C.bestWindow(ser,30);
      let maxAlt=-90; for(let i=n.start;i<n.end;i++) maxAlt=Math.max(maxAlt,r.scores[i].alt);
      return {r,pk,ser,win,maxAlt};
    }).sort((a,b)=>b.pk.s-a.pk.s||b.maxAlt-a.maxAlt);
    const good = rows.filter(x=>x.pk.s>0), bad = rows.filter(x=>x.pk.s===0);
    const show = S.showAll ? good : good.slice(0,8);
    h += `<ul class="tlist">${show.map(x=>targetHTML(x,n)).join('') || `<li class="empty">Nothing scores above zero ${esc(nightLabel(n).toLowerCase())}. Clouds, moonlight or daylight are in the way.</li>`}</ul>`;
    if(good.length>8) h += `<button class="more" id="showAll">${S.showAll?'Show top 8':'Show all '+good.length}</button>`;
    if(bad.length) h += `<details style="margin-top:6px"><summary class="sub" style="cursor:pointer">Not worth it ${esc(nightLabel(n).toLowerCase())} (${bad.length})</summary><ul class="tlist" style="margin-top:6px">${bad.map(x=>`<li class="why">${esc(x.r.t.name)}: ${esc(reason(x,n))}</li>`).join('')}</ul></details>`;
  } else h += `<div class="empty">No darkness in the next 72 hours at this latitude.</div>`;
  h += `</div>`;
  if(nts.length && nts[S.night]) h += planHTML(ev, nts[S.night]) + eventsHTML(nts[S.night]);
  h += driveHTML();
  if(S.interests.solar) h += solarHTML();
  return h;
}
function solarHTML(){
  const gs = C.gearStats(gearForCalc(), bortleFor(S.sel));
  let h = `<div><h4>Solar observing</h4>`;
  if(!gs.solar){
    return h + `<div class="alert danger"><div class="h">Safety first</div><p>Never point your telescope, finder or camera at the Sun without a certified full-aperture solar filter. Even a second can permanently damage your eyes. Add a white-light solar filter in Gear to get daytime forecasts for sunspots.</p></div></div>`;
  }
  const days = C.solarDays(S.times, S.sel.lat, S.sel.lon, wxAt);
  h += `<ul class="tlist">${days.map(d=>{
    const day = fmtDayLong.format(tDate(d.start));
    let peak=-90; for(let i=d.start;i<d.end;i++) peak=Math.max(peak, C.topo('Sun',tDate(i),S.sel.lat,S.sel.lon).alt);
    return `<li class="sv"><div class="info"><b>${esc(day)}</b><span class="sub">${d.win?`Clear spell ${rangeText(d.win.start,d.win.end)}`:'Too cloudy or too low'} · Sun up to ${Math.round(peak)}°</span></div></li>`;
  }).join('')}</ul><p class="note">Morning usually has steadier air than mid-afternoon, when the ground heats up. Keep the filter on the front of the scope and cap the finder.</p></div>`;
  return h;
}
function reason(x,n){
  if(!x.r.reach.ok) return x.r.reach.why || 'beyond your gear from this sky';
  if(x.maxAlt<10) return 'stays low or below the horizon during darkness';
  if(S.saved.find(v=>near(v,S.sel)&&v.horizon&&v.horizon.some(a=>a>0)) && x.r.scores.every(s=>s.clear<2||s.s===0)) return 'stays behind your trees or buildings while it is dark';
  return 'clouded out or washed out by moonlight';
}
function targetHTML(x,n){
  const r=x.r, t=r.t, s=x.pk.s;
  const ag = activeGear();
  const how = r.reach.how==='eye' ? (ag.kind==='eyes' ? 'naked eye' : ag.kind==='binoculars' ? 'naked eye & binoculars' : 'naked eye & scope') : ag.kind==='binoculars' ? 'binoculars' : 'telescope';
  const kind = C.KIND_LABEL[t.kind] || t.kind;
  const win = x.win ? `Best ${rangeText(n.start+x.win.start, n.start+x.win.end)}` : `Peaks ${hourLabel(tDate(x.pk.i))}`;
  const maxs = Math.max(1,...x.ser);
  return `<li class="tg${r.reach.marginal?' dim':''}"><div class="sc ${scoreClass(s)}"><div>${s}<small>${C.rating(s)}</small></div></div>
    <div style="min-width:0"><div class="nm"><b>${esc(t.name)}</b><span class="kd">${esc(kind)} · ${how}${r.reach.marginal?' · faint for your scope':''}${r.reach.filter?' · use '+esc(r.reach.filter):''}</span></div>
    <div class="win">${win} · up to ${Math.round(x.maxAlt)}°</div>
    <div class="spark" aria-hidden="true">${x.ser.map(v=>`<i style="height:${Math.max(2,v/100*16)}px;${v>=50?'background:var(--good)':v>=30?'background:var(--warn)':''}"></i>`).join('')}</div>
    <p class="det">${esc(r.detail)}</p></div></li>`;
}

function stripHTML(ev){
  const rows = [
    ['Cloud cover', i=>{ const w=wxAt(i); return w? [SC.cloud(w.cloud), `${Math.round(w.cloud)}% cloud`] : null; }],
    ['Transparency', i=>{ const w=wxAt(i); return w? [SC.q5(w.transp), `Transparency ${w.transp.toFixed(1)}/5`] : null; }],
    ['Seeing', i=>{ const w=wxAt(i); return w? [SC.q5(w.seeing), `Seeing ${w.seeing.toFixed(1)}/5`] : null; }],
    ['Darkness', i=>{ const p=ev.per[i]; return [darkColor(p), darkText(p)]; }],
    ['Dew risk', i=>{ const w=wxAt(i); return w? [SC.dew(w.temp-w.td), `Temp/dew point gap ${S.units==='F'?Math.round((w.temp-w.td)*1.8)+'°F':(w.temp-w.td).toFixed(1)+'°C'}`] : null; }],
    ['Wind', i=>{ const w=wxAt(i); return w? [SC.wind(w.w10), `Wind ${windU(w.w10)}`] : null; }],
    ['Model agreement', i=>{ const k=confAt(i); if(!k) return null; return [k.level==='agree'?[40,150,110]:k.level==='mixed'?[200,150,50]:[200,70,60], `Cloud forecasts: ${k.vals.map(v=>`${v.l} ${Math.round(v.v)}%`).join(', ')}`]; }],
    ['Aurora (Kp)', i=>{ const kp=kpAt(S.times[i]); if(kp==null) return null; const ch=C.auroraChance(kp, C.geomagLat(S.sel.lat,S.sel.lon)); return [SC.kp(ch.level, kp), `Kp ${kp.toFixed(1)}: aurora ${ch.text}`]; }],
    ['Temperature', i=>{ const w=wxAt(i); return w? [SC.temp(w.temp), tempU(w.temp)] : null; }]
  ];
  let h = `<div class="strip"><div class="srow days"><div class="lab"></div>`;
  for(let i=0;i<72;i++){ const d=tDate(i); h+=`<div class="cell">${d.getHours()===0||i===0?fmtDay.format(d):''}</div>`; }
  h += `</div><div class="srow hdr"><div class="lab">Hour</div>`;
  for(let i=0;i<72;i++){ const d=tDate(i), hr=d.getHours(); h+=`<div class="cell">${hr%3===0?(hr%12||12):''}</div>`; }
  h += `</div>`;
  rows.forEach(([lab,fn])=>{
    h+=`<div class="srow"><div class="lab">${lab}</div>`;
    for(let i=0;i<72;i++){ const v=fn(i); h+= v ? `<div class="cell" data-i="${i}" style="background:${rgb(v[0])}" title="${esc(fmtFull.format(tDate(i))+' · '+v[1])}"></div>` : `<div class="cell" data-i="${i}" style="background:var(--nodata)" title="No data"></div>`; }
    h+=`</div>`;
  });
  return h + `</div>`;
}
function darkColor(p){
  if(p.sunAlt>0) return [235,238,244];
  if(p.sunAlt>-18){ const t=(-p.sunAlt)/18; return [120*(1-t)+8, 160*(1-t)+12, 220*(1-t)+40]; }
  if(p.moonPos.alt>0){ const b=p.moonIllum*Math.sin(Math.max(0,p.moonPos.alt)*Math.PI/180); return [20+90*b,40+110*b,90+120*b]; }
  return [4,6,14];
}
function darkText(p){
  if(p.sunAlt>0) return 'Daylight';
  if(p.sunAlt>-18) return `Twilight (Sun ${Math.round(p.sunAlt)}°)`;
  if(p.moonPos.alt>0) return `Dark, Moon ${Math.round(p.moonIllum*100)}% lit at ${Math.round(p.moonPos.alt)}°`;
  return 'Fully dark, no Moon';
}
function highlightStrip(){
  document.querySelectorAll('.strip .cell.sel').forEach(c=>c.classList.remove('sel'));
  document.querySelectorAll(`.strip .cell[data-i="${S.ti}"]`).forEach(c=>c.classList.add('sel'));
}
function updateNowCards(){
  const el=$('#nowCards'); if(!el) return;
  const w=wxAt(S.ti), d=tDate(S.ti);
  const mi=C.moonInfo(d), moon=C.topo('Moon',d,S.sel.lat,S.sel.lon), sun=C.topo('Sun',d,S.sel.lat,S.sel.lon);
  const c = (l,v,n)=>`<div class="stat"><span class="l">${l}</span><span class="v">${v}</span><span class="n">${n}</span></div>`;
  el.innerHTML = c('Clouds', w?Math.round(w.cloud)+'%':'—', w?`high ${Math.round(w.hcloud)}%`:'no data')
    + c('Seeing', w?w.seeing.toFixed(1):'—', w?`jet ${windU(w.j250)}`:'out of 5')
    + c('Transp.', w?w.transp.toFixed(1):'—', w?(w.aod!=null?`AOD ${w.aod.toFixed(2)}`:`RH ${Math.round(w.rh)}%`):'out of 5')
    + c('Moon', Math.round(mi.illum*100)+'%', moon.alt>0?`up ${Math.round(moon.alt)}°`:'set');
}

/* ---------------- where to go tonight ---------------- */
S.drive = { radius: store.get('driveRadius', 60), busy:false, results:null, err:null, home:null, from:null };
const onLand = (lat,lon) => inNA(lat,lon);
function nightDarkHours(n, ev){ const h=[]; for(let i=n.start;i<n.end;i++) if(ev.per[i].sunAlt<-15) h.push(i); return h; }
function siteStats(lat, lon, hrs){
  const sqm = lpVal(lat,lon); const lp = C.lightPollution(lat,lon);
  let sum=0, c=0; const ok=[];
  hrs.forEach(i=>{ const v=gridVal('cloud',i,lat,lon); if(!isNaN(v)){ sum+=v; c++; } ok.push(!isNaN(v)&&v<30?1:0); });
  const win = C.bestWindow(ok,1);
  return { sqm: isNaN(sqm) ? (lp?lp.sqm:NaN) : sqm, bortle: lp?lp.bortle:null, cloud: c? sum/c : NaN, win: win ? {start:hrs[win.start], end:hrs[win.end-1]+1} : null };
}
const OVERPASS = ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter'];
async function overpass(q){
  let last;
  for(const url of OVERPASS){
    const ac=new AbortController(), timer=setTimeout(()=>ac.abort(), 35e3);
    try{
      const r=await fetch(url,{method:'POST', body:'data='+encodeURIComponent(q), headers:{'Content-Type':'application/x-www-form-urlencoded'}, signal:ac.signal});
      clearTimeout(timer);
      if(!r.ok){ last=new Error('HTTP '+r.status); continue; }
      return await r.json();
    }catch(e){ clearTimeout(timer); last=e; }
  }
  throw last || new Error('no Overpass server');
}
function placeKind(t){
  const n=t.name||'';
  if(t.dsp) return 'Dark-sky place';
  if(/National Park/i.test(n)) return 'National park';
  if(/State Park/i.test(n)) return 'State park';
  if(/National Forest/i.test(n)) return 'National forest';
  if(/State Forest/i.test(n)) return 'State forest';
  if(/County (Park|Forest)/i.test(n)) return 'County park';
  if(t.tags && t.tags.tourism==='camp_site') return 'Campground';
  if(/Wilderness/i.test(n)) return 'Wilderness';
  if(/Wildlife/i.test(n)) return 'Wildlife area';
  if(/Natural Area|Nature|Preserve/i.test(n) || (t.tags&&t.tags.leisure==='nature_reserve')) return 'Natural area';
  if(/Recreation Area/i.test(n)) return 'Recreation area';
  return 'Public land';
}
async function findDrive(){
  const ev = evaluate(), n = ev.nights[S.night];
  const D = S.drive; D.err=null; D.note=null; D.results=null;
  if(!n){ D.err='No darkness in the forecast window.'; renderPanel(); return; }
  const hrs = nightDarkHours(n, ev);
  if(!hrs.length){ D.err='The sky never gets fully dark that night.'; renderPanel(); return; }
  D.busy=true; renderPanel();
  const home = {lat:S.sel.lat, lon:S.sel.lon}, R = D.radius*1.609;
  if(S.grid) { try{ await ensureTilesAround(home.lat, home.lon, R); }catch(e){} }
  D.from = locName(); D.home = siteStats(home.lat, home.lon, hrs);
  // 1. real, named public places within range (OpenStreetMap)
  const around = `(around:${Math.round(R*1000)},${home.lat.toFixed(4)},${home.lon.toFixed(4)})`;
  const q = `[out:json][timeout:40];(
    nwr["leisure"="park"]["name"~"State Park|County Park|Recreation Area|National Park",i]${around};
    nwr["boundary"~"^(protected_area|national_park)$"]["name"~"State Park|State Forest|National Forest|National Park|Wildlife|Natural Area|Recreation Area|Wilderness|Preserve|County Forest",i]${around};
    nwr["leisure"="nature_reserve"]["name"~"State|National|Natural Area|Preserve|Wildlife",i]${around};
    nwr["landuse"="forest"]["name"~"State Forest|National Forest|County Forest",i]${around};
    nwr["tourism"="camp_site"]["name"]${around};
  );out center tags 900;`;
  let places=[];
  try{
    const j = await overpass(q);
    places = (j.elements||[]).map(e=>({ name:e.tags&&e.tags.name, tags:e.tags||{}, lat:e.lat ?? (e.center&&e.center.lat), lon:e.lon ?? (e.center&&e.center.lon), id:e.type+'/'+e.id }))
      .filter(x=>x.name && x.lat!=null && !/^(private|no)$/.test(x.tags.access||''));
  }catch(e){ console.warn('Overpass failed', e); D.note='OpenStreetMap’s park search is busy right now, so only known dark-sky places are listed. Try again in a minute for parks and forests.'; }
  // known dark-sky parks and observatories within range
  SKYPLACES.filter(([nm])=>!/Observatory/.test(nm)).forEach(([nm,la,lo])=>{ if(C.kmBetween(home.lat,home.lon,la,lo)<=R) places.push({name:nm.replace(/ · .*/,''), lat:la, lon:lo, tags:{}, id:'dsp:'+nm, dsp:true}); });
  // 2. keep the darkest point of each named place, then score
  const byName=new Map();
  places.forEach(pl=>{ const km=C.kmBetween(home.lat,home.lon,pl.lat,pl.lon); if(km>R || km<3) return;
    const lp=C.lightPollution(pl.lat,pl.lon); pl.sqm = lp ? lp.sqm : 21; pl.km=km;
    const key=pl.name.toLowerCase(); const prev=byName.get(key); if(!prev || pl.sqm>prev.sqm) byName.set(key,pl); });
  const scored=[...byName.values()].map(pl=>{
    const st=siteStats(pl.lat,pl.lon,hrs), dark=clamp((pl.sqm-18.5)/3.4,0,1);
    const clear = isNaN(st.cloud) ? 0.7 : Math.pow(clamp((100-st.cloud)/100,0,1),1.2);
    const kind=placeKind(pl), bonus = pl.dsp ? 1.25 : kind==='Campground' ? 1.08 : /park|forest|Wilderness/i.test(kind) ? 1.05 : 1;
    return { name:pl.name, kind, lat:pl.lat, lon:pl.lon, km:pl.km, st, osm: pl.id.startsWith('dsp:') ? `https://www.openstreetmap.org/?mlat=${pl.lat}&mlon=${pl.lon}#map=12/${pl.lat}/${pl.lon}` : `https://www.openstreetmap.org/${pl.id}`,
      hours:pl.tags.opening_hours||'', fee:pl.tags.fee||'', score: 100*clear*(0.25+0.75*dark)*bonus*(1-0.18*pl.km/R) };
  }).sort((a,b)=>b.score-a.score);
  const picked=[]; for(const r of scored){ if(picked.every(p=>C.kmBetween(p.lat,p.lon,r.lat,r.lon)>8)) picked.push(r); if(picked.length>=6) break; }
  D.results = picked;
  if(!picked.length) D.err = D.note ? D.note : `No named parks, forests or campgrounds found within ${D.radius} miles in OpenStreetMap. Try a larger range.`;
  if(!S.grid || isNaN(D.home.cloud)) D.note = (D.note? D.note+' ':'') + 'No cloud forecast is loaded, so places are ranked by sky darkness and distance only.';
  D.busy=false; renderPanel(); render();
  addDriveTimes();
}
function driveHTML(){
  const D=S.drive;
  let h = `<div><div class="row" style="justify-content:space-between;margin-bottom:8px"><h4 style="margin:0">Where to go</h4>
    <span class="row"><select id="driveR" aria-label="Driving range">${[30,60,90,120].map(m=>`<option value="${m}" ${m===D.radius?'selected':''}>within ${m} mi</option>`).join('')}</select>
    <button class="btn primary" id="driveGo" ${D.busy?'disabled':''}>${D.busy?'Searching…':'Find dark, clear spots'}</button></span></div>`;
  if(!D.results && !D.err) h += `<p class="note" style="margin:0">Finds named state and county parks, forests, natural areas, campgrounds and dark-sky places within range, ranked by sky darkness, clouds and distance ${esc(nightLabel(evaluate().nights[S.night]||{start:0}).toLowerCase())}.</p>`;
  if(D.err) h += `<p class="note" style="margin:0 0 6px;color:var(--warn)">${esc(D.err)}</p>`;
  if(D.note && !D.err) h += `<p class="note" style="margin:0 0 6px;color:var(--warn)">${esc(D.note)}</p>`;
  if(D.results){
    const hm = D.home;
    h += `<p class="sub" style="margin:0 0 6px">From ${esc(D.from)}: Bortle ${hm.bortle??'?'}, ${isNaN(hm.cloud)?'no forecast':Math.round(hm.cloud)+'% cloud'} during full darkness.</p><ul class="tlist">`;
    h += D.results.map((r,i)=>`<li class="sv" style="align-items:flex-start"><div class="info"><b>${esc(r.name)}</b>
      <span class="sub" style="white-space:normal">${esc(r.kind)} · ${esc(driveDetail(r))} · Bortle ${r.st.bortle??'?'} · ${isNaN(r.st.cloud)?'clouds unknown':Math.round(r.st.cloud)+'% cloud'}${r.st.win?` · clear ${rangeText(r.st.win.start,r.st.win.end)}`:''}</span>
      <span class="row" style="margin-top:5px;gap:12px"><button class="more" data-dgo="${i}" style="padding:0">Show forecast</button>
      <a class="more" style="padding:0" href="https://www.google.com/maps/dir/?api=1&destination=${r.lat.toFixed(5)},${r.lon.toFixed(5)}" target="_blank" rel="noopener">Directions</a>
      <a class="more" style="padding:0" href="${r.osm}" target="_blank" rel="noopener">Map</a></span></div></li>`).join('');
    h += `</ul><p class="note">Many parks close at night (Wisconsin state parks, for example, usually close at 11 pm unless you have a campsite), so check hours and permits before you go. Park data © OpenStreetMap contributors.</p>`;
  }
  return h + `</div>`;
}

/* saved */
function panelSaved(){
  let h = `<h2>Saved locations</h2>`;
  if(!S.saved.length) h += `<div class="empty">No saved spots yet. Click anywhere on the globe, then press <b>Save</b> in the Forecast tab. Saved spots get their own sky-darkness setting and can send you alerts.</div>`;
  else h += `<ul class="slist">${S.saved.map((s,i)=>`<li class="sv"><div class="info"><b>${esc(s.name)}</b><span class="sub mono">${s.lat.toFixed(3)}°, ${s.lon.toFixed(3)}° · Bortle ${s.bortle}</span>${s.home?' <span class="tag saved">Home</span>':''}</div>
     ${S.confirmDel===i ? `<button class="btn danger" data-del="${i}">Delete</button><button class="btn ghost" data-cancel>Keep</button>` : `<button class="btn" data-go="${i}">View</button><button class="btn ghost" data-home="${i}" title="${s.home?'Stop opening here':'Open Starcast here'}">${s.home?'Unset home':'Set home'}</button><button class="btn ghost" data-ask="${i}" aria-label="Delete ${esc(s.name)}">✕</button>`}</li>`).join('')}</ul>`;
  h += addLocationHTML();
  h += backupHTML();
  h += installHTML();
  h += `<div><h4>Defaults</h4><div class="form"><label class="f">Sky darkness outside the Upper Midwest<select id="defBortle">${[1,2,3,4,5,6,7,8,9].map(v=>`<option ${v===S.defBortle?'selected':''}>${v}</option>`).join('')}</select></label>
    <label class="f">Units<select id="units"><option value="F" ${S.units==='F'?'selected':''}>°F, mph</option><option value="C" ${S.units==='C'?'selected':''}>°C, km/h</option></select></label></div>
    <p class="note">Bortle class rates sky brightness from 1 (pristine) to 9 (inner city). It sets how faint you can see, which decides what is worth pointing at.</p></div>`;
  h += logHTML();
  h += alertsHTML();
  h += checksHTML();
  h += `<p class="note">Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a> (CC BY 4.0), including Copernicus CAMS aerosol forecasts. Aurora forecasts from NOAA SWPC. Park data © OpenStreetMap contributors; driving times by OSRM. Satellite orbits from CelesTrak. Sky positions by Astronomy Engine and satellite.js. Stars and constellations from d3-celestial (Olaf Frohn). Maps from Natural Earth.</p>`;

  return h;
}

/* alert settings: exported for the scheduled GitHub job */
S.alertRules = Object.assign({quality:'good', minHours:2, aurora:true, appUrl:''}, store.get('alertRules',{}));
function alertConfig(){
  return { version:1, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago', units:S.units,
    appUrl:S.alertRules.appUrl || '', rules:{quality:S.alertRules.quality, minHours:S.alertRules.minHours, aurora:S.alertRules.aurora},
    gear:gearForCalc(), interests:S.interests,
    locations:S.saved.filter(x=>x.alerts!==false).map(x=>Object.assign({name:x.name, lat:+x.lat.toFixed(4), lon:+x.lon.toFixed(4), bortle:x.bortle}, x.horizon&&x.horizon.some(v=>v>0)?{horizon:x.horizon}:{})) };
}
function alertsHTML(){
  const R=S.alertRules, on=S.saved.filter(x=>x.alerts!==false);
  let h = `<div><h4>Alerts</h4><p class="note" style="margin:0 0 8px">A free scheduled job on GitHub checks the forecast every afternoon and sends a phone notification or email when your rules are met, plus a week-ahead outlook every Monday morning. The README walks through the one-time setup.</p>`;
  if(S.saved.length) h += `<div class="checks" style="margin-bottom:8px">${S.saved.map((x,i)=>`<label><input type="checkbox" data-alon="${i}" ${x.alerts!==false?'checked':''}> ${esc(x.name)}</label>`).join('')}</div>`;
  else h += `<p class="note" style="margin:0 0 8px">Save a location first; alerts are sent for saved spots.</p>`;
  h += `<div class="form">
    <label class="f">Alert when conditions are<select id="al_q"><option value="good" ${R.quality==='good'?'selected':''}>Good or better</option><option value="great" ${R.quality==='great'?'selected':''}>Great only</option></select></label>
    <label class="f">For at least<select id="al_h">${[1,2,3,4].map(v=>`<option value="${v}" ${v===R.minHours?'selected':''}>${v} hour${v>1?'s':''}</option>`).join('')}</select></label>
    <label class="checks wide" style="display:flex;gap:7px"><input type="checkbox" id="al_a" ${R.aurora?'checked':''}> Also alert when aurora may be visible and skies are clear enough</label>
    <label class="f wide">Your Starcast web address (opens when you tap a notification)<input type="text" id="al_u" value="${esc(R.appUrl)}" placeholder="https://your-name.github.io/starcast/"></label>
  </div>
  <div class="row" style="margin-top:8px"><button class="btn primary" id="alCopy" ${on.length?'':'disabled'}>Copy alert settings</button><span class="note">Paste into the ALERTS_CONFIG secret on GitHub.</span></div>
  <textarea id="alText" hidden readonly style="width:100%;height:110px;margin-top:6px;background:var(--bg);color:var(--fg);border:1px solid var(--line-2);border-radius:6px;font-family:var(--f-mono);font-size:11px"></textarea></div>`;
  return h;
}

/* forecast checks: compare Starcast with ClearDarkSky and with what you actually saw */
const CDS_CLOUD = [[0,'Clear'],[10,'10% covered'],[20,'20%'],[30,'30%'],[40,'40%'],[50,'50%'],[60,'60%'],[70,'70%'],[80,'80%'],[90,'90%'],[100,'Overcast']];
const CDS_TR = [[5,'Transparent'],[4,'Above average'],[3,'Average'],[2,'Below average'],[1,'Poor']];
const CDS_SE = [[5,'Excellent 5/5'],[4,'Good 4/5'],[3,'Average 3/5'],[2,'Poor 2/5'],[1,'Bad 1/5']];
const OBS_CL = [[0,'Clear'],[20,'A few clouds'],[50,'Partly cloudy'],[80,'Mostly cloudy'],[100,'Overcast']];
const OBS_SE = [[5,'5 · star a steady point at 135×'],[4,'4 · brief shimmer'],[3,'3 · steady half the time'],[2,'2 · constant shimmer'],[1,'1 · boiling, no detail']];
const OBS_TR = [[5,'5 · Milky Way obvious'],[4,'4 · Milky Way faint'],[3,'3 · Little Dipper all visible'],[2,'2 · only bright stars'],[1,'1 · hazy, few stars']];
const opt = (arr, id, label) => `<label class="f">${label}<select id="${id}"><option value="">Not recorded</option>${arr.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label>`;
function checksHTML(){
  const ck = S.checks;
  let h = `<div><h4>Forecast checks</h4><p class="note" style="margin:0 0 8px">Compare Starcast with ClearDarkSky and with what you actually see. Move the time slider to the hour you are checking, open the nearest ClearDarkSky chart, then record both. About 10 nights is enough to tune the estimates.</p>`;
  if(!S.checkOpen) h += `<button class="btn primary" id="ckOpen">Add a check for ${esc(fmtFull.format(tDate(S.ti)).replace(/\s?([AP])M/,(m,a)=>a==='A'?' am':' pm'))}</button>`;
  else {
    const w = wxAt(S.ti);
    h += `<form class="form" id="ckForm" style="border:1px solid var(--line);border-radius:6px;padding:10px">
      <div class="wide sub">${esc(locName())} · ${esc(fmtFull.format(tDate(S.ti)))}. Starcast says: ${w?`clouds ${Math.round(w.cloud)}%, transparency ${w.transp.toFixed(1)}, seeing ${w.seeing.toFixed(1)}`:'no forecast for this spot'}.</div>
      <div class="wide"><h4 style="margin:4px 0 0">ClearDarkSky showed</h4></div>
      ${opt(CDS_CLOUD,'ck_cc','Cloud cover')}${opt(CDS_TR,'ck_ct','Transparency')}${opt(CDS_SE,'ck_cs','Seeing')}<span></span>
      <div class="wide"><h4 style="margin:4px 0 0">You saw</h4></div>
      ${opt(OBS_CL,'ck_oc','Sky')}${opt(OBS_TR,'ck_ot','Transparency')}${opt(OBS_SE,'ck_os','Seeing')}
      <label class="f wide">Notes<input type="text" id="ck_note" placeholder="e.g. dew by 11, thin cirrus in the west"></label>
      <div class="wide row"><button class="btn primary" type="submit">Save check</button><button class="btn ghost" type="button" id="ckCancel">Cancel</button></div>
    </form>`;
  }
  if(ck.length){
    const stat = (a,b,k) => { const d=ck.filter(c=>c.sc&&c[a]&&c.sc[k]!=null&&c[a][k]!=null); if(!d.length) return '—'; const bias=d.reduce((s,c)=>s+(c.sc[k]-c[a][k]),0)/d.length; return `${bias>=0?'+':''}${bias.toFixed(k==='cloud'?0:1)}${k==='cloud'?'%':''} <span class="sub">(${d.length})</span>`; };
    let closer=0, tot=0; ck.forEach(c=>['cloud','transp','seeing'].forEach(k=>{ if(c.sc&&c.cds&&c.obs&&c.sc[k]!=null&&c.cds[k]!=null&&c.obs[k]!=null){ const sk=k==='cloud'?20:1; tot++; if(Math.abs(c.sc[k]-c.obs[k])/sk <= Math.abs(c.cds[k]-c.obs[k])/sk) closer++; } }));
    h += `<table class="views" style="margin-top:10px"><thead><tr><th>Starcast bias</th><th class="r">vs ClearDarkSky</th><th class="r">vs your eyes</th></tr></thead><tbody>
      ${[['Clouds','cloud'],['Transparency','transp'],['Seeing','seeing']].map(([l,k])=>`<tr><td>${l}</td><td class="mono">${stat('cds','',k)}</td><td class="mono">${stat('obs','',k)}</td></tr>`).join('')}
    </tbody></table><p class="note">Positive means Starcast reads higher (cloudier, or more optimistic on seeing and transparency).${tot?` Starcast was as close or closer to what you saw in ${closer} of ${tot} comparisons.`:''}</p>
    <ul class="slist">${ck.slice().reverse().slice(0,8).map(c=>`<li class="sv"><div class="info"><b>${esc(fmtFull.format(new Date(c.at*1000)))}</b><span class="sub">${esc(c.name)} · Starcast ${c.sc?`${Math.round(c.sc.cloud)}% / T${c.sc.transp} / S${c.sc.seeing}`:'—'} · CDS ${fmtTrip(c.cds)} · You ${fmtTrip(c.obs)}</span></div><button class="btn ghost" data-ckdel="${c.id}" aria-label="Delete check">✕</button></li>`).join('')}</ul>
    <div class="row"><button class="btn" id="ckCopy">Copy all ${ck.length} check${ck.length===1?'':'s'}</button><span class="note">Paste them to Claude to tune the estimates.</span></div>
    <textarea id="ckText" hidden readonly style="width:100%;height:90px;background:var(--bg);color:var(--fg);border:1px solid var(--line-2);border-radius:6px;font-family:var(--f-mono);font-size:11px"></textarea>`;
  }
  return h + `</div>`;
}
function fmtTrip(o){ if(!o) return '—'; return `${o.cloud!=null?o.cloud+'%':'?'} / T${o.transp??'?'} / S${o.seeing??'?'}`; }
function checksTSV(){
  const head='time\tlocation\tlat\tlon\tsc_cloud\tsc_transp\tsc_seeing\tcds_cloud\tcds_transp\tcds_seeing\tobs_cloud\tobs_transp\tobs_seeing\tnotes';
  return [head].concat(S.checks.map(c=>[new Date(c.at*1000).toISOString(),c.name,c.lat.toFixed(3),c.lon.toFixed(3),
    ...['cloud','transp','seeing'].map(k=>c.sc?c.sc[k]:''),...['cloud','transp','seeing'].map(k=>c.cds?c.cds[k]??'':''),...['cloud','transp','seeing'].map(k=>c.obs?c.obs[k]??'':''),c.note||''].join('\t'))).join('\n');
}

/* calendar */
function panelCal(){
  const ev = C.calendar(new Date(S.times[0]*1000 - 3600e3), 12, S.sel.lat, S.sel.lon)
    .concat(occultationEvents()).sort((a,b)=>a.date-b.date)
    .filter(e => S.interests.meteors || e.kind!=='meteor');
  const F = [['all','All'],['planet','Planets'],['mars','Mars seasons'],['moon','Moon'],['occultation','Occultations'],['meteor','Meteors'],['eclipse','Eclipses']];
  const list = ev.filter(e => S.calFilter==='all' || e.kind===S.calFilter);
  let h = `<div><h2>Sky calendar</h2><div class="sub">Next 12 months from ${esc(locName())}. Events inside the 72-hour window pick up the cloud forecast.</div></div>`;
  const now = tDate(S.ti), ms = C.marsSeason(now), sr = C.saturnRings(now);
  h += `<div class="gstats">
    <div class="stat"><span class="l">Mars season</span><span class="v" style="font-size:14px">Year ${ms.MY} · Ls ${Math.round(ms.Ls)}°</span><span class="n" style="white-space:normal">${esc(ms.north[0].toUpperCase()+ms.north.slice(1))} north, ${esc(ms.south)} south.${ms.dust?' Dust-storm season.':''}</span></div>
    <div class="stat"><span class="l">Saturn's rings</span><span class="v" style="font-size:14px">${Math.abs(sr.B).toFixed(1)}° ${sr.face} face</span><span class="n" style="white-space:normal">${sr.opening?'Opening':'Closing'}${sr.opening&&sr.face==='south'?'; widest around 2032':''}.</span></div>
  </div><p class="note" style="margin:-8px 0 0">${esc(ms.cap)} Live Martian weather reports aren't available from a free source right now, so Starcast tracks the season and dust-storm risk instead.</p>`;
  h += `<div class="filters">${F.map(([k,l])=>`<button data-cf="${k}" aria-pressed="${S.calFilter===k}">${l}</button>`).join('')}</div>`;
  let month='', body='';
  list.forEach(e=>{
    const m=fmtMon.format(e.date);
    if(m!==month){ if(month) body+='</div>'; body+=`<div class="month"><h4 style="margin:10px 0 0">${m}</h4>`; month=m; }
    body += `<div class="ev"><div class="d"><b>${e.date.getDate()}</b><span>${fmtDay.format(e.date)}</span></div><div><div class="t">${esc(e.title)} <span class="tag ${e.kind}">${e.kind}</span></div><div class="nt">${esc(e.note)}</div>${eventForecast(e)}</div></div>`;
  });
  if(month) body+='</div>';
  return h + (body || `<div class="empty">No events of this type in the next 12 months.</div>`);
}
function eventForecast(e){
  const u=e.date.getTime()/1000;
  if(u<S.times[0]-3600 || u>S.times[71]) return '';
  // look at the dark hours around the event (meteors: midnight–5am)
  const i0 = S.times.findIndex(t=>t>=u-3*3600), i1=Math.min(71, i0+6);
  if(i0<0) return '';
  let s=0,c=0; for(let i=i0;i<=i1;i++){ const w=wxAt(i); if(w){ s+=w.cloud; c++; } }
  if(!c) return '';
  const cl=s/c;
  return `<span class="fc">Forecast: ${cl<20?'mostly clear':cl<50?'partly cloudy':'mostly cloudy'} (${Math.round(cl)}% cloud ${rangeText(i0,i1+1)})</span>`;
}

/* gear */
/* wiring */
function wirePanel(){
  const b=$('#pbody');
  wireLocations(b);
  b.querySelectorAll('.strip .cell[data-i]').forEach(c=>c.onclick=()=>setTime(+c.dataset.i));
  b.querySelectorAll('[data-night]').forEach(x=>x.onclick=()=>{ S.night=+x.dataset.night; S.showAll=false; renderPanel(); const n=evaluate().nights[S.night]; if(n) setTime(n.start+Math.min(3,n.end-n.start-1)); });
  const sa=$('#showAll'); if(sa) sa.onclick=()=>{ S.showAll=!S.showAll; renderPanel(); };
  const save=$('#saveBtn'); if(save) save.onclick=()=>{ S.savingName = S.sel.name && !S.sel.name.includes('example') ? S.sel.name : ''; renderPanel(); const i=$('#saveName'); if(i) i.focus(); };
  const sf=$('#saveForm'); if(sf){ sf.onsubmit=e=>{ e.preventDefault(); const nm=$('#saveName').value.trim()||'My spot'; S.saved.push({name:nm, lat:S.sel.lat, lon:S.sel.lon, bortle:bortleFor(S.sel), alerts:true}); store.set('saved',S.saved); S.savingName=null; toast(`Saved “${nm}”`); renderPanel(); render(); };
    $('#saveCancel').onclick=()=>{ S.savingName=null; renderPanel(); }; }
  const be=$('#bortleEdit'); if(be) be.onclick=()=>{ S.bortleOpen=!S.bortleOpen; renderPanel(); };
  const bs=$('#bortleSel'); if(bs) bs.onchange=()=>{ const v=+bs.value; const s=S.saved.find(x=>near(x,S.sel)); if(s){ s.bortle=v; store.set('saved',S.saved); S.eval=null; renderPanel(); } else { toast('Save this spot first to set its sky darkness'); } };
  b.querySelectorAll('[data-go]').forEach(x=>x.onclick=()=>{ const s=S.saved[+x.dataset.go]; selectLocation({lat:s.lat,lon:s.lon,name:s.name},{fly:true,tab:'loc'}); });
  b.querySelectorAll('[data-ask]').forEach(x=>x.onclick=()=>{ S.confirmDel=+x.dataset.ask; renderPanel(); });
  b.querySelectorAll('[data-cancel]').forEach(x=>x.onclick=()=>{ S.confirmDel=null; renderPanel(); });
  b.querySelectorAll('[data-del]').forEach(x=>x.onclick=()=>{ const s=S.saved.splice(+x.dataset.del,1)[0]; S.confirmDel=null; store.set('saved',S.saved); toast(`Deleted “${s.name}”`); renderPanel(); render(); });
  b.querySelectorAll('[data-alon]').forEach(x=>x.onchange=()=>{ S.saved[+x.dataset.alon].alerts=x.checked; store.set('saved',S.saved); });
  const saveRules=()=>{ S.alertRules={quality:$('#al_q').value, minHours:+$('#al_h').value, aurora:$('#al_a').checked, appUrl:$('#al_u').value.trim()}; store.set('alertRules',S.alertRules); };
  ['#al_q','#al_h','#al_a','#al_u'].forEach(id=>{ const el=$(id); if(el) el.onchange=saveRules; });
  const ac=$('#alCopy'); if(ac) ac.onclick=()=>{ saveRules(); const txt=JSON.stringify(alertConfig(),null,1), ta=$('#alText'); ta.value=txt;
    navigator.clipboard.writeText(txt).then(()=>toast('Alert settings copied')).catch(()=>{ ta.hidden=false; ta.select(); toast('Select and copy the text below'); }); };
  const co=$('#ckOpen'); if(co) co.onclick=()=>{ S.checkOpen=true; renderPanel(); };
  const cc=$('#ckCancel'); if(cc) cc.onclick=()=>{ S.checkOpen=false; renderPanel(); };
  const cf=$('#ckForm'); if(cf) cf.onsubmit=e=>{ e.preventDefault();
    const v=id=>{ const x=$(id).value; return x===''?null:+x; };
    const w=wxAt(S.ti);
    S.checks.push({ id:Date.now(), at:S.times[S.ti], name:locName(), lat:S.sel.lat, lon:S.sel.lon,
      sc: w ? {cloud:Math.round(w.cloud), transp:+w.transp.toFixed(1), seeing:+w.seeing.toFixed(1)} : null,
      cds:{cloud:v('#ck_cc'), transp:v('#ck_ct'), seeing:v('#ck_cs')}, obs:{cloud:v('#ck_oc'), transp:v('#ck_ot'), seeing:v('#ck_os')}, note:$('#ck_note').value.trim() });
    store.set('checks',S.checks); S.checkOpen=false; toast('Check saved'); renderPanel(); };
  b.querySelectorAll('[data-ckdel]').forEach(x=>x.onclick=()=>{ S.checks=S.checks.filter(c=>c.id!==+x.dataset.ckdel); store.set('checks',S.checks); renderPanel(); });
  const cp=$('#ckCopy'); if(cp) cp.onclick=()=>{ const txt=checksTSV(), ta=$('#ckText'); ta.value=txt;
    navigator.clipboard.writeText(txt).then(()=>toast('Copied')).catch(()=>{ ta.hidden=false; ta.select(); toast('Select and copy the text below'); }); };
  const dr=$('#driveR'); if(dr) dr.onchange=()=>{ S.drive.radius=+dr.value; store.set('driveRadius',S.drive.radius); };
  const dg=$('#driveGo'); if(dg) dg.onclick=()=>findDrive();
  b.querySelectorAll('[data-dgo]').forEach(x=>x.onclick=()=>{ const r=S.drive.results[+x.dataset.dgo]; selectLocation({lat:r.lat,lon:r.lon,name:r.name},{fly:true,tab:'loc'}); });
  const db=$('#defBortle'); if(db) db.onchange=()=>{ S.defBortle=+db.value; store.set('defBortle',S.defBortle); S.eval=null; };
  const un=$('#units'); if(un) un.onchange=()=>{ S.units=un.value; store.set('units',S.units); };
  b.querySelectorAll('[data-cf]').forEach(x=>x.onclick=()=>{ S.calFilter=x.dataset.cf; renderPanel(); });
  wireGear(b);
  wireTelescope(b);
  wireEvents(b);
  wireBackup();
  wireInstall();
}
function toast(msg){ const t=document.createElement('div'); t.className='toast'; t.textContent=msg; t.setAttribute('role','status'); document.body.appendChild(t); setTimeout(()=>t.remove(),1800); }

/* mobile sheet */
function setSheet(size){ const p=$('#panel'); p.classList.remove('big','small'); if(size==='big') p.classList.add('big'); if(size==='small') p.classList.add('small');
  document.documentElement.style.setProperty('--sheet', size==='big'?'88%':size==='small'?'118px':'52%'); setTimeout(resize, 280); }
$('#handle').onclick=()=>{ const p=$('#panel'); setSheet(p.classList.contains('big')?'small':p.classList.contains('small')?'mid':'big'); };

/* red mode */
$('#redBtn').onclick=()=>{ S.red=!S.red; $('#red').hidden=!S.red; $('#redBtn').setAttribute('aria-pressed',S.red); };
