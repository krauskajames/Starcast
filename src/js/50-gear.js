/* Gear tab: instrument profiles (telescope, binoculars, naked eye), eyepiece advisor,
   photography helper (exposures, trailing limits, framing preview), interests. */

const BINO_DEFAULT = { kind:'binoculars', name:'10×50 binoculars', aperture:50, mag:10, field:6.5 };
const MOUNTS = [['manual','Manual equatorial (no motor)'],['motor','Equatorial with motor drive'],['tracking','Computerized tracking / GoTo'],['altaz','Alt-azimuth, no tracking']];
S.frameTarget = store.get('frameTarget','M42');
S.photoIso = store.get('photoIso', 400);

function profileLabel(g){ return g.kind==='binoculars' ? 'Binoculars' : g.kind==='eyes' ? 'Naked eye' : 'Telescope'; }

function panelGear(){
  const g=activeGear(), gs=C.gearStats(gearForCalc(), bortleFor(S.sel)), I=S.interests;
  let h = `<div><h2>Your gear</h2><div class="sub">Starcast plans with the instrument selected here. Add binoculars or a naked-eye profile to compare.</div></div>`;
  h += `<div class="nights">${S.gears.map((x,i)=>`<button data-gp="${i}" aria-pressed="${i===S.gearIdx}">${esc(x.name||profileLabel(x))}</button>`).join('')}
    <button data-gadd="telescope">+ Telescope</button><button data-gadd="binoculars">+ Binoculars</button>${S.gears.some(x=>x.kind==='eyes')?'':'<button data-gadd="eyes">+ Naked eye</button>'}</div>`;

  if(g.kind==='eyes'){
    h += `<div class="gstats"><div class="stat"><span class="l">Faintest star</span><span class="v">mag ${gs.nelm.toFixed(1)}</span><span class="n">at this location's sky darkness</span></div>
      <div class="stat"><span class="l">Field</span><span class="v">the whole sky</span><span class="n">best for constellations, meteors, the Milky Way</span></div></div>`;
  } else if(g.kind==='binoculars'){
    h += `<div class="gstats">
      <div class="stat"><span class="l">Magnification</span><span class="v">${gs.views[0].mag}×</span><span class="n">exit pupil ${gs.views[0].exit.toFixed(1)} mm</span></div>
      <div class="stat"><span class="l">Faintest star</span><span class="v">mag ${gs.limMag.toFixed(1)}</span><span class="n">naked eye ${gs.nelm.toFixed(1)} here</span></div>
      <div class="stat"><span class="l">Field of view</span><span class="v">${gs.views[0].tfov}°</span><span class="n">about ${Math.round(gs.views[0].tfov/0.5)} full Moons wide</span></div>
      <div class="stat"><span class="l">Light grasp</span><span class="v">${Math.round(gs.lightGrasp)}×</span><span class="n">your dark-adapted eye</span></div></div>`;
  } else {
    h += `<div class="gstats">
      <div class="stat"><span class="l">Magnification</span><span class="v">${gs.views.map(v=>Math.round(v.mag)+'×').join(' · ')||'—'}</span><span class="n">max useful ~${Math.round(gs.maxUseful)}×</span></div>
      <div class="stat"><span class="l">Faintest star</span><span class="v">mag ${gs.limMag.toFixed(1)}</span><span class="n">naked eye ${gs.nelm.toFixed(1)} here</span></div>
      <div class="stat"><span class="l">Resolution</span><span class="v">${gs.dawes.toFixed(2)}″</span><span class="n">Dawes limit · f/${gs.ratio.toFixed(1)}</span></div>
      <div class="stat"><span class="l">Light grasp</span><span class="v">${Math.round(gs.lightGrasp)}×</span><span class="n">your dark-adapted eye</span></div></div>`;
    if(gs.views.length) h += `<table class="views"><thead><tr><th>View</th><th class="r">Power</th><th class="r">Field</th><th class="r">Exit pupil</th></tr></thead><tbody>${gs.views.map(v=>`<tr><td>${esc(v.label)}</td><td class="mono">${Math.round(v.mag)}×</td><td class="mono">${v.tfov.toFixed(2)}°</td><td class="mono">${v.exit.toFixed(1)} mm</td></tr>`).join('')}</tbody></table>`;
    const adv = C.eyepieceAdvice(g);
    if(adv.length) h += `<div><h4>Eyepiece advisor</h4><ul class="tlist">${adv.map(a=>`<li class="sv"><div class="info"><b>${a.fl} mm · ${Math.round(a.mag)}×</b><span class="sub" style="white-space:normal">${esc(a.text)}</span></div></li>`).join('')}</ul>
      <p class="note">Ranked by how much each fills the biggest gap in your current range. Your focuser takes 1.25″ eyepieces, which top out around 32 mm for the widest field.</p></div>`;
  }
  h += gearFormHTML(g);
  if(g.kind==='telescope' && g.cameraOn) h += photoHTML(g, gs);
  h += `<div><h4>Interests</h4><form id="intForm"><div class="checks">
      ${[['nakedEye','Naked-eye stargazing'],['planets','Planets'],['moon','The Moon'],['deepsky','Galaxies, nebulae, clusters'],['doubles','Double stars'],['meteors','Meteor showers'],['photo','Astrophotography targets'],['solar','Solar observing'],['satellites','Satellite passes (ISS)']].map(([k,l])=>`<label><input type="checkbox" data-int="${k}" ${I[k]?'checked':''}> ${l}</label>`).join('')}
    </div></form></div>`;
  h += `<div class="row">${S.gears.length>1?`<button class="btn ghost danger" id="gearDel" type="button">Remove this ${profileLabel(g).toLowerCase()} profile</button>`:''}
    ${g.kind==='telescope'?`<button class="btn ghost" id="gearReset" type="button">Reset to Barska defaults</button>`:''}</div>`;
  return h;
}

