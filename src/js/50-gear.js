/* Gear tab: instrument profiles (telescope, binoculars, naked eye), eyepiece advisor,
   photography helper (exposures, trailing limits, framing preview), interests. */

// Common eyepiece designs and cameras, so specs don't have to be looked up
const EP_PRESETS = [
  ['Plössl (about 52°)', [40,32,25,20,17,15,12.5,10,9,7.5,6.3,4], 52],
  ['Kellner (about 40°)', [25,20,12,10,9,6], 40],
  ['Wide-field (68°)', [34,24,20,16,11,8,5], 68],
  ['Ultra-wide (82°)', [30,24,18,14,11,8.8,6.7,4.7], 82],
  ['Zoom 8–24 mm (40–60°)', [24,8], 50]
];
const CAM_PRESETS = [
  ['Canon EOS Rebel T3 / 1100D', 22.0, 14.7, 5.2], ['Canon EOS Rebel T3i–T5i / 600D–700D', 22.3, 14.9, 4.3], ['Canon EOS Rebel T6i–T8i / SL3', 22.3, 14.9, 3.72],
  ['Canon EOS 6D (full frame)', 35.8, 23.9, 6.55], ['Nikon D3200–D3500', 23.2, 15.4, 3.85], ['Nikon D5300–D5600', 23.5, 15.6, 3.89],
  ['Sony a6000 series', 23.5, 15.6, 3.92], ['ZWO ASI224MC (planetary)', 4.9, 3.7, 3.75], ['ZWO ASI462MC (planetary)', 5.6, 3.2, 2.9], ['ZWO ASI533MC (deep sky)', 11.3, 11.3, 3.76]
];
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
    if(gs.views.length) h += `<table class="views"><thead><tr><th>View</th><th class="r">Power</th><th class="r">Field</th><th class="r">Exit pupil</th></tr></thead><tbody>${gs.views.map(v=>`<tr${v.mag>gs.maxUseful*1.02?' class="dimrow" title="Beyond this telescope’s useful magnification"':''}><td>${esc(v.label)}${v.mag>gs.maxUseful*1.02?' <span class="sub">(too much power)</span>':''}</td><td class="mono">${Math.round(v.mag)}×</td><td class="mono">${v.tfov.toFixed(2)}°</td><td class="mono">${v.exit.toFixed(1)} mm</td></tr>`).join('')}</tbody></table>`;
    h += gearMathHTML(g, gs);
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
      <div class="row" style="margin-top:6px"><select id="epPreset" aria-label="Add a common eyepiece"><option value="">Add a common eyepiece…</option>${EP_PRESETS.map(([n,fls,af],gi)=>`<optgroup label="${n}">${fls.map(fl=>`<option value="${fl}|${af}">${fl} mm ${n.replace(/ \(.*/,'')}</option>`).join('')}</optgroup>`).join('')}</select>
      <button type="button" class="btn" id="epAdd">Add other</button></div>
      <p class="note">Kellner eyepieces like the K20 show about 40–45° of apparent field; Plössls about 50°.</p></div>
    <div class="wide"><h4>Filters</h4><div class="eps">${(g.filters||[]).map((f,i)=>`<div class="ep"><label class="f">Name<input type="text" id="flt_n_${i}" data-flt="${i}" data-k="name" value="${esc(f.name)}" style="width:110px"></label><label class="f">Type<select id="flt_t_${i}" data-flt="${i}" data-k="type">${FILTER_TYPES.map(([k,l])=>`<option value="${k}" ${k===f.type?'selected':''}>${l}</option>`).join('')}</select></label><button type="button" class="btn ghost" data-fltrm="${i}" aria-label="Remove filter">Remove</button></div>`).join('')}</div>
      <button type="button" class="btn" id="fltAdd" style="margin-top:6px">Add filter</button>
      <p class="note">Nebula filters (UHC, OIII, H-beta) make emission nebulae stand out from streetlight glow. A white-light solar filter unlocks solar forecasts.</p></div>
    <div class="wide"><h4>Camera</h4><label class="checks" style="display:flex;gap:7px;margin-bottom:6px"><input type="checkbox" id="g_camon" ${g.cameraOn?'checked':''}> Include camera (T-ring at prime focus)</label>
      <label class="f" style="margin-bottom:8px">Fill in from a common camera<select id="camPreset"><option value="">Choose a camera…</option>${CAM_PRESETS.map((c,i)=>`<option value="${i}">${esc(c[0])}</option>`).join('')}</select></label>
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
// Apparent size of Solar System bodies on a date, in arcminutes
const AU_KM = 149597870.7;
function bodySize(id, d){
  if(id==='Sun'){ const e=C.geoEq('Sun',d); return 2*Math.atan(695700/(e.dist*AU_KM))*180/Math.PI*60; }
  if(id==='Moon'){ const e=C.topo('Moon',d,S.sel.lat,S.sel.lon); return 2*Math.atan(1737.4/(e.dist*AU_KM))*180/Math.PI*60; }
  return C.planetState(id,d).diam/60;
}
S.frameBarlow = store.get('frameBarlow', false);
// Saturn drawn to scale: ring system 1.24-2.27 planet radii, tilted; the near half of the ring passes in front
let satClip=0;
function saturnSVG(cx, cy, R, B){
  const tilt=Math.max(0.03, Math.abs(Math.sin(B*Math.PI/180))), id='satc'+(++satClip), north=B>=0;
  const ring = `<g transform="translate(${cx.toFixed(2)},${cy.toFixed(2)}) scale(1,${tilt.toFixed(3)})"><circle r="${(1.755*R).toFixed(2)}" fill="none" stroke="#d9c27a" stroke-opacity=".9" stroke-width="${(1.03*R).toFixed(2)}"/><circle r="${(1.97*R).toFixed(2)}" fill="none" stroke="#05080f" stroke-opacity=".55" stroke-width="${Math.max(0.15,0.05*R).toFixed(2)}"/></g>`;
  return `<clipPath id="${id}"><rect x="${(cx-3*R).toFixed(1)}" y="${north?cy.toFixed(2):(cy-3*R).toFixed(2)}" width="${(6*R).toFixed(1)}" height="${(3*R).toFixed(1)}"/></clipPath>
    ${ring}<ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${R.toFixed(2)}" ry="${(R*0.9).toFixed(2)}" fill="#e8d58a"/><g clip-path="url(#${id})">${ring}</g>`;
}
function gearMathHTML(g, gs){
  const v=gs.views[0], b=bortleFor(S.sel), f=x=>Math.round(x*10)/10;
  const ep = (g.eyepieces||[])[0];
  return `<details class="math"><summary>How these numbers are calculated</summary><dl>
    <dt>Magnification</dt><dd>Telescope focal length ÷ eyepiece focal length${ep?`: ${g.focal} ÷ ${ep.fl} = ${f(g.focal/ep.fl)}×`:''}. A Barlow multiplies it${+g.barlow>1&&ep?`: ${f(g.focal/ep.fl)} × ${g.barlow} = ${f(g.focal/ep.fl*g.barlow)}×`:''}.</dd>
    <dt>Highest useful magnification</dt><dd>About 2× per millimetre of aperture: 2 × ${g.aperture} = ${Math.round(gs.maxUseful)}×. Above that the image gets bigger but not sharper, and on most nights the air limits you to 150–200×.</dd>
    <dt>Field of view</dt><dd>Eyepiece apparent field ÷ magnification${ep&&v?`: ${ep.afov}° ÷ ${f(v.mag)} = ${v.tfov.toFixed(2)}°`:''}. The full Moon is 0.5° across.</dd>
    <dt>Exit pupil</dt><dd>Aperture ÷ magnification${v?`: ${g.aperture} ÷ ${f(v.mag)} = ${v.exit.toFixed(1)} mm`:''}. Around 2–5 mm suits most objects; much below 0.7 mm the view turns dim and soft.</dd>
    <dt>Faintest star</dt><dd>Your naked-eye limit for the sky darkness (Bortle ${b}: magnitude ${gs.nelm.toFixed(1)}) plus 5 × log₁₀(aperture ÷ 7 mm): ${gs.nelm.toFixed(1)} + 5 × log₁₀(${g.aperture} ÷ 7) = ${gs.limMag.toFixed(1)}. 7 mm is the pupil of a dark-adapted eye. Real limits vary about ±0.5 with eyesight, experience and transparency.</dd>
    <dt>Light grasp</dt><dd>(Aperture ÷ 7 mm)²: (${g.aperture} ÷ 7)² = ${Math.round(gs.lightGrasp)}×, how much more light than your eye collects.</dd>
    <dt>Resolution (Dawes limit)</dt><dd>116 ÷ aperture in mm: 116 ÷ ${g.aperture} = ${gs.dawes.toFixed(2)}″, the closest double star the telescope can split in perfect air.</dd>
    <dt>Focal ratio</dt><dd>Focal length ÷ aperture: ${g.focal} ÷ ${g.aperture} = f/${gs.ratio.toFixed(1)}. Lower numbers give wider, brighter photographs.</dd>
    ${gs.cam?`<dt>Camera field and image scale</dt><dd>Field = 2 × atan(sensor size ÷ 2 ÷ focal length), so ${g.camera.w} mm across at ${g.focal} mm gives ${gs.cam.fovW.toFixed(2)}°. Image scale = 206.265 × pixel size (µm) ÷ focal length (mm) = ${gs.cam.scale?gs.cam.scale.toFixed(2):'?'}″ per pixel.</dd>`:''}
    <dt>What’s “worth seeing”</dt><dd>Each target is checked against your faintest-star limit (dimmed for large, faint galaxies and nebulae, and helped by a nebula filter), then scored hour by hour for height above the horizon, darkness, moonlight, clouds, and seeing (for planets and double stars) or transparency (for deep-sky objects).</dd>
  </dl></details>`;
}
function framingHTML(g, gs){
  const d=tDate(S.ti);
  const solar=['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune'].map(id=>({id, name:id, size:bodySize(id,d), body:true}));
  const deep=C.DSO.filter(x=>x.photo).map(x=>({id:x.id,name:x.name,size:x.size}));
  const all=solar.concat(deep);
  const t = all.find(o=>o.id===S.frameTarget) || all.find(o=>o.id==='Moon');
  const useB = S.frameBarlow && +g.barlow>1, F = g.focal*(useB?g.barlow:1);
  const cam=g.camera||{}, fwDeg=2*Math.atan(cam.w/2/F)*180/Math.PI, fhDeg=2*Math.atan(cam.h/2/F)*180/Math.PI;
  const fw=fwDeg*60, fh=fhDeg*60, pxScale=cam.px?206.265*cam.px/F:null; // arcsec per pixel
  const widthPx = cam.px ? Math.round(cam.w*1000/cam.px) : null, heightPx = cam.px ? Math.round(cam.h*1000/cam.px) : null;
  // drawing scale: fit the larger of frame and target
  const scale = 230/Math.max(fw, t.size*(t.id==='Saturn'?2.3:1)*1.15);
  const W2=280, H2=Math.max(150, Math.min(260, fh*scale+40)), cx=W2/2, cy=H2/2;
  const rw=fw*scale, rh=fh*scale, ts=t.size*scale;
  const diskPx = pxScale ? t.size*60/pxScale : null;
  let shape;
  if(t.id==='Saturn') shape = saturnSVG(cx, cy, Math.max(0.5,ts/2), C.saturnRings(d).B);
  else if(t.body){ const col={Sun:'#ffcf6b',Moon:'#d9dde6',Mercury:'#c9bba8',Venus:'#fff1c4',Mars:'#ff8a5c',Jupiter:'#f3cf9b',Uranus:'#9fe0e0',Neptune:'#8fb0ff'}[t.id];
    shape = `<circle cx="${cx}" cy="${cy}" r="${Math.max(0.6,ts/2).toFixed(2)}" fill="${col}"/>`; }
  else shape = `<ellipse cx="${cx}" cy="${cy}" rx="${(ts/2).toFixed(1)}" ry="${(ts/2*0.6).toFixed(1)}" fill="var(--accent)" fill-opacity=".22" stroke="var(--accent)"/>`;
  let verdict;
  const span = t.size*(t.id==='Saturn'?2.26:1);
  if(span > fw*1.02 || t.size > fh*1.02) verdict = t.body ? `Larger than the frame${useB?' with the Barlow; try without it':''}.` : 'Too big for one frame: shoot a mosaic, or use a camera lens instead.';
  else if(t.body && t.id!=='Sun' && t.id!=='Moon') verdict = `${t.name} will be about ${Math.round(diskPx)} pixels across${t.id==='Saturn'?` (${Math.round(diskPx*2.26)} including the rings)`:''} in a ${widthPx}×${heightPx} image.${useB?'':' Add the Barlow for a bigger image.'} Planets are best captured as video and stacked.`;
  else if(span < fw/8) verdict = 'Small in the frame: crop afterwards, or add the Barlow.';
  else verdict = `Frames nicely: ${Math.round(span/fw*100)}% of the frame width.`;
  // close-up of the sensor's pixels for small planets
  let inset='';
  if(t.body && diskPx!=null && diskPx < 60 && !['Sun','Moon'].includes(t.id)){
    const box=Math.max(24, Math.ceil(diskPx*(t.id==='Saturn'?2.6:1.8))), k=120/box, r=diskPx/2*k;
    inset = `<svg viewBox="0 0 120 120" width="120" height="120" role="img" aria-label="Close-up of the planet on the camera's pixels" style="background:#05080f;border:1px solid var(--line);border-radius:6px">
      ${box<=40?Array.from({length:box+1},(_,i)=>`<line x1="${(i*k).toFixed(1)}" y1="0" x2="${(i*k).toFixed(1)}" y2="120" stroke="#1c2840" stroke-width=".5"/><line x1="0" y1="${(i*k).toFixed(1)}" x2="120" y2="${(i*k).toFixed(1)}" stroke="#1c2840" stroke-width=".5"/>`).join(''):''}
      ${t.id==='Saturn' ? saturnSVG(60,60,r,C.saturnRings(d).B) : `<circle cx="60" cy="60" r="${r.toFixed(1)}" fill="${{Mercury:'#c9bba8',Venus:'#fff1c4',Mars:'#ff8a5c',Jupiter:'#f3cf9b',Uranus:'#9fe0e0',Neptune:'#8fb0ff'}[t.id]}"/>`}
    </svg><p class="note" style="margin:2px 0 0">Close-up: ${box} × ${box} pixels of your sensor${box<=40?', grid lines are single pixels':''}.</p>`;
  }
  const sizeTxt = t.size>=60 ? (t.size/60).toFixed(2)+'°' : t.size>=1 ? t.size.toFixed(1)+'′' : (t.size*60).toFixed(1)+'″';
  return `<div style="margin-top:10px"><h4>Framing preview</h4>
    <div class="row" style="margin-bottom:6px;align-items:flex-end"><label class="f" style="flex:1;min-width:160px">Target<select id="frameT">
      <optgroup label="Sun, Moon and planets">${solar.map(o=>`<option value="${o.id}" ${o.id===t.id?'selected':''}>${o.name}</option>`).join('')}</optgroup>
      <optgroup label="Deep sky">${deep.map(o=>`<option value="${esc(o.id)}" ${o.id===t.id?'selected':''}>${esc(o.name)}</option>`).join('')}</optgroup></select></label>
      ${+g.barlow>1?`<label class="checks" style="display:flex;gap:6px;padding-bottom:6px"><input type="checkbox" id="frameB" ${useB?'checked':''}> With ${g.barlow}× Barlow</label>`:''}</div>
    ${t.id==='Sun'?`<div class="alert danger" style="margin-bottom:6px"><div class="h">Solar filter required</div><p>Photograph the Sun only with a certified full-aperture solar filter on the front of the telescope, and cap the finder.</p></div>`:''}
    <div class="row" style="align-items:flex-start;gap:10px">
    <svg viewBox="0 0 ${W2} ${H2.toFixed(0)}" width="100%" style="max-width:${W2}px;background:var(--bg);border:1px solid var(--line);border-radius:6px" role="img" aria-label="Camera frame compared with the target's size">
      ${shape}
      <rect x="${(cx-rw/2).toFixed(1)}" y="${(cy-rh/2).toFixed(1)}" width="${rw.toFixed(1)}" height="${rh.toFixed(1)}" fill="none" stroke="var(--fg)" stroke-width="1.5"/>
    </svg>${inset?`<div>${inset}</div>`:''}</div>
    <p class="note" style="margin:4px 0 0">${esc(t.name)} is ${sizeTxt} across${t.body?` on ${fmtMD.format(d)}`:''}. White box: camera frame at ${useB?`${g.barlow}× Barlow (${Math.round(F)} mm, f/${(F/g.aperture).toFixed(0)})`:`prime focus (${g.focal} mm)`}, ${fwDeg>=1?fwDeg.toFixed(2)+'°':(fw).toFixed(1)+'′'} × ${fhDeg>=1?fhDeg.toFixed(2)+'°':(fh).toFixed(1)+'′'}${pxScale?`, ${pxScale.toFixed(2)}″ per pixel`:''}. ${esc(verdict)}</p></div>`;
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
    const ep=$('#epPreset'); if(ep) ep.onchange=e=>{ e.stopPropagation(); if(!ep.value) return; const [fl,af]=ep.value.split('|').map(Number); activeGear().eyepieces.push({fl,afov:af}); rerender(); toast(`Added ${fl} mm eyepiece`); };
    const cp=$('#camPreset'); if(cp) cp.onchange=e=>{ e.stopPropagation(); const c=CAM_PRESETS[+cp.value]; if(!c) return; const g=activeGear(); g.camera={name:c[0], w:c[1], h:c[2], px:c[3]}; g.cameraOn=true; rerender(); toast(`Camera set to ${c[0]}`); };
    const fa=$('#fltAdd'); if(fa) fa.onclick=()=>{ activeGear().filters=(activeGear().filters||[]); activeGear().filters.push({name:'New filter',type:'lp'}); rerender(); };
    gf.querySelectorAll('[data-fltrm]').forEach(x=>x.onclick=()=>{ activeGear().filters.splice(+x.dataset.fltrm,1); rerender(); });
    gf.querySelectorAll('[data-eprm]').forEach(x=>x.onclick=()=>{ activeGear().eyepieces.splice(+x.dataset.eprm,1); rerender(); });
  }
  const itf=$('#intForm'); if(itf) itf.addEventListener('change',()=>{ itf.querySelectorAll('[data-int]').forEach(c=>S.interests[c.dataset.int]=c.checked); store.set('interests',S.interests); S.eval=null; });
  const gr=$('#gearReset'); if(gr) gr.onclick=()=>{ const id=activeGear().id; S.gears[S.gearIdx]=Object.assign({id,kind:'telescope',mount:'manual'}, JSON.parse(JSON.stringify(DEFAULT_GEAR))); saveGear(); renderPanel(); toast('Gear reset'); };
  const iso=$('#photoIso'); if(iso) iso.onchange=()=>{ S.photoIso=+iso.value; store.set('photoIso',S.photoIso); const y=b.scrollTop; renderPanel(); b.scrollTop=y; };
  const fb=$('#frameB'); if(fb) fb.onchange=()=>{ S.frameBarlow=fb.checked; store.set('frameBarlow',S.frameBarlow); const y=b.scrollTop; renderPanel(); b.scrollTop=y; };
  const ft=$('#frameT'); if(ft) ft.onchange=()=>{ S.frameTarget=ft.value; store.set('frameTarget',S.frameTarget); const y=b.scrollTop; renderPanel(); b.scrollTop=y; };
}
