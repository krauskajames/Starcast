/* Starcast core: astronomy, gear math, viewing-condition estimates, target scoring.
   Runs in the browser (global Astronomy) and in Node for testing. */
(function (root) {
  const A = (typeof Astronomy !== 'undefined') ? Astronomy : require('astronomy-engine');
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------- sky geometry ---------- */
  // Fast altitude for globe-wide layers: RA (hours), Dec (deg), GAST (hours)
  function altFast(lat, lon, ra, dec, gast) {
    const H = (gast * 15 + lon - ra * 15) * D2R;
    const s = Math.sin(lat * D2R) * Math.sin(dec * D2R) + Math.cos(lat * D2R) * Math.cos(dec * D2R) * Math.cos(H);
    return Math.asin(clamp(s, -1, 1)) * R2D;
  }
  const GEO = new A.Observer(0, 0, 0);
  function geoEq(body, date) {
    const e = A.Equator(body, date, GEO, true, true);
    return { ra: e.ra, dec: e.dec, dist: e.dist };
  }
  function gast(date) { return A.SiderealTime(date); }

  function topo(body, date, lat, lon) {
    const obs = new A.Observer(lat, lon, 0);
    const e = A.Equator(body, date, obs, true, true);
    const h = A.Horizon(date, obs, e.ra, e.dec, 'normal');
    return { alt: h.altitude, az: h.azimuth, ra: e.ra, dec: e.dec, dist: e.dist };
  }
  function topoFixed(ra, dec, date, lat, lon) {
    const obs = new A.Observer(lat, lon, 0);
    const h = A.Horizon(date, obs, ra, dec, 'normal');
    return { alt: h.altitude, az: h.azimuth };
  }
  function sepDeg(ra1, dec1, ra2, dec2) {
    const a = Math.sin(dec1 * D2R) * Math.sin(dec2 * D2R) + Math.cos(dec1 * D2R) * Math.cos(dec2 * D2R) * Math.cos((ra1 - ra2) * 15 * D2R);
    return Math.acos(clamp(a, -1, 1)) * R2D;
  }
  function moonInfo(date) {
    const ill = A.Illumination('Moon', date);
    const phase = A.MoonPhase(date); // 0 new, 90 first q, 180 full
    return { illum: ill.phase_fraction, phase, waxing: phase < 180 };
  }
  function moonPhaseName(phase) {
    const n = ['New Moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full Moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
    return n[Math.round(phase / 45) % 8];
  }

  /* ---------- bodies ---------- */
  const RADIUS_KM = { Mercury: 2440, Venus: 6052, Mars: 3396, Jupiter: 71492, Saturn: 60268, Uranus: 25559, Neptune: 24764, Moon: 1737.4 };
  const AU_KM = 149597870.7;
  function angDiamArcsec(body, distAU) { return 2 * Math.atan(RADIUS_KM[body] / (distAU * AU_KM)) * R2D * 3600; }
  function planetState(body, date) {
    const e = geoEq(body, date);
    const ill = A.Illumination(body, date);
    return { ra: e.ra, dec: e.dec, dist: e.dist, mag: ill.mag, phase: ill.phase_fraction, diam: angDiamArcsec(body, e.dist), date };
  }

  /* ---------- Mars seasons (Allison & McEwen 2000, as used by NASA's Mars24) ---------- */
  function marsLs(date) {
    const jd = date.getTime() / 864e5 + 2440587.5, dt = jd + 69.2 / 86400 - 2451545.0;
    const M = (19.3871 + 0.52402073 * dt) * D2R, a = 270.3871 + 0.524038496 * dt;
    const T = [[0.0071, 2.2353, 49.409], [0.0057, 2.7543, 168.173], [0.0039, 1.1177, 191.837], [0.0037, 15.7866, 21.736], [0.0021, 2.1354, 15.704], [0.0020, 2.4694, 95.528], [0.0018, 32.8493, 49.095]];
    let pbs = 0; for (const [amp, tau, phi] of T) pbs += amp * Math.cos((0.985626 * dt / tau + phi) * D2R);
    const vm = (10.691 + 3e-7 * dt) * Math.sin(M) + 0.623 * Math.sin(2 * M) + 0.050 * Math.sin(3 * M) + 0.005 * Math.sin(4 * M) + 0.0005 * Math.sin(5 * M) + pbs;
    return ((a + vm) % 360 + 360) % 360;
  }
  function marsSeason(date) {
    const Ls = marsLs(date);
    const jd = date.getTime() / 864e5 + 2440587.5;
    const yrs = (jd - 2435208.5) / 686.9726; // Mars Year 1 began 1955-04-11
    let MY = 1 + Math.floor(yrs); const frac = yrs - Math.floor(yrs);
    if (Ls > 300 && frac < 0.1) MY -= 1; if (Ls < 60 && frac > 0.9) MY += 1;
    const S = ['spring', 'summer', 'autumn', 'winter'];
    const q = Math.floor(Ls / 90);
    const early = (Ls % 90) < 30 ? 'early ' : (Ls % 90) > 60 ? 'late ' : 'mid-';
    const north = early + S[q], south = early + S[(q + 2) % 4];
    const dust = Ls >= 180 && Ls <= 330;
    let cap;
    if (Ls < 90) cap = 'North polar cap is shrinking as northern spring warms it.';
    else if (Ls < 180) cap = 'North cap is small; the south cap is hidden in winter darkness under a haze hood.';
    else if (Ls < 270) cap = 'South polar cap is shrinking in southern spring; this is the dust-storm season.';
    else cap = 'South cap is small; dust storms remain possible until about Ls 330°.';
    return { Ls, MY, north, south, dust, cap };
  }
  function saturnRings(date) {
    const tilt = A.Illumination('Saturn', date).ring_tilt;
    const later = A.Illumination('Saturn', new Date(date.getTime() + 365.25 * 864e5)).ring_tilt; // a year ahead: removes Earth's yearly wobble
    const B = -tilt; // astronomy-engine: negative = north face; flip so + = north face
    return { B, face: B >= 0 ? 'north' : 'south', opening: Math.abs(later) > Math.abs(tilt) };
  }
  function ringText(r) {
    const a = Math.abs(r.B);
    const look = a < 4 ? 'nearly edge-on, a thin line' : a < 10 ? 'a narrow ellipse' : a < 20 ? 'well open' : 'wide open';
    return `Rings tilted ${a.toFixed(1)}° (${r.face} face), ${look}, and ${r.opening ? 'opening' : 'closing'}${r.opening && r.face === 'south' ? ' toward their widest in 2032' : ''}.`;
  }

  /* ---------- gear ---------- */
  const NELM_BY_BORTLE = [null, 7.6, 7.1, 6.6, 6.2, 5.8, 5.3, 4.8, 4.3, 3.8];
  function gearStats(g, bortle) {
    const nelm = NELM_BY_BORTLE[clamp(Math.round(bortle || 5), 1, 9)];
    const D = +g.aperture, F = +g.focal;
    const eps = (g.eyepieces || []).filter(e => +e.fl > 0);
    const views = [];
    eps.forEach(e => {
      const m = F / e.fl; views.push({ label: e.fl + ' mm', mag: m, tfov: (e.afov || 45) / m, exit: D / m });
      if (+g.barlow > 1) { const mb = m * g.barlow; views.push({ label: e.fl + ' mm + ' + g.barlow + '× Barlow', mag: mb, tfov: (e.afov || 45) / mb, exit: D / mb }); }
    });
    views.sort((a, b) => a.mag - b.mag);
    const maxUseful = 2 * D;
    const out = {
      D, F, ratio: F / D, nelm, views,
      maxMag: views.length ? views[views.length - 1].mag : 0,
      maxUseful,
      dawes: 116 / D,
      limMag: nelm + 5 * Math.log10(D / 7),
      lightGrasp: Math.pow(D / 7, 2)
    };
    const ft = (g.filters || []).map(f => f.type);
    out.filters = g.filters || [];
    out.nebFilter = (g.filters || []).find(f => ['uhc', 'oiii', 'hbeta'].includes(f.type)) || null;
    out.solar = ft.includes('solar');
    out.moonFilter = ft.includes('moon');
    if (g.camera && +g.camera.w > 0) {
      const c = g.camera;
      out.cam = { fovW: 2 * Math.atan(c.w / 2 / F) * R2D, fovH: 2 * Math.atan(c.h / 2 / F) * R2D, scale: c.px ? 206.265 * c.px / F : null };
    }
    return out;
  }

  /* ---------- viewing-condition estimates from model fields ---------- */
  // Seeing 1 (bad) .. 5 (excellent). Jet stream and surface wind dominate turbulence.
  function estSeeing(jet250, wind500, wind10) {
    let p = 0;
    p += jet250 < 70 ? 0 : jet250 < 110 ? 0.6 : jet250 < 150 ? 1.2 : jet250 < 200 ? 2 : 2.8;
    p += wind500 > 110 ? 0.6 : wind500 > 75 ? 0.3 : 0;
    p += wind10 > 30 ? 0.8 : wind10 > 20 ? 0.4 : 0;
    return clamp(5 - p, 1, 5);
  }
  // Transparency 1 (poor) .. 5 (excellent): high/thin cloud, moisture, aerosols
  function estTransparency(hcloud, rh, aod) {
    let p = (hcloud || 0) / 28;
    p += rh > 92 ? 1.4 : rh > 85 ? 0.9 : rh > 75 ? 0.4 : 0;
    if (aod != null) p += aod > 0.5 ? 1.5 : aod > 0.3 ? 0.9 : aod > 0.15 ? 0.4 : 0;
    return clamp(5 - p, 1, 5);
  }

  /* ---------- targets ---------- */
  const PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
  // RA hours, Dec deg, magnitude, size arcmin, kind, lowSB, photo-friendly
  const DSO = [
    ['M31', 'Andromeda Galaxy', 0.712, 41.27, 3.4, 178, 'galaxy', 0, 1],
    ['M33', 'Triangulum Galaxy', 1.564, 30.66, 5.7, 70, 'galaxy', 1, 1],
    ['NGC 869/884', 'Double Cluster', 2.333, 57.14, 3.7, 60, 'cluster', 0, 1],
    ['M45', 'Pleiades', 3.79, 24.12, 1.6, 110, 'cluster', 0, 1],
    ['M1', 'Crab Nebula', 5.575, 22.01, 8.4, 6, 'nebula', 1, 1],
    ['M42', 'Orion Nebula', 5.59, -5.39, 4.0, 85, 'nebula', 0, 1],
    ['M37', 'Auriga cluster M37', 5.873, 32.55, 5.6, 24, 'cluster', 0, 0],
    ['M35', 'Gemini cluster M35', 6.15, 24.33, 5.3, 28, 'cluster', 0, 0],
    ['M44', 'Beehive Cluster', 8.667, 19.67, 3.7, 95, 'cluster', 0, 1],
    ['M81', "Bode's Galaxy", 9.926, 69.07, 6.9, 27, 'galaxy', 0, 1],
    ['M82', 'Cigar Galaxy', 9.931, 69.68, 8.4, 11, 'galaxy', 0, 1],
    ['M97', 'Owl Nebula', 11.248, 55.02, 9.9, 3.4, 'nebula', 1, 0],
    ['M104', 'Sombrero Galaxy', 12.666, -11.62, 8.0, 9, 'galaxy', 0, 1],
    ['M64', 'Black Eye Galaxy', 12.945, 21.68, 8.5, 10, 'galaxy', 0, 0],
    ['Mizar', 'Mizar & Alcor', 13.399, 54.93, 2.2, 0.2, 'double', 0, 0],
    ['M51', 'Whirlpool Galaxy', 13.498, 47.2, 8.4, 11, 'galaxy', 1, 1],
    ['M3', 'Globular M3', 13.703, 28.38, 6.2, 18, 'globular', 0, 0],
    ['M101', 'Pinwheel Galaxy', 14.053, 54.35, 7.9, 29, 'galaxy', 1, 1],
    ['M5', 'Globular M5', 15.31, 2.08, 5.6, 23, 'globular', 0, 0],
    ['M13', 'Hercules Cluster', 16.695, 36.46, 5.8, 20, 'globular', 0, 1],
    ['M92', 'Globular M92', 17.285, 43.14, 6.4, 14, 'globular', 0, 0],
    ['M8', 'Lagoon Nebula', 18.06, -24.38, 6.0, 90, 'nebula', 0, 1],
    ['M17', 'Omega Nebula', 18.348, -16.18, 6.0, 11, 'nebula', 0, 1],
    ['M22', 'Globular M22', 18.607, -23.9, 5.1, 32, 'globular', 0, 0],
    ['M11', 'Wild Duck Cluster', 18.851, -6.27, 5.8, 14, 'cluster', 0, 0],
    ['M57', 'Ring Nebula', 18.893, 33.03, 8.8, 1.4, 'nebula', 0, 0],
    ['Albireo', 'Albireo (gold & blue double)', 19.512, 27.96, 3.1, 0.6, 'double', 0, 0],
    ['M27', 'Dumbbell Nebula', 19.993, 22.72, 7.5, 8, 'nebula', 0, 1],
    ['NGC 7000', 'North America Nebula', 20.98, 44.33, 4.0, 120, 'nebula', 1, 1],
    ['M15', 'Globular M15', 21.5, 12.17, 6.2, 18, 'globular', 0, 0],
    ['M2', 'Globular M2', 21.558, -0.82, 6.5, 16, 'globular', 0, 0],
    ['MW', 'Milky Way (Cygnus to Cassiopeia)', 21.0, 45.0, 4.5, 2000, 'milkyway', 1, 1]
  ].map(r => ({ id: r[0], name: r[1], ra: r[2], dec: r[3], mag: r[4], size: r[5], kind: r[6], lowSB: !!r[7], photo: !!r[8] }));

  const KIND_LABEL = { galaxy: 'Galaxy', cluster: 'Star cluster', nebula: 'Nebula', globular: 'Globular cluster', double: 'Double star', milkyway: 'Milky Way', planet: 'Planet', moon: 'Moon' };

  // Can this target be seen with naked eye / the scope at this site?
  function gearReach(t, gs, interests) {
    const eye = interests.nakedEye;
    if (t.kind === 'planet' || t.kind === 'moon') {
      if (t.mag <= gs.nelm - 0.3 && eye) return { ok: 1, how: 'eye' };
      if (gs.D && t.mag <= gs.limMag) return { ok: 1, how: 'scope' };
      return { ok: 0 };
    }
    const neb = t.kind === 'nebula' && gs.nebFilter;
    const sbPen = (t.lowSB ? (gs.nelm < 6.2 ? 2.4 : 1.2) : 0) * (neb ? 0.35 : 1);
    const extPen = t.size > 30 ? 0.8 : t.size > 8 ? 0.4 : 0;
    if (t.kind === 'milkyway') return gs.nelm >= 6.2 ? { ok: 1, how: 'eye' } : { ok: 0, why: 'needs a darker sky' };
    if (eye && t.mag + sbPen + extPen + 1.0 <= gs.nelm) return { ok: 1, how: 'eye' };
    if (gs.D) {
      const eff = t.mag + sbPen + extPen;
      if (eff <= gs.limMag - 2) return { ok: 1, how: 'scope', filter: neb ? gs.nebFilter.name : null };
      if (eff <= gs.limMag - 0.8) return { ok: 0.55, how: 'scope', marginal: true, filter: neb ? gs.nebFilter.name : null };
    }
    return { ok: 0, why: gs.D ? 'too faint for your scope here' : 'needs a telescope' };
  }

  function darkFactor(sunAlt, kind, body) {
    if (kind === 'moon' || body === 'Venus' || body === 'Mercury' || body === 'Jupiter') return sunAlt <= -6 ? 1 : sunAlt <= -1 ? lerp(1, 0.25, (sunAlt + 6) / 5) : 0;
    if (kind === 'planet' || kind === 'double') return sunAlt <= -9 ? 1 : sunAlt <= -4 ? lerp(1, 0.2, (sunAlt + 9) / 5) : 0;
    return sunAlt <= -18 ? 1 : sunAlt <= -12 ? lerp(1, 0.25, (sunAlt + 18) / 6) : 0;
  }

  // weather: {cloud, seeing, transp} or null (unknown -> neutral)
  function scoreHour(t, pos, sunAlt, moon, wx, reach) {
    if (!reach.ok) return 0;
    const minAlt = t.kind === 'moon' || t.kind === 'planet' ? 8 : 15;
    if (pos.alt < minAlt) return 0;
    const altF = Math.pow(clamp((pos.alt - minAlt) / 30, 0, 1), 0.6) * 0.75 + 0.25;
    const darkF = darkFactor(sunAlt, t.kind, t.body);
    if (!darkF) return 0;
    let moonF = 1;
    if (t.kind !== 'moon' && t.kind !== 'planet' && t.kind !== 'double' && moon.alt > -2) {
      const close = 1 - clamp(moon.sep, 0, 100) / 140;
      moonF = 1 - moon.illum * (t.lowSB ? 0.95 : 0.7) * (0.45 + 0.55 * close) * (reach.filter ? 0.55 : 1);
      moonF = clamp(moonF, 0.05, 1);
    }
    let wxF = 0.7, qF = 0.8;
    if (wx) {
      wxF = Math.pow(clamp((100 - wx.cloud) / 100, 0, 1), 1.6);
      const steady = t.kind === 'moon' || t.kind === 'planet' || t.kind === 'double';
      const q = steady ? wx.seeing : wx.transp;
      qF = 0.4 + 0.6 * (q - 1) / 4;
    }
    return Math.round(100 * altF * darkF * moonF * wxF * qF * reach.ok);
  }

  // How rewarding a target is for a typical observer; separates targets that are all technically visible.
  const APPEAL = { Moon: 1, Saturn: 1, Jupiter: 1, Venus: 0.85, Mercury: 0.6, Uranus: 0.5, Neptune: 0.4,
    M42: 1, M31: 0.95, M45: 0.95, MW: 0.95, M13: 0.9, 'NGC 869/884': 0.9, M57: 0.85, M27: 0.85, Albireo: 0.8, M44: 0.8, M81: 0.8, M82: 0.75, M51: 0.8, M8: 0.8, Mizar: 0.7 };
  function appeal(t, st) {
    if (t.body === 'Mars') return st && st.diam >= 10 ? 0.95 : 0.7;
    return APPEAL[t.id] != null ? APPEAL[t.id] : (t.lowSB ? 0.6 : 0.65);
  }
  function rating(s) { return s >= 70 ? 'Great' : s >= 50 ? 'Good' : s >= 30 ? 'Fair' : s > 0 ? 'Poor' : '—'; }

  /* What you'll actually see with this gear */
  function detailText(t, st, gs, wx) {
    const best = gs.views.length ? gs.views[gs.views.length - 1] : null;
    const usable = gs.views.filter(v => v.mag <= gs.maxUseful * 1.05);
    const hi = usable.length ? usable[usable.length - 1] : best;
    const seeing = wx ? wx.seeing : 3;
    if (t.kind === 'moon') {
      return `Moon ${Math.round(st.phase * 100)}% lit. Craters are sharpest along the terminator, the line between light and dark.` + (hi ? ` Try ${Math.round(hi.mag)}× for detail.` : '') + (gs.moonFilter ? ' Your Moon filter cuts the glare.' : st.phase > 0.7 ? ' Bright near full; a Moon filter or sunglasses-tint helps.' : '');
    }
    if (t.kind === 'planet') {
      const d = st.diam;
      let s = `${d.toFixed(1)}″ across, magnitude ${st.mag.toFixed(1)}.`;
      if (hi) {
        const app = d * hi.mag; // arcsec as seen through eyepiece
        const moonPct = Math.round(app / 1860 * 100);
        s += ` At ${Math.round(hi.mag)}× it looks ${moonPct >= 100 ? 'bigger than' : 'about ' + moonPct + '% the size of'} the full Moon to your naked eye.`;
      }
      const B = t.body;
      if (B === 'Saturn' && st.date) s += ' ' + ringText(saturnRings(st.date));
      if (B === 'Saturn') s += hi && hi.mag >= 30 ? (hi.mag >= 100 && seeing >= 3.5 && gs.D >= 80 ? ' Rings clear; Cassini Division possible in steady air.' : ' Rings visible; steadier air brings out more detail.') : ' Rings need about 30× or more.';
      if (B === 'Jupiter') s += ' Four Galilean moons and the two main cloud belts' + (hi && hi.mag >= 100 && seeing >= 3.5 ? '; Great Red Spot possible if it faces Earth.' : '.');
      if (B === 'Mars' && st.date) { const ms = marsSeason(st.date); s += ` Mars Year ${ms.MY}, Ls ${Math.round(ms.Ls)}°: ${ms.north} in the north. ${ms.cap}`; }
      if (B === 'Mars') s += d >= 12 ? (seeing >= 3.5 ? ' Polar cap and dark markings possible.' : ' Large enough for markings once the air steadies.') : ' Small orange disk; best near opposition.';
      if (B === 'Venus') s += ` Shows a ${Math.round(st.phase * 100)}%-lit phase, like a tiny Moon.`;
      if (B === 'Mercury') s += ` ${Math.round(st.phase * 100)}%-lit phase; always low in twilight.`;
      if (B === 'Uranus') s += ' Tiny blue-green disk at high power.';
      if (B === 'Neptune') s += ' Blue star-like point; a dot at high power.';
      return s;
    }
    const fov = gs.views.length ? gs.views[0] : null;
    let s = `${KIND_LABEL[t.kind]}, magnitude ${t.mag}`;
    if (t.size >= 1 && t.kind !== 'milkyway') s += `, ${t.size >= 60 ? (t.size / 60).toFixed(1) + '°' : Math.round(t.size) + '′'} across`;
    s += '.';
    if (fov && t.kind !== 'milkyway' && t.kind !== 'double') {
      const fovArcmin = fov.tfov * 60;
      s += t.size > fovArcmin ? ` Larger than your widest view (${fov.tfov.toFixed(1)}°); binoculars or the naked eye frame it better.` : ` Fits your ${Math.round(fov.mag)}× view (${fov.tfov.toFixed(1)}° field).`;
    }
    if (t.kind === 'nebula' && gs.nebFilter) s += ` Use your ${gs.nebFilter.name} filter: it blocks streetlight glow and makes the nebula stand out.`;
    if ((t.kind === 'galaxy' || t.kind === 'cluster' || t.kind === 'globular') && gs.nebFilter) s += ` Leave the ${gs.nebFilter.name} filter off; it dims galaxies and star clusters.`;
    if (t.kind === 'double') s += ' Split it at medium power; colors show best slightly defocused.';
    if (t.kind === 'milkyway') s += ' Naked eye from a dark site. Let your eyes adapt for 20 minutes.';
    if (gs.cam && t.photo) {
      const fw = gs.cam.fovW * 60;
      s += t.size > fw * 1.1 ? ' Too large for one camera frame at prime focus.' : t.size < fw / 8 ? ' Small in a prime-focus camera frame.' : ' Frames well in your camera at prime focus.';
    }
    return s;
  }

  /* Hours for a night window, and per-target score series */
  function evaluateTargets(opts) {
    // opts: lat, lon, hours[] (unix secs), wxAt(i)->{cloud,seeing,transp}|null, gear, bortle, interests
    const gs = gearStats(opts.gear, opts.bortle);
    const list = [];
    if (opts.interests.moon) list.push({ id: 'Moon', name: 'Moon', kind: 'moon', body: 'Moon' });
    if (opts.interests.planets) PLANETS.forEach(p => list.push({ id: p, name: p, kind: 'planet', body: p }));
    DSO.forEach(d => {
      if (d.kind === 'double' && !opts.interests.doubles) return;
      if (d.kind !== 'double' && !opts.interests.deepsky && !(opts.interests.photo && d.photo)) return;
      list.push(d);
    });
    const per = opts.hours.map((u, i) => {
      const date = new Date(u * 1000);
      const sun = topo('Sun', date, opts.lat, opts.lon);
      const moonPos = topo('Moon', date, opts.lat, opts.lon);
      const mi = moonInfo(date);
      return { date, sunAlt: sun.alt, moonPos, moonIllum: mi.illum, wx: opts.wxAt(i) };
    });
    const res = list.map(t => {
      let st = null;
      const mid = per[Math.floor(per.length / 2)] || per[0];
      if (t.body) {
        st = t.body === 'Moon' ? { mag: -12, phase: mid.moonIllum, diam: 1860 } : planetState(t.body, mid.date);
        t.mag = st.mag;
      }
      const reach = gearReach(t, gs, opts.interests);
      const ap = 0.55 + 0.45 * appeal(t, st);
      const scores = per.map(h => {
        const pos = t.body ? topo(t.body, h.date, opts.lat, opts.lon) : topoFixed(t.ra, t.dec, h.date, opts.lat, opts.lon);
        const tr = t.body ? null : t;
        const sep = t.body ? 0 : sepDeg(t.ra, t.dec, h.moonPos.ra, h.moonPos.dec);
        const s = scoreHour(t, pos, h.sunAlt, { alt: h.moonPos.alt, illum: h.moonIllum, sep }, h.wx, reach);
        return { s: Math.round(s * ap), alt: pos.alt };
      });
      // best contiguous window >= 50 (fallback >= 30)
      let win = bestWindow(scores.map(x => x.s), 50) || bestWindow(scores.map(x => x.s), 30);
      const peak = scores.reduce((m, x, i) => x.s > m.s ? { s: x.s, i } : m, { s: 0, i: -1 });
      const maxAlt = Math.max(...scores.map(x => x.alt));
      return { t, st, reach, scores, peak, win, maxAlt, detail: detailText(t, st || {}, gs, peak.i >= 0 ? per[peak.i].wx : null) };
    });
    res.sort((a, b) => b.peak.s - a.peak.s || b.maxAlt - a.maxAlt);
    return { gs, per, res };
  }
  function bestWindow(arr, th) {
    let best = null, start = -1;
    for (let i = 0; i <= arr.length; i++) {
      if (i < arr.length && arr[i] >= th) { if (start < 0) start = i; }
      else if (start >= 0) { if (!best || i - start > best.end - best.start) best = { start, end: i }; start = -1; }
    }
    return best;
  }

  /* Daytime solar-observing windows: Sun above 15 degrees and mostly clear */
  function solarDays(hours, lat, lon, wxAt) {
    const days = []; let cur = null;
    hours.forEach((u, i) => {
      const d = new Date(u * 1000), alt = topo('Sun', d, lat, lon).alt;
      if (alt > 0) { if (!cur) cur = { start: i, end: i + 1, ok: [] }; else cur.end = i + 1; const w = wxAt(i); cur.ok.push(alt > 15 && (!w || w.cloud < 40) ? (w ? (100 - w.cloud) * (0.4 + 0.15 * (w.seeing - 1)) : 50) : 0); }
      else if (cur) { days.push(cur); cur = null; }
    });
    if (cur) days.push(cur);
    return days.map(dy => { const win = bestWindow(dy.ok, 1); return { start: dy.start, end: dy.end, win: win ? { start: dy.start + win.start, end: dy.start + win.end } : null }; });
  }

  /* Night windows (sun below -6) within a set of hours */
  function nights(hours, lat, lon) {
    const out = []; let cur = null;
    hours.forEach((u, i) => {
      const s = topo('Sun', new Date(u * 1000), lat, lon).alt;
      if (s < -6) { if (!cur) cur = { start: i, end: i + 1 }; else cur.end = i + 1; }
      else if (cur) { out.push(cur); cur = null; }
    });
    if (cur) out.push(cur);
    return out;
  }


  /* ---------- light pollution: Walker's-law city glow model ---------- */
  // [name, lat, lon, urban population]
  const CITIES = [
    ['Chicago', 41.878, -87.630, 9500000], ['Minneapolis-St Paul', 44.977, -93.265, 3700000], ['Milwaukee', 43.039, -87.906, 1570000],
    ['Grand Rapids', 42.963, -85.668, 1000000], ['Madison', 43.073, -89.401, 450000], ['Rockford', 42.271, -89.094, 340000],
    ['Green Bay', 44.519, -88.020, 330000], ['Duluth-Superior', 46.787, -92.100, 280000], ['Appleton', 44.262, -88.415, 250000],
    ['Rochester MN', 44.012, -92.480, 220000], ['Kenosha', 42.585, -87.821, 170000], ['Eau Claire', 44.811, -91.498, 170000],
    ['Muskegon', 43.234, -86.248, 170000], ['La Crosse', 43.801, -91.240, 140000], ['Racine', 42.726, -87.783, 135000],
    ['Janesville', 42.683, -89.019, 100000], ['Dubuque', 42.501, -90.664, 100000], ['Wausau', 44.959, -89.630, 75000],
    ['Oshkosh', 44.025, -88.543, 70000], ['Sheboygan', 43.751, -87.714, 50000], ['Beloit', 42.508, -89.032, 50000],
    ['Stevens Point', 44.524, -89.574, 50000], ['Fond du Lac', 43.773, -88.447, 45000], ['Manitowoc', 44.089, -87.657, 35000],
    ['West Bend', 43.425, -88.183, 32000], ['Marquette', 46.546, -87.395, 30000], ['Watertown', 43.195, -88.729, 25000],
    ['Wisconsin Rapids', 44.384, -89.817, 25000], ['Marshfield', 44.669, -90.172, 25000], ['Baraboo-Dells', 43.470, -89.744, 25000],
    ['Marinette-Menominee', 45.100, -87.630, 20000], ['Iron Mountain', 45.820, -88.066, 20000], ['Menomonie', 44.876, -91.919, 16000],
    ['Beaver Dam', 43.458, -88.837, 16000], ['Escanaba', 45.745, -87.064, 15000], ['Platteville', 42.734, -90.478, 12000],
    ['Monroe', 42.601, -89.638, 11000], ['Portage', 43.539, -89.462, 10000], ['Ironwood', 46.455, -90.171, 10000],
    ['Rice Lake', 45.506, -91.738, 9000], ['Shawano', 44.782, -88.609, 9000], ['Sturgeon Bay', 44.834, -87.377, 9000],
    ['Tomah', 43.980, -90.504, 9000], ['Ashland', 46.592, -90.884, 8000], ['Rhinelander', 45.637, -89.412, 8000],
    ['Prairie du Chien', 43.051, -91.141, 6000], ['Minocqua', 45.871, -89.711, 5000], ['Hayward', 46.013, -91.485, 3000]
  ];
  const LP_BOX = { lat0: 40.5, lat1: 49.5, lon0: -96, lon1: -84 };
  function kmBetween(la1, lo1, la2, lo2) {
    const x = (lo2 - lo1) * D2R * Math.cos((la1 + la2) / 2 * D2R), y = (la2 - la1) * D2R;
    return Math.sqrt(x * x + y * y) * 6371;
  }
  // Artificial sky brightness as a multiple of the natural sky (Walker 1977: ~0.01 * P * d^-2.5),
  // with each city spread over a core radius so its centre does not blow up.
  function skyGlow(lat, lon) {
    let r = 0;
    for (const c of CITIES) {
      const d = kmBetween(lat, lon, c[1], c[2]);
      if (d > 450) continue;
      const core = 0.26 * Math.pow(c[3], 0.3);
      const de = Math.sqrt(d * d + core * core);
      r += 0.03 * c[3] * Math.pow(de, -2.5);
    }
    return r;
  }
  function inLPBox(lat, lon) { return lat >= LP_BOX.lat0 && lat <= LP_BOX.lat1 && lon >= LP_BOX.lon0 && lon <= LP_BOX.lon1; }
  function sqmFromGlow(g) { return 21.95 - 2.5 * Math.log10(1 + g); }
  function bortleFromSQM(q) { return q >= 21.85 ? 1 : q >= 21.7 ? 2 : q >= 21.4 ? 3 : q >= 20.5 ? 4 : q >= 19.5 ? 5 : q >= 18.9 ? 6 : q >= 18.4 ? 7 : q >= 17.8 ? 8 : 9; }
  function lightPollution(lat, lon) {
    if (!inLPBox(lat, lon)) return null;
    const g = skyGlow(lat, lon), sqm = sqmFromGlow(g);
    let near = null;
    for (const c of CITIES) { const d = kmBetween(lat, lon, c[1], c[2]); const w = c[3] * Math.pow(Math.max(d, 5), -2.5); if (!near || w > near.w) near = { name: c[0], d, w }; }
    return { glow: g, sqm, bortle: bortleFromSQM(sqm), brightest: near };
  }

  /* ---------- aurora ---------- */
  const MAG_POLE = { lat: 80.8, lon: -72.8 }; // geomagnetic north pole, dipole approximation (IGRF, 2025)
  function geomagLat(lat, lon) {
    const s = Math.sin(lat * D2R) * Math.sin(MAG_POLE.lat * D2R) + Math.cos(lat * D2R) * Math.cos(MAG_POLE.lat * D2R) * Math.cos((lon - MAG_POLE.lon) * D2R);
    return Math.asin(clamp(s, -1, 1)) * R2D;
  }
  // Rough Kp-to-oval rule: aurora overhead poleward of ~67 - 2.5*Kp geomagnetic latitude,
  // and visible low on the northern horizon about 3 degrees beyond that.
  function auroraChance(kp, mlat) {
    const overhead = 67 - 2.5 * kp, horizon = overhead - 3;
    if (mlat >= overhead) return { level: 3, text: 'possible overhead' };
    if (mlat >= horizon + 1.5) return { level: 2, text: 'likely low in the north' };
    if (mlat >= horizon) return { level: 1, text: 'possible low on the northern horizon' };
    return { level: 0, text: 'unlikely' };
  }
  function kpNeeded(mlat) { return clamp((67 - 3 - mlat) / 2.5, 0, 9); }

  /* ---------- plain-language night summary (alert text) ---------- */
  // ev: evaluateTargets result; n: night {start,end}; wxAt(i); name; hourLabel(i) -> "9 pm"; when: "tonight"
  function nightAlert(ev, n, wxAt, name, hourLabel, when) {
    const ok = [];
    for (let i = n.start; i < n.end; i++) { const w = wxAt(i); ok.push(ev.per[i].sunAlt < -10 && w && w.cloud < 35 ? 1 : 0); }
    const win = bestWindow(ok, 1);
    const rows = ev.res.map(r => { let pk = { s: 0, i: -1 }; for (let i = n.start; i < n.end; i++) if (r.scores[i].s > pk.s) pk = { s: r.scores[i].s, i }; return { r, pk }; })
      .filter(x => x.pk.s >= 40).sort((a, b) => b.pk.s - a.pk.s);
    if (!win) {
      const anyWx = wxAt(n.start) != null;
      return { good: false, quality: 'none', rows, text: anyWx ? `Clouds look likely all ${when === 'tonight' ? 'night' : when} at ${name}. Check back after the next model update.` : 'No weather forecast for this spot yet. The sky events below are still accurate.' };
    }
    const a = n.start + win.start, z = n.start + win.end;
    const avg = k => { let s = 0, c = 0; for (let i = a; i < z; i++) { const w = wxAt(i); if (w && !isNaN(w[k])) { s += w[k]; c++; } } return c ? s / c : NaN; };
    const cl = avg('cloud'), se = avg('seeing'), tr = avg('transp');
    const quality = cl < 12 && se >= 3.5 ? 'great' : cl < 25 ? 'good' : 'fair';
    let s = `Viewing conditions are ${quality} from ${hourLabel(a)} to ${hourLabel(z)} ${when} at ${name}`;
    const inWin = rows.filter(x => x.pk.i >= a && x.pk.i < z);
    const pick = (inWin.length ? inWin : rows);
    const what = t => t.body === 'Saturn' ? 'the rings of Saturn' : t.body === 'Jupiter' ? "Jupiter's cloud belts and moons" : t.body === 'Moon' ? 'the Moon' : /(Galaxy|Nebula|Cluster|Pleiades|Milky Way)/.test(t.name) && !/^(M\d|NGC)/.test(t.name) ? 'the ' + t.name.replace(/^Milky Way.*/, 'Milky Way') : t.name;
    if (pick[0]) { s += ` for viewing ${what(pick[0].r.t)}`; if (pick[1]) s += ` and ${what(pick[1].r.t)}`; }
    s += '.';
    if (!isNaN(cl)) s += ` Clouds ~${Math.round(cl)}%, seeing ${se.toFixed(1)}/5, transparency ${tr.toFixed(1)}/5.`;
    for (let i = a; i < z; i++) { const w = wxAt(i); if (w && w.temp - w.td < 2) { s += ` Dew likely by ${hourLabel(i)}; bring a dew shield or heater.`; break; } }
    return { good: true, quality, start: a, end: z, hours: z - a, rows: pick, cloud: cl, seeing: se, transp: tr, text: s };
  }

  /* ---------- calendar ---------- */
  const SHOWERS = [
    ['Quadrantids', 1, 3, 110, 15.3, 49], ['Lyrids', 4, 22, 18, 18.1, 34], ['Eta Aquariids', 5, 6, 50, 22.5, -1],
    ['Perseids', 8, 12, 100, 3.2, 58], ['Draconids', 10, 8, 10, 17.5, 54], ['Orionids', 10, 21, 20, 6.33, 16],
    ['Leonids', 11, 17, 15, 10.2, 22], ['Geminids', 12, 14, 150, 7.47, 33]
  ];
  function calendar(start, months, lat, lon) {
    const end = new Date(start.getTime() + months * 30.44 * 864e5);
    const ev = [];
    const push = (date, kind, title, note, extra) => { if (date >= start && date <= end) ev.push(Object.assign({ date, kind, title, note }, extra || {})); };
    // full & new moons
    let mq = A.SearchMoonQuarter(start);
    for (let i = 0; i < months * 4.3 + 4; i++) {
      if (mq.quarter === 0) push(mq.time.date, 'moon', 'New Moon', 'Darkest skies of the month for galaxies and nebulae.');
      if (mq.quarter === 2) push(mq.time.date, 'moon', 'Full Moon', 'Bright sky washes out faint objects; good night for the planets.');
      mq = A.NextMoonQuarter(mq);
    }
    // oppositions
    ['Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'].forEach(p => {
      try {
        const t = A.SearchRelativeLongitude(p, 0, start);
        const st = planetState(p, t.date);
        const tips = { Mars: 'Mars is closest and largest. Best chance for surface detail.', Jupiter: 'Jupiter is biggest and brightest; up all night.', Saturn: 'Saturn is brightest and up all night. Great time for the rings.', Uranus: 'Uranus at its brightest, near naked-eye limit under dark skies.', Neptune: 'Neptune at its brightest; needs a telescope and a finder chart.' };
        push(t.date, 'planet', p + ' at opposition', tips[p] + ` ${st.diam.toFixed(1)}″ across, magnitude ${st.mag.toFixed(1)}.`, { body: p });
      } catch (e) { }
    });
    // greatest elongations
    ['Mercury', 'Venus'].forEach(p => {
      let d = start;
      for (let k = 0; k < 6; k++) {
        try {
          const e = A.SearchMaxElongation(p, d);
          push(e.time.date, 'planet', `${p} at greatest ${e.visibility} elongation`, `${Math.round(e.elongation)}° from the Sun, best seen in the ${e.visibility === 'morning' ? 'east before dawn' : 'west after sunset'}.`, { body: p });
          d = new Date(e.time.date.getTime() + 20 * 864e5);
          if (d > end) break;
        } catch (err) { break; }
      }
    });
    // lunar eclipses
    try {
      let le = A.SearchLunarEclipse(start);
      for (let k = 0; k < 4; k++) {
        const date = le.peak.date;
        if (date > end) break;
        const alt = topo('Moon', date, lat, lon).alt;
        const kindName = { total: 'Total', partial: 'Partial', penumbral: 'Penumbral' }[le.kind] || le.kind;
        push(date, 'eclipse', `${kindName} lunar eclipse`, alt > 0 ? 'Visible from your location (Moon above horizon at mid-eclipse).' : 'Moon is below your horizon at mid-eclipse.', { visible: alt > 0 });
        le = A.NextLunarEclipse(le.peak);
      }
    } catch (e) { }
    // Mars seasons and dust-storm season (Martian, by solar longitude)
    {
      const marks = [[0, 'Mars: northern spring begins', 'New Mars Year. North polar cap starts to shrink.'], [90, 'Mars: northern summer begins', 'North cap is at its smallest.'],
        [180, 'Mars: dust-storm season begins', 'Southern spring on Mars. Regional and global dust storms become possible through about Ls 330°.'],
        [251, 'Mars at perihelion', 'Mars is closest to the Sun; peak heating and dust activity.'], [270, 'Mars: southern summer begins', 'South polar cap is shrinking fast.']];
      let prev = marsLs(start);
      for (let t = start.getTime() + 864e5; t <= end.getTime(); t += 864e5) {
        const L = marsLs(new Date(t));
        marks.forEach(([m, title, note]) => {
          const step = (L - prev + 360) % 360, to = (m - prev + 360) % 360;
          if (to > 0 && to <= step) push(new Date(t), 'mars', title, `${note} (Mars Year ${marsSeason(new Date(t)).MY})`);
        });
        prev = L;
      }
    }
    // meteor showers (peak night, local)
    for (let y = start.getFullYear(); y <= end.getFullYear(); y++) {
      SHOWERS.forEach(s => {
        const d = new Date(y, s[1] - 1, s[2], 2, 0, 0); // ~2am local on peak morning
        const mi = moonInfo(d);
        const moonAlt = topo('Moon', d, lat, lon).alt;
        const radAlt = topoFixed(s[4], s[5], d, lat, lon).alt;
        const moonNote = moonAlt > 0 && mi.illum > 0.4 ? `Moon ${Math.round(mi.illum * 100)}% lit and up, so fewer meteors.` : `Moon ${Math.round(mi.illum * 100)}% lit${moonAlt <= 0 ? ' and below the horizon' : ''}: good conditions.`;
        push(d, 'meteor', `${s[0]} meteor shower peak`, `Up to ~${s[3]} per hour in ideal skies. Radiant ${Math.round(radAlt)}° up at 2am. ${moonNote}`, { zhr: s[3] });
      });
    }
    ev.sort((a, b) => a.date - b.date);
    return ev;
  }

  const api = { CITIES, skyGlow, lightPollution, inLPBox, kmBetween, geomagLat, auroraChance, kpNeeded, nightAlert, marsLs, marsSeason, saturnRings, ringText, solarDays, A, clamp, lerp, altFast, geoEq, gast, topo, topoFixed, sepDeg, moonInfo, moonPhaseName, planetState, gearStats, estSeeing, estTransparency, PLANETS, DSO, KIND_LABEL, gearReach, scoreHour, rating, evaluateTargets, bestWindow, nights, calendar, NELM_BY_BORTLE };
  if (typeof module !== 'undefined') module.exports = api; else root.Core = api;
})(this);