function gearFormHTML(g){
  if(g.kind==='eyes') return `<form class="form" id="gearForm" autocomplete="off"><label class="f wide">Profile name<input type="text" id="g_name" value="${esc(g.name||'Naked eye')}"></label></form>`;
  if(g.kind==='binoculars') return `<form class="form" id="gearForm" autocomplete="off">
    <label class="f wide">Binoculars<input type="text" id="g_name" value="${esc(g.name)}"></label>
    <label class="f">Magnification (×)<input type="number" id="b_mag" min="2" step="0.5" value="${g.mag}"></label>
    <label class="f">Lens size (mm)<input type="number" id="g_ap" min="10" step="1" value="${g.aperture}"></label>
    <label class="f">Field of view (°)<input type="number" id="b_field" min="1" step="0.1" value="${g.field}"></label>
    <p class="note wide" style="margin:0">Binoculars are labeled power × lens size, like 10×50. The field is often printed as "6.5°" or as feet at 1000 yards (divide that by 52.4 for degrees).</p></form>`;
  return `<form class="form" id="gearForm" autocomplete="off">
    <label class="f wide">Telescope<input type="text" id="g_name" value="${esc(g.name)}"></label>
    <label class="f">Aperture (mm)<input type="number" id="g_ap" min="0" step="1" value="${g.aperture}"></label>
    <label class="f">Focal length (mm)<input type="number" id="g_fl" min="0" step="1" value="${g.focal}"></label>
    <label class="f">Barlow (×)<input type="number" id="g_bar" min="0" step="0.5" value="${g.barlow||0}"></label>
    <label class="f">Mount<select id="g_mount">${MOUNTS.map(([k,l])=>`<option value="${k}" ${k===(g.mount||'manual')?'selected':''}>${l}</option>`).join('')}</select></label>
    <div class="wide"><h4>Eyepieces</h4><div class="eps">${(g.eyepieces||[]).map((e,i)=>`<div class="ep"><label class="f">Focal length (mm)<input type="number" id="ep_fl_${i}" data-ep="${i}" data-k="fl" min="1" step="0.5" value="${e.fl}"></label><label class="f">Apparent field (°)<input type="number" id="ep_af_${i}" data-ep="${i}" data-k="afov" min="20" max="120" step="1" value="${e.afov}"></label><button type="button" class="btn ghost" data-eprm="${i}" aria-label="Remove eyepiece">Remove</button></div>`).join('')}</div>
      <button type="button" class="btn" id="epAdd" style="margin-top:6px">Add eyepiece</button>
      <p class="note">Kellner eyepieces like the K20 show about 40–45° of apparent field; Plössls about 50°.</p></div>
    <div class="wide"><h4>Filters</h4><div class="eps">${(g.filters||[]).map((f,i)=>`<div class="ep"><label class="f">Name<input type="text" id="flt_n_${i}" data-flt="${i}" data-k="name" value="${esc(f.name)}" style="width:110px"></label><label class="f">Type<select id="flt_t_${i}" data-flt="${i}" data-k="type">${FILTER_TYPES.map(([k,l])=>`<option value="${k}" ${k===f.type?'selected':''}>${l}</option>`).join('')}</select></label><button type="button" class="btn ghost" data-fltrm="${i}" aria-label="Remove filter">Remove</button></div>`).join('')}</div>
      <button type="button" class="btn" id="fltAdd" style="margin-top:6px">Add filter</button>
      <p class="note">Nebula filters (UHC, OIII, H-beta) make emission nebulae stand out from streetlight glow. A white-light solar filter unlocks solar forecasts.</p></div>
    <div class="wide"><h4>Camera</h4><label class="checks" style="display:flex;gap:7px;margin-bottom:6px"><input type="checkbox" id="g_camon" ${g.cameraOn?'checked':''}> Include camera (T-ring at prime focus)</label>
      <div class="form"><label class="f wide">Camera<input type="text" id="c_name" value="${esc((g.camera||{}).name||'')}"></label>
      <label class="f">Sensor width (mm)<input type="number" id="c_w" step="0.1" value="${(g.camera||{}).w||22.2}"></label>
      <label class="f">Sensor height (mm)<input type="number" id="c_h" step="0.1" value="${(g.camera||{}).h||14.8}"></label>
      <label class="f">Pixel size (µm)<input type="number" id="c_px" step="0.01" value="${(g.camera||{}).px||5.2}"></label></div></div>
  </form>`;
}

