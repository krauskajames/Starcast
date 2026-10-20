/* Forecast confidence (model agreement), drive times, settings backup, home-screen install. */

/* --- forecast confidence: compare three global models for the selected spot --- */
const MODELS = [['gfs_seamless','US (GFS)'],['ecmwf_ifs025','European (ECMWF)'],['gem_seamless','Canadian (GEM)']];
S.conf = { key:'', data:null };
async function loadConfidence(lat, lon){
  const key=lat.toFixed(3)+','+lon.toFixed(3)+','+S.times[0];
  if(S.conf.key===key) return; S.conf={key, data:null};
  try{
    const j = await getJSON(`${API}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&hourly=cloud_cover&models=${MODELS.map(m=>m[0]).join(',')}&forecast_days=4&timeformat=unixtime&timezone=GMT`);
    const off=j.hourly.time.indexOf(S.times[0]); if(off<0) return;
    const data={};
    MODELS.forEach(([m])=>{ const a=j.hourly['cloud_cover_'+m]; if(a) data[m]=S.times.map((_,t)=>a[off+t]==null?NaN:a[off+t]); });
    if(S.conf.key!==key || !Object.keys(data).length) return;
    S.conf.data=data; if(S.tab==='loc'){ const b=$('#pbody'), y=b.scrollTop; renderPanel(); b.scrollTop=y; }
  }catch(e){ /* confidence is optional */ }
}
function confAt(t){
  const d=S.conf.data; if(!d) return null;
  const vals=MODELS.map(([m,l])=>({l, v:d[m]?d[m][t]:NaN})).filter(x=>!isNaN(x.v));
  if(vals.length<2) return null;
  const vs=vals.map(x=>x.v), spread=Math.max(...vs)-Math.min(...vs);
  return { spread, vals, level: spread<20?'agree':spread<45?'mixed':'disagree' };
}
function confidenceText(n){
  if(!S.conf.data) return '';
  let worst=0, c=0;
  for(let i=n.start;i<n.end;i++){ const k=confAt(i); if(k){ worst+=k.spread; c++; } }
  if(!c) return '';
  const avg=worst/c;
  return avg<20 ? 'The US, European and Canadian models agree, so this forecast is fairly reliable.' : avg<40 ? 'The forecast models differ somewhat on clouds; check again closer to dark.' : 'The forecast models disagree a lot about clouds tonight; treat this forecast with caution.';
}

/* --- driving times (OSRM public router) and park opening hours --- */
async function addDriveTimes(){
  const D=S.drive; if(!D.results||!D.results.length) return;
  try{
    const pts=[[S.sel.lon,S.sel.lat]].concat(D.results.map(r=>[r.lon,r.lat])).map(p=>p[0].toFixed(5)+','+p[1].toFixed(5)).join(';');
    const j=await getJSON(`https://router.project-osrm.org/table/v1/driving/${pts}?sources=0&annotations=duration,distance`);
    if(j.code!=='Ok') return;
    D.results.forEach((r,i)=>{ const s=j.durations[0][i+1], m=j.distances?j.distances[0][i+1]:null; if(s!=null){ r.driveMin=Math.round(s/60); r.driveMi=m!=null?Math.round(m/1609):null; } });
    if(S.tab==='loc'){ const b=$('#pbody'), y=b.scrollTop; renderPanel(); b.scrollTop=y; }
  }catch(e){ /* straight-line distance stays */ }
}
function driveDetail(r){
  const parts=[];
  if(r.driveMin!=null) parts.push(`${r.driveMin>=60?Math.floor(r.driveMin/60)+' h '+(r.driveMin%60)+' min':r.driveMin+' min'} drive${r.driveMi!=null?` (${r.driveMi} mi)`:''}`);
  else parts.push(`~${Math.round(r.km*0.621)} mi straight line`);
  if(r.hours) parts.push(`hours: ${r.hours}`);
  if(r.fee==='yes') parts.push('fee or permit');
  return parts.join(' · ');
}

/* --- settings backup and restore --- */
const BACKUP_SKIP = new Set(['tle','grid']);
function backupData(){
  const out={ app:'Starcast', version:3, saved:new Date().toISOString(), data:{} };
  try{ for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(!k.startsWith('starcast.')) continue; const kk=k.slice(9); if(BACKUP_SKIP.has(kk)) continue; out.data[kk]=JSON.parse(localStorage.getItem(k)); } }catch(e){}
  return out;
}
function backupHTML(){
  return `<div><h4>Back up and move to another device</h4>
    <p class="note" style="margin:0 0 8px">Your saved spots, gear, log and settings live in this browser only. Save a backup file to keep them safe, or open it on your phone or another computer to copy everything over.</p>
    <div class="row"><button class="btn" id="bkSave">Save backup file</button>
    <label class="btn" for="bkFile" style="cursor:pointer">Restore from file</label><input type="file" id="bkFile" accept="application/json,.json" hidden></div>
    <p class="note" id="bkMsg" style="margin:6px 0 0"></p></div>`;
}
function wireBackup(){
  const bs=$('#bkSave'); if(bs) bs.onclick=()=>{
    const blob=new Blob([JSON.stringify(backupData(),null,1)],{type:'application/json'}), a=document.createElement('a');
    a.href=URL.createObjectURL(blob); a.download=`starcast-backup-${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1000); toast('Backup saved'); };
  const bf=$('#bkFile'); if(bf) bf.onchange=async()=>{
    const f=bf.files[0], msg=$('#bkMsg'); if(!f) return;
    try{ const j=JSON.parse(await f.text()); if(j.app!=='Starcast'||!j.data) throw new Error('not a Starcast backup');
      Object.entries(j.data).forEach(([k,v])=>store.set(k,v));
      msg.textContent='Restored. Reloading…'; setTimeout(()=>location.reload(),600);
    }catch(e){ msg.textContent='That file is not a Starcast backup. Choose a file saved with “Save backup file”.'; msg.style.color='var(--bad)'; }
  };
}

/* --- install as an app (service worker only works when hosted, not from a local file) --- */
function registerSW(){
  if(!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}
let installEvt=null;
window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); installEvt=e; const b=$('#installBtn'); if(b) b.hidden=false; });
function installHTML(){
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
  return `<div><h4>Install on your phone</h4><p class="note" style="margin:0 0 8px">${ios?'In Safari, tap the Share button, then “Add to Home Screen.”':'In Chrome or Edge, use the menu’s “Install app” or “Add to Home screen.”'} Starcast then opens like an app, and the sky chart, plan and calendar work offline (the forecast needs a connection).</p>
    <button class="btn" id="installBtn" ${installEvt?'':'hidden'}>Install Starcast</button></div>`;
}
function wireInstall(){ const b=$('#installBtn'); if(b) b.onclick=async()=>{ if(!installEvt) return; installEvt.prompt(); try{ await installEvt.userChoice; }catch(e){} installEvt=null; b.hidden=true; }; }
