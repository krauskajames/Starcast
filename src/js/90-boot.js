/* boot */
window.addEventListener('resize', ()=>{ clearTimeout(resize.t); resize.t=setTimeout(resize,80); });
applyTheme(store.get('theme','auto'));
{ const hm = homeSpot(); if(hm){ S.sel = {lat:hm.lat, lon:hm.lon, name:hm.name}; } }
buildLayers(); showAttribution(); resize();
proj.rotate([-S.sel.lon, -S.sel.lat, 0]);
setTime(nowIndex());
renderPanel();
loadCoarse(false);
loadAurora();
setInterval(()=>{ const h=Math.floor(Date.now()/3600000)*3600; if(h!==S.times[0]){ buildTimes(); S.eval=null; loadCoarse(false); } }, 5*60e3);
registerSW();