/* --- photography helper --- */
function photoHTML(g, gs){
  const d = tDate(S.ti), N = g.focal/g.aperture, iso=S.photoIso;
  const rows = ['Moon','Venus','Mars','Jupiter','Saturn'].map(b=>{ const e=C.exposurePlan(b,d,{fnum:N,iso}); const up=C.topo(b,d,S.sel.lat,S.sel.lon).alt; return {b,e,up}; });
  const trail = C.trailLimit(g.focal, {fnum:N, pixel:(g.camera||{}).px, cropFactor: 36/((g.camera||{}).w||22.2)});
  const mount = g.mount||'manual';
  let mountNote;
  if(mount==='manual' || mount==='altaz') mountNote = `Without tracking, stars smear after about ${trail.npf.toFixed(1)} s at prime focus, so stick to the Moon and planets through the telescope. For star fields, put the camera on a tripod with a lens; the table below shows how long you can expose.`;
  else if(mount==='motor') mountNote = 'A motor drive allows longer exposures once the mount is polar-aligned. At 900 mm, expect roughly 15–30 s before trailing without guiding; take many short frames and stack them.';
  else mountNote = 'Tracking mounts allow long exposures; alt-azimuth GoTo mounts rotate the field, so keep frames under about 30 s and stack.';
  const lenses = [14,18,24,35,50];
  let h = `<div><h4>Photography with ${esc((g.camera||{}).name||'your camera')}</h4>
    <div class="row" style="margin-bottom:6px"><label class="f" style="flex-direction:row;align-items:center;gap:8px">ISO <select id="photoIso">${[100,200,400,800,1600].map(v=>`<option ${v===iso?'selected':''}>${v}</option>`).join('')}</select></label><span class="note">Starting exposures at prime focus (f/${N.toFixed(1)}) for ${esc(fmtFull.format(d))}</span></div>
    <table class="views"><thead><tr><th>Target</th><th class="r">Exposure</th><th class="r">Now</th></tr></thead><tbody>
    ${rows.map(r=>`<tr><td>${r.b}</td><td class="mono">${r.e?esc(r.e.text):'—'}</td><td class="mono" style="color:${r.up>5?'var(--good)':'var(--faint)'}">${r.up>5?Math.round(r.up)+'° up':'below'}</td></tr>`).join('')}</tbody></table>
    <p class="note">${esc(rows[0].e.note)} ${esc(rows[3].e.note)}</p>
    <p class="note">${esc(mountNote)}</p>
    <table class="views"><thead><tr><th>Camera lens on a tripod</th><th class="r">Longest sharp exposure</th></tr></thead><tbody>
    ${lenses.map(f=>{ const t=C.trailLimit(f,{fnum:f<=24?3.5:f<=35?2.8:1.8, pixel:(g.camera||{}).px, cropFactor:36/((g.camera||{}).w||22.2)}); return `<tr><td>${f} mm${f===18?' (kit lens)':''}</td><td class="mono">${Math.floor(t.npf)}–${Math.floor(t.rule500)} s</td></tr>`; }).join('')}</tbody></table>
    <p class="note">Strict (NPF rule) to relaxed (500 rule), for stars near the celestial equator. Stars near Polaris can go longer.</p>
    ${framingHTML(g, gs)}</div>`;
  return h;
}
function framingHTML(g, gs){
  const opts = [{id:'Moon',name:'Moon',size:31}].concat(C.DSO.filter(d=>d.photo).map(d=>({id:d.id,name:d.name,size:d.size})));
  const t = opts.find(o=>o.id===S.frameTarget) || opts[0];
  const fw=gs.cam.fovW*60, fh=gs.cam.fovH*60, scale = 200/Math.max(fw, t.size*1.15, 32);
  const W2=280, H2=Math.max(150, fh*scale+40), cx=W2/2, cy=H2/2;
  const rw=fw*scale, rh=fh*scale, ts=t.size*scale;
  const verdict = t.size > fw*1.05 ? 'Too big for one frame: shoot a mosaic, or use a camera lens instead.' : t.size < fw/8 ? 'Small in the frame: crop afterwards, or add the Barlow for planets and small nebulae.' : 'Frames nicely.';
  return `<div style="margin-top:10px"><h4>Framing preview</h4>
    <label class="f" style="margin-bottom:6px">Target<select id="frameT">${opts.map(o=>`<option value="${esc(o.id)}" ${o.id===t.id?'selected':''}>${esc(o.name)}</option>`).join('')}</select></label>
    <svg viewBox="0 0 ${W2} ${H2.toFixed(0)}" width="100%" style="max-width:${W2}px;background:var(--bg);border:1px solid var(--line);border-radius:6px" role="img" aria-label="Camera frame compared with the target's size">
      <ellipse cx="${cx}" cy="${cy}" rx="${(ts/2).toFixed(1)}" ry="${(ts/2*(t.id==='Moon'?1:0.6)).toFixed(1)}" fill="var(--accent)" fill-opacity=".22" stroke="var(--accent)"/>
      <rect x="${(cx-rw/2).toFixed(1)}" y="${(cy-rh/2).toFixed(1)}" width="${rw.toFixed(1)}" height="${rh.toFixed(1)}" fill="none" stroke="var(--fg)" stroke-width="1.5"/>
      <circle cx="${(W2-22).toFixed(0)}" cy="22" r="${(31*scale/2).toFixed(1)}" fill="none" stroke="var(--muted)" stroke-dasharray="2 2"/>
      <text x="${W2-22}" y="${(22+31*scale/2+11).toFixed(0)}" text-anchor="middle" font-size="9" fill="var(--muted)">Moon</text>
    </svg><p class="note" style="margin:4px 0 0">White box: camera frame at prime focus (${gs.cam.fovW.toFixed(2)}° × ${gs.cam.fovH.toFixed(2)}°). ${esc(verdict)}</p></div>`;
}

