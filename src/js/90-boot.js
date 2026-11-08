/* boot */
window.addEventListener('resize', ()=>{ clearTimeout(resize.t); resize.t=setTimeout(resize,80); });
{ const t=(location.search.match(/[?&]theme=(light|dark)\b/)||[])[1]; applyTheme(t || store.get('theme','auto')); }
{ const hm = homeSpot(); if(hm){ S.sel = {lat:hm.lat, lon:hm.lon, name:hm.name}; } }
buildLayers(); showAttribution(); resize();
setTime(nowIndex());
renderPanel();
refreshWeather(false);
loadAurora();
setInterval(()=>{ const h=Math.floor(Date.now()/3600000)*3600; if(h!==S.times[0]){ buildTimes(); S.eval=null; refreshWeather(false); } }, 5*60e3);
if(!MODE.embed){ registerSW(); initAccount(); }
// Visitor stats (GoatCounter: no cookies, no personal data). The portfolio embed counts as its own page;
// automated recordings aren't counted.
if(!MODE.record && /^https:$/.test(location.protocol)){
  window.goatcounter = MODE.embed ? { path: '/Starcast/embed' } : {};
  const gc=document.createElement('script'); gc.async=true; gc.src='https://gc.zgo.at/count.js';
  gc.dataset.goatcounter='https://krauskagis.goatcounter.com/count'; document.head.appendChild(gc);
}
// embed: turn slowly until someone drags or zooms. record: the capture script turns it frame by frame.
if(MODE.embed && !MODE.record && !matchMedia('(prefers-reduced-motion: reduce)').matches){
  let last=performance.now(), on=true;
  const stop=()=>{ on=false; };
  canvas.addEventListener('pointerdown', stop); canvas.addEventListener('wheel', stop, {passive:true});
  (function spin(now){ if(!on) return; const r=proj.rotate(); proj.rotate([r[0]+(now-last)*0.004, r[1], r[2]]); last=now; render(); requestAnimationFrame(spin); })(last);
}
if(/[?&](debug|record)\b/.test(location.search)) window.__sc = { S, GL, WX, gridVal, globalValue, proj, render, inLand, draw, setTime }; // for automated tests