function wireGear(b){
  b.querySelectorAll('[data-gp]').forEach(x=>x.onclick=()=>{ S.gearIdx=+x.dataset.gp; saveGear(); renderPanel(); });
  const gpk=$('#gearPick'); if(gpk) gpk.onchange=()=>{ S.gearIdx=+gpk.value; saveGear(); renderPanel(); };
  b.querySelectorAll('[data-gadd]').forEach(x=>x.onclick=()=>{
    const k=x.dataset.gadd, id=Date.now();
    const g = k==='binoculars' ? Object.assign({id},BINO_DEFAULT) : k==='eyes' ? {id,kind:'eyes',name:'Naked eye'} : Object.assign({id,kind:'telescope',mount:'manual'}, JSON.parse(JSON.stringify(DEFAULT_GEAR)), {name:'New telescope', cameraOn:false});
    S.gears.push(g); S.gearIdx=S.gears.length-1; saveGear(); renderPanel(); toast(`Added ${profileLabel(g).toLowerCase()} profile`); });
  const del=$('#gearDel'); if(del) del.onclick=()=>{ const g=S.gears.splice(S.gearIdx,1)[0]; S.gearIdx=0; saveGear(); renderPanel(); toast(`Removed ${g.name||profileLabel(g)}`); };
  const gf=$('#gearForm');
  if(gf){
    const num = id => { const el=$(id); const v=el?parseFloat(el.value):NaN; return isNaN(v)?0:v; };
    gf.addEventListener('submit', e=>e.preventDefault());
    gf.addEventListener('change', ()=>{
      const g=activeGear();
      g.name=$('#g_name').value;
      if(g.kind==='binoculars'){ g.mag=num('#b_mag'); g.aperture=num('#g_ap'); g.field=num('#b_field'); }
      else if(g.kind==='telescope'){
        g.aperture=num('#g_ap'); g.focal=num('#g_fl'); g.barlow=num('#g_bar'); g.mount=$('#g_mount').value;
        gf.querySelectorAll('[data-ep]').forEach(inp=>{ g.eyepieces[+inp.dataset.ep][inp.dataset.k]=parseFloat(inp.value)||0; });
        gf.querySelectorAll('[data-flt]').forEach(inp=>{ g.filters[+inp.dataset.flt][inp.dataset.k]=inp.value; });
        g.cameraOn=$('#g_camon').checked; g.camera={name:$('#c_name').value, w:num('#c_w'), h:num('#c_h'), px:num('#c_px')};
      }
      saveGear(); const y=b.scrollTop; renderPanel(); b.scrollTop=y;
    });
    const rerender=()=>{ saveGear(); const y=b.scrollTop; renderPanel(); b.scrollTop=y; };
    const ea=$('#epAdd'); if(ea) ea.onclick=()=>{ activeGear().eyepieces.push({fl:10,afov:50}); rerender(); };
    const fa=$('#fltAdd'); if(fa) fa.onclick=()=>{ activeGear().filters=(activeGear().filters||[]); activeGear().filters.push({name:'New filter',type:'lp'}); rerender(); };
    gf.querySelectorAll('[data-fltrm]').forEach(x=>x.onclick=()=>{ activeGear().filters.splice(+x.dataset.fltrm,1); rerender(); });
    gf.querySelectorAll('[data-eprm]').forEach(x=>x.onclick=()=>{ activeGear().eyepieces.splice(+x.dataset.eprm,1); rerender(); });
  }
  const itf=$('#intForm'); if(itf) itf.addEventListener('change',()=>{ itf.querySelectorAll('[data-int]').forEach(c=>S.interests[c.dataset.int]=c.checked); store.set('interests',S.interests); S.eval=null; });
  const gr=$('#gearReset'); if(gr) gr.onclick=()=>{ const id=activeGear().id; S.gears[S.gearIdx]=Object.assign({id,kind:'telescope',mount:'manual'}, JSON.parse(JSON.stringify(DEFAULT_GEAR))); saveGear(); renderPanel(); toast('Gear reset'); };
  const iso=$('#photoIso'); if(iso) iso.onchange=()=>{ S.photoIso=+iso.value; store.set('photoIso',S.photoIso); const y=b.scrollTop; renderPanel(); b.scrollTop=y; };
  const ft=$('#frameT'); if(ft) ft.onchange=()=>{ S.frameTarget=ft.value; store.set('frameTarget',S.frameTarget); const y=b.scrollTop; renderPanel(); b.scrollTop=y; };
}
