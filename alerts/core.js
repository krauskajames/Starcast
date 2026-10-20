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
  // Azimuth (degrees from north through east) for RA (hours), Dec (deg), GAST (hours)
  function azFast(lat, lon, ra, dec, gast) {
    const H = (gast * 15 + lon - ra * 15) * D2R, p = lat * D2R, d = dec * D2R;
    const az = Math.atan2(-Math.sin(H) * Math.cos(d), Math.cos(p) * Math.sin(d) - Math.sin(p) * Math.cos(d) * Math.cos(H)) * R2D;
    return (az + 360) % 360;
  }
  const COMPASS = ['north', 'north-northeast', 'northeast', 'east-northeast', 'east', 'east-southeast', 'southeast', 'south-southeast', 'south', 'south-southwest', 'southwest', 'west-southwest', 'west', 'west-northwest', 'northwest', 'north-northwest'];
  function compass(az) { return COMPASS[Math.round(((az % 360) + 360) % 360 / 22.5) % 16]; }
  function whereText(alt, az) {
    const h = alt < 15 ? 'low in the ' : alt < 40 ? 'partway up in the ' : alt < 70 ? 'high in the ' : 'nearly overhead, toward the ';
    return `${h}${compass(az)}, ${Math.round(alt)}° up`;
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
    if (g && g.kind === 'eyes') return { D: 0, F: 0, ratio: 0, nelm, views: [], maxMag: 1, maxUseful: 1, dawes: 60, limMag: nelm, lightGrasp: 1, filters: [], nebFilter: null, solar: false, moonFilter: false, kind: 'eyes' };
    if (g && g.kind === 'binoculars') {
      const D = +g.aperture || 50, m = +g.mag || 10, fov = +g.field || 6.5;
      return { D, F: 0, ratio: 0, nelm, kind: 'binoculars', views: [{ label: `${m}×${D} binoculars`, mag: m, tfov: fov, exit: D / m }], maxMag: m, maxUseful: m, dawes: 116 / D,
        limMag: nelm + 5 * Math.log10(D / 7) - 0.5, lightGrasp: Math.pow(D / 7, 2), filters: [], nebFilter: null, solar: false, moonFilter: false };
    }
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
    out.kind = 'telescope';
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

  // Full Messier catalog (from d3-celestial, BSD licence): [id, common name, RA h, Dec deg, mag, size', kind, lowSB, photo]
  const MESSIER = [["M1","Crab Nebula",5.575,22.02,8.4,6,"nebula",0,0],["M2","",21.558,-0.82,6.5,13,"globular",0,1],["M3","",13.703,28.38,6.4,16,"globular",0,1],["M4","",16.393,-26.53,5.9,26,"globular",0,1],["M5","",15.31,2.08,5.8,17,"globular",0,1],["M6","Butterfly Cluster",17.668,-32.22,4.2,15,"cluster",0,1],["M7","Ptolemy\u00b4s Cluster",17.898,-34.82,3.3,80,"cluster",0,1],["M8","Lagoon Nebula",18.063,-24.38,5.8,90,"nebula",0,1],["M9","",17.32,-18.52,7.9,9,"globular",0,1],["M10","",16.952,-4.1,6.6,15,"globular",0,1],["M11","Wild Duck Cluster",18.852,-6.27,5.8,14,"cluster",0,1],["M12","",16.787,-1.95,6.6,14,"globular",0,1],["M13","Great Hercules Cluster",16.695,36.47,5.9,17,"globular",0,1],["M14","",17.627,-3.25,7.6,12,"globular",0,1],["M15","",21.5,12.17,6.4,12,"globular",0,1],["M16","Eagle Nebula",18.313,-13.78,6,7,"nebula",0,0],["M17","Omega Nebula",18.347,-16.18,7,46,"nebula",0,1],["M18","",18.332,-17.13,6.9,9,"cluster",0,1],["M19","",17.043,-26.27,7.2,14,"globular",0,1],["M20","Trifid Nebula",18.043,-23.03,8.5,29,"nebula",0,1],["M21","",18.077,-22.5,5.9,13,"cluster",0,1],["M22","",18.607,-23.9,5.1,24,"globular",0,1],["M23","",17.947,-19.02,5.5,27,"cluster",0,1],["M24","Milky Way patch",18.282,-18.48,4.5,90,"cluster",0,1],["M25","",18.527,-19.25,4.6,32,"cluster",0,1],["M26","",18.753,-9.4,8,15,"cluster",0,1],["M27","Dumbbell Nebula",19.993,22.72,8.1,8,"nebula",0,1],["M28","",18.408,-24.87,6.9,11,"globular",0,1],["M29","",20.398,38.53,6.6,7,"cluster",0,0],["M30","",21.673,-23.18,7.5,11,"globular",0,1],["M31","Andromeda",0.712,41.27,3.4,190,"galaxy",0,1],["M32","",0.712,40.87,8.2,9,"galaxy",0,1],["M33","Triangulum",1.565,30.65,5.7,71,"galaxy",1,1],["M34","",2.7,42.78,5.2,35,"cluster",0,1],["M35","",6.148,24.33,5.1,28,"cluster",0,1],["M36","",5.602,34.13,6,12,"cluster",0,1],["M37","",5.873,32.55,5.6,24,"cluster",0,1],["M38","",5.478,35.83,6.4,21,"cluster",0,1],["M39","",21.537,48.43,4.6,32,"cluster",0,1],["M40","",12.373,58.08,8,1,"cluster",0,0],["M41","",6.783,-20.73,4.5,38,"cluster",0,1],["M42","Orion Nebula",5.59,-5.45,4,66,"nebula",0,1],["M43","",5.593,-5.27,9,20,"nebula",0,0],["M44","Praesepe",8.668,19.98,3.1,95,"cluster",0,1],["M45","Pleiades",3.783,24.12,1.2,110,"cluster",0,1],["M46","",7.697,-14.82,6.1,27,"cluster",0,1],["M47","",7.61,-14.5,4.4,30,"cluster",0,1],["M48","",8.23,-5.8,5.8,54,"cluster",0,1],["M49","",12.497,8,8.4,10,"galaxy",0,1],["M50","",7.053,-8.33,5.9,16,"cluster",0,1],["M51","Whirlpool",13.498,47.2,8.1,11,"galaxy",0,1],["M52","",23.403,61.58,6.9,13,"cluster",0,1],["M53","",13.215,18.17,7.7,13,"globular",0,1],["M54","",18.918,-30.48,7.7,9,"globular",0,1],["M55","",19.667,-30.97,7,19,"globular",0,1],["M56","",19.277,30.18,8.2,7,"globular",0,0],["M57","Ring Nebula",18.893,33.03,9,1,"nebula",0,0],["M58","",12.628,11.82,9.8,6,"galaxy",0,0],["M59","",12.7,11.65,9.8,5,"galaxy",0,0],["M60","",12.728,11.55,8.8,7,"galaxy",0,0],["M61","",12.365,4.47,9.7,7,"galaxy",0,0],["M62","",17.02,-30.12,6.6,14,"globular",0,1],["M63","Sunflower Galaxy",13.263,42.03,8.6,13,"galaxy",0,1],["M64","Blackeye Galaxy",12.945,21.68,8.5,10,"galaxy",0,1],["M65","",11.315,13.08,9.3,10,"galaxy",0,0],["M66","",11.337,12.98,9,9,"galaxy",0,0],["M67","",8.84,11.82,6.9,30,"cluster",0,1],["M68","",12.658,-26.75,8.2,12,"globular",0,1],["M69","",18.523,-32.35,7.7,7,"globular",0,0],["M70","",18.72,-32.3,8.1,8,"globular",0,1],["M71","",19.897,18.78,8.3,7,"globular",0,0],["M72","",20.892,-12.53,9.4,6,"globular",0,0],["M73","4 Star asterism",20.982,-12.63,10,1,"cluster",0,0],["M74","",1.612,15.78,9.2,11,"galaxy",1,0],["M75","",20.102,-21.92,8.6,6,"globular",0,0],["M76","Little Dumbbell Nebula",1.707,51.57,11.5,2,"nebula",0,0],["M77","Cetus A",2.712,-0.02,8.8,7,"galaxy",0,0],["M78","",5.778,0.05,8,8,"nebula",0,1],["M79","",5.408,-24.55,8,9,"globular",0,1],["M80","",16.283,-22.98,7.2,9,"globular",0,1],["M81","Bode\u00b4s Galaxy",9.927,69.07,6.8,27,"galaxy",0,1],["M82","Cigar Galaxy",9.93,69.68,8.4,11,"galaxy",0,1],["M83","Southern Pinwheel",13.617,-29.87,7.6,13,"galaxy",0,1],["M84","",12.418,12.88,9.3,7,"galaxy",0,0],["M85","",12.423,18.18,9.2,7,"galaxy",0,0],["M86","",12.437,12.95,9.2,9,"galaxy",0,0],["M87","Virgo A",12.513,12.4,8.6,8,"galaxy",0,1],["M88","",12.533,14.42,9.5,7,"galaxy",0,0],["M89","",12.595,12.55,9.8,5,"galaxy",0,0],["M90","",12.613,13.17,9.5,10,"galaxy",0,0],["M91","",12.59,14.5,10.2,5,"galaxy",0,0],["M92","",17.285,43.13,6.5,11,"globular",0,1],["M93","",7.743,-23.87,6.2,22,"cluster",0,1],["M94","Cat\u2019s Eye Galaxy",12.848,41.12,8.1,11,"galaxy",0,1],["M95","",10.733,11.7,9.7,3,"galaxy",0,0],["M96","",10.78,11.82,9.2,8,"galaxy",0,0],["M97","Owl Nebula",11.247,55.02,11.2,3,"nebula",0,0],["M98","",12.23,14.9,10.1,10,"galaxy",0,0],["M99","",12.313,14.42,9.8,5,"galaxy",0,0],["M100","",12.382,15.82,9.4,7,"galaxy",0,0],["M101","Pinwheel",14.053,54.35,7.7,29,"galaxy",1,1],["M102","Spindle",15.108,55.76,9.9,5,"galaxy",0,0],["M103","",1.553,60.7,7.4,6,"cluster",0,0],["M104","Sombrero",12.667,-11.62,8.3,9,"galaxy",0,1],["M105","",10.797,12.58,9.3,5,"galaxy",0,0],["M106","",12.317,47.3,8.3,19,"galaxy",0,1],["M107","",16.542,-13.05,8.1,10,"globular",0,1],["M108","",11.192,55.67,10,9,"galaxy",0,0],["M109","",11.96,53.38,9.8,8,"galaxy",0,0],["M110","",0.673,41.68,8,22,"galaxy",0,1]];
  { const have = new Set(DSO.map(d => d.id));
    const short = { galaxy: 'galaxy', cluster: 'star cluster', nebula: 'nebula', globular: 'globular cluster', double: 'double star' };
    MESSIER.forEach(r => { if (have.has(r[0])) return;
      DSO.push({ id: r[0], name: r[1] ? `${r[1]} (${r[0]})` : `${r[0]} (${short[r[6]] || r[6]})`, ra: r[2], dec: r[3], mag: r[4], size: r[5], kind: r[6], lowSB: !!r[7], photo: !!r[8], messier: true }); });
    DSO.forEach(d => { if (/^M\d+$/.test(d.id)) d.messier = true; }); }
  const KIND_LABEL = { galaxy: 'Galaxy', cluster: 'Star cluster', nebula: 'Nebula', globular: 'Globular cluster', double: 'Double star', milkyway: 'Milky Way', planet: 'Planet', moon: 'Moon' };

  // Can this target be seen with naked eye / the scope at this site?
  function gearReach(t, gs, interests) {
    const eye = interests.nakedEye || gs.kind === 'eyes';
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

  // Horizon profile: 8 altitudes (N, NE, E, SE, S, SW, W, NW); interpolated by azimuth
  function horizonAt(hz, az) {
    if (!hz) return 0;
    const f = ((az % 360) + 360) % 360 / 45, i = Math.floor(f) % 8, j = (i + 1) % 8, w = f - Math.floor(f);
    return (hz[i] || 0) * (1 - w) + (hz[j] || 0) * w;
  }
  // weather: {cloud, seeing, transp} or null (unknown -> neutral)
  function scoreHour(t, pos, sunAlt, moon, wx, reach, hzAlt) {
    if (!reach.ok) return 0;
    const minAlt = Math.max(t.kind === 'moon' || t.kind === 'planet' ? 8 : 15, (hzAlt || 0) + 2);
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

  /* Which eyepiece (or instrument) to use for a target tonight */
  function suggestView(t, st, gs, seeing) {
    if (gs.kind === 'eyes' || !gs.views.length) return { text: 'Naked eye' };
    const views = gs.views, se = seeing == null ? 3 : seeing;
    const cap = Math.min(gs.maxUseful, se >= 4 ? 260 : se >= 3 ? 160 : se >= 2 ? 110 : 80);
    const pickHigh = () => { const ok = views.filter(v => v.mag <= cap); return ok.length ? ok[ok.length - 1] : views[0]; };
    let v, why = '';
    if (t.kind === 'milkyway') return { text: 'Naked eye, no telescope' };
    if (t.kind === 'double' && t.size >= 0.25) { const lowish = views.filter(x => x.mag >= 30); v = lowish.length ? lowish[0] : views[views.length - 1]; why = '; it splits easily'; }
    else if (t.kind === 'planet' || t.kind === 'double') { v = pickHigh(); if (v.mag < views[views.length - 1].mag) why = ' (steadier air would allow more)'; }
    else if (t.kind === 'moon') { const whole = views.filter(x => x.tfov >= 0.6); v = whole.length ? whole[whole.length - 1] : views[0]; why = '; zoom in on the terminator after'; }
    else { const fits = views.filter(x => x.tfov * 60 >= t.size * 1.5); v = fits.length ? fits[fits.length - 1] : views[0]; }
    let text = gs.kind === 'binoculars' ? v.label : `${v.label} (${Math.round(v.mag)}×)`;
    if (t.kind === 'nebula' && gs.nebFilter) text += ` + ${gs.nebFilter.name}`;
    return { text: text + why, view: v };
  }

  /* Eyepiece advisor: which eyepieces would fill gaps in a telescope's magnification range */
  function eyepieceAdvice(g) {
    if (!g || g.kind !== 'telescope' && g.kind) return [];
    const D = +g.aperture, F = +g.focal; if (!D || !F) return [];
    const have = (g.eyepieces || []).map(e => +e.fl).filter(Boolean);
    const mags = fl => [F / fl].concat(+g.barlow > 1 ? [F * g.barlow / fl] : []);
    const lo = Math.max(F / 32, D / 7), hi = Math.min(2 * D, 230);
    const covered = have.flatMap(mags).filter(m => m <= 2 * D);
    const gapScore = list => { const pts = [lo, hi].concat(list.filter(m => m >= lo && m <= hi)).sort((a, b) => a - b); let worst = 0; for (let i = 1; i < pts.length; i++) worst = Math.max(worst, Math.log(pts[i] / pts[i - 1])); return worst; };
    const base = gapScore(covered);
    const cands = [32, 25, 20, 17, 15, 12, 10, 9, 8, 7, 6, 5].filter(fl => !have.includes(fl) && F / fl <= 2 * D * 1.05);
    return cands.map(fl => {
      const m = F / fl, mb = +g.barlow > 1 ? m * g.barlow : null, afov = fl >= 25 ? 50 : 52, tfov = afov / m;
      return { fl, mag: m, barlowMag: mb && mb <= 2 * D ? mb : null, tfov, exit: D / m, gain: base - gapScore(covered.concat([m], mb && mb <= 2 * D ? [mb] : [])) };
    }).filter(c => c.gain > 0.02).sort((a, b) => b.gain - a.gain).slice(0, 3).map(c => {
      let use;
      if (c.mag < 35) use = `widest views: star clusters, the Pleiades, Andromeda's core, sweeping the Milky Way (${c.tfov.toFixed(1)}° field)`;
      else if (c.mag < 80) use = 'galaxies, nebulae and globular clusters, and the whole Moon';
      else use = 'planets, the Moon up close and double stars, on steady nights';
      return Object.assign(c, { text: `A ${c.fl} mm eyepiece gives ${Math.round(c.mag)}×${c.barlowMag ? ` (${Math.round(c.barlowMag)}× with your Barlow)` : ''}, good for ${use}.` });
    });
  }

  /* Exposure helper. Through the telescope at prime focus, or a camera lens on a tripod. */
  const ALBEDO = { Moon: 0.12, Mercury: 0.14, Venus: 0.75, Mars: 0.17, Jupiter: 0.52, Saturn: 0.47, Uranus: 0.51, Neptune: 0.41 };
  function shutterText(t) { if (t >= 1) return `${t < 10 ? t.toFixed(1).replace(/\.0$/, '') : Math.round(t)} s`; const d = Math.round(1 / t); const std = [8000, 4000, 2000, 1000, 500, 250, 125, 60, 30, 15, 8, 4, 2]; return `1/${std.reduce((a, b) => Math.abs(b - d) < Math.abs(a - d) ? b : a)} s`; }
  function exposurePlan(body, date, opt) {
    // opt: { focal (mm), fnum, iso, mount: 'manual'|'motor'|'tripod', cropFactor, pixel }
    const iso = opt.iso || 200, N = opt.fnum;
    let base; // seconds at this ISO and f-number for the full Moon (Looney 11 rule: f/11 at 1/ISO)
    base = (N / 11) * (N / 11) / iso;
    if (body === 'Moon') {
      const ill = A.Illumination('Moon', date).phase_fraction;
      const factor = ill > 0.85 ? 1 : ill > 0.6 ? 2 : ill > 0.35 ? 4 : 8;
      return { t: base * factor, text: `${shutterText(base * factor)} at ISO ${iso}`, note: ill < 0.35 ? 'Thin crescent: bracket longer to bring out earthshine.' : 'Bracket one stop either side; the terminator needs more light than the bright limb.' };
    }
    if (ALBEDO[body]) {
      const r = A.HelioDistance(body, date);
      const factor = (ALBEDO.Moon / 1) / (ALBEDO[body] / (r * r));
      const t = base * factor;
      return { t, text: `${shutterText(t)} at ISO ${iso}`, note: 'Planets look best from video: record a minute, then stack the sharpest frames (free tools: PIPP, AutoStakkert!, RegiStax).' };
    }
    return null;
  }
  function trailLimit(focal, opt) {
    // longest exposure before stars trail noticeably, untracked: 500 rule and the stricter NPF rule
    const crop = opt.cropFactor || 1.6, N = opt.fnum || 5.6, p = opt.pixel || 5.2, dec = opt.dec || 0;
    const cosd = Math.max(0.2, Math.cos(dec * D2R));
    return { rule500: 500 / (focal * crop) / cosd, npf: (35 * N + 30 * p) / focal / cosd };
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
        const hz = horizonAt(opts.horizon, pos.az);
        const s = scoreHour(t, pos, h.sunAlt, { alt: h.moonPos.alt, illum: h.moonIllum, sep }, h.wx, reach, hz);
        return { s: Math.round(s * ap), alt: pos.alt, az: pos.az, clear: pos.alt - hz };
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
    // Upper Midwest detail (towns matter for local sky darkness)
    ['Madison', 43.073, -89.401, 450000], ['Green Bay', 44.519, -88.020, 330000], ['Duluth-Superior', 46.787, -92.100, 280000],
    ['Appleton', 44.262, -88.415, 250000], ['Rochester MN', 44.012, -92.480, 220000], ['Kenosha', 42.585, -87.821, 170000],
    ['Eau Claire', 44.811, -91.498, 170000], ['Muskegon', 43.234, -86.248, 170000], ['La Crosse', 43.801, -91.240, 140000],
    ['Racine', 42.726, -87.783, 135000], ['Janesville', 42.683, -89.019, 100000], ['Dubuque', 42.501, -90.664, 100000],
    ['Wausau', 44.959, -89.630, 75000], ['Oshkosh', 44.025, -88.543, 70000], ['Sheboygan', 43.751, -87.714, 50000],
    ['Beloit', 42.508, -89.032, 50000], ['Stevens Point', 44.524, -89.574, 50000], ['Fond du Lac', 43.773, -88.447, 45000],
    ['Manitowoc', 44.089, -87.657, 35000], ['West Bend', 43.425, -88.183, 32000], ['Marquette', 46.546, -87.395, 30000],
    ['Watertown', 43.195, -88.729, 25000], ['Wisconsin Rapids', 44.384, -89.817, 25000], ['Marshfield', 44.669, -90.172, 25000],
    ['Baraboo-Dells', 43.470, -89.744, 25000], ['Marinette-Menominee', 45.100, -87.630, 20000], ['Iron Mountain', 45.820, -88.066, 20000],
    ['Menomonie', 44.876, -91.919, 16000], ['Beaver Dam', 43.458, -88.837, 16000], ['Escanaba', 45.745, -87.064, 15000],
    ['Platteville', 42.734, -90.478, 12000], ['Monroe', 42.601, -89.638, 11000], ['Portage', 43.539, -89.462, 10000],
    ['Ironwood', 46.455, -90.171, 10000], ['Rice Lake', 45.506, -91.738, 9000], ['Shawano', 44.782, -88.609, 9000],
    ['Sturgeon Bay', 44.834, -87.377, 9000], ['Tomah', 43.980, -90.504, 9000], ['Ashland', 46.592, -90.884, 8000],
    ['Rhinelander', 45.637, -89.412, 8000], ['Prairie du Chien', 43.051, -91.141, 6000], ['Minocqua', 45.871, -89.711, 5000],
    ['Hayward', 46.013, -91.485, 3000], ['St Cloud', 45.557, -94.163, 150000], ['Mankato', 44.164, -93.999, 60000],
    ['Cedar Rapids', 41.978, -91.666, 180000], ['Waterloo IA', 42.493, -92.343, 110000], ['Iowa City', 41.661, -91.530, 120000],
    ['Quad Cities', 41.524, -90.578, 280000], ['Peoria', 40.694, -89.589, 270000], ['Champaign', 40.116, -88.243, 145000],
    ['Bloomington IL', 40.484, -88.994, 130000], ['Springfield IL', 39.781, -89.650, 160000], ['Lansing', 42.733, -84.555, 310000],
    ['Kalamazoo', 42.292, -85.587, 210000], ['Flint', 43.013, -83.687, 300000], ['Saginaw', 43.419, -83.951, 120000],
    ['Traverse City', 44.763, -85.621, 50000], ['Sault Ste Marie', 46.496, -84.345, 90000], ['Fargo', 46.877, -96.790, 220000],
    ['Sioux Falls', 43.545, -96.731, 210000], ['Bismarck', 46.808, -100.784, 100000], ['Grand Forks', 47.925, -97.033, 70000],
    // United States metros
    ['New York', 40.713, -74.006, 19400000], ['Los Angeles', 34.052, -118.244, 12200000], ['Chicago', 41.878, -87.630, 8700000],
    ['Miami', 25.762, -80.192, 6100000], ['Houston', 29.760, -95.370, 5900000], ['Dallas-Fort Worth', 32.777, -96.797, 5700000],
    ['Philadelphia', 39.953, -75.165, 5700000], ['Washington DC', 38.907, -77.037, 5200000], ['Atlanta', 33.749, -84.388, 5100000],
    ['Boston', 42.360, -71.059, 4400000], ['Phoenix', 33.448, -112.074, 4000000], ['Detroit', 42.331, -83.046, 3800000],
    ['Seattle', 47.606, -122.332, 3500000], ['San Francisco Bay', 37.775, -122.419, 3500000], ['San Diego', 32.716, -117.161, 3100000],
    ['Minneapolis-St Paul', 44.977, -93.265, 2900000], ['Tampa', 27.951, -82.457, 2800000], ['Denver', 39.739, -104.990, 2700000],
    ['Baltimore', 39.290, -76.612, 2200000], ['St Louis', 38.627, -90.199, 2200000], ['Las Vegas', 36.170, -115.140, 2200000],
    ['Riverside-San Bernardino', 34.055, -117.183, 2300000], ['Portland OR', 45.515, -122.679, 2100000], ['San Antonio', 29.424, -98.494, 2100000],
    ['Orlando', 28.538, -81.379, 2000000], ['Sacramento', 38.582, -121.494, 1950000], ['San Jose', 37.339, -121.895, 1850000],
    ['Austin', 30.267, -97.743, 1800000], ['Charlotte', 35.227, -80.843, 1700000], ['Pittsburgh', 40.441, -79.996, 1700000],
    ['Cincinnati', 39.103, -84.512, 1700000], ['Kansas City', 39.100, -94.578, 1700000], ['Indianapolis', 39.768, -86.158, 1700000],
    ['Cleveland', 41.499, -81.694, 1700000], ['Columbus OH', 39.961, -82.999, 1600000], ['Milwaukee', 43.039, -87.906, 1400000],
    ['Virginia Beach', 36.853, -75.978, 1450000], ['Nashville', 36.163, -86.781, 1300000], ['Salt Lake City', 40.761, -111.891, 1200000],
    ['Jacksonville', 30.332, -81.656, 1300000], ['Providence', 41.824, -71.413, 1300000], ['Raleigh', 35.780, -78.639, 1100000],
    ['Memphis', 35.150, -90.049, 1050000], ['Louisville', 38.253, -85.759, 1000000], ['Richmond', 37.541, -77.436, 1000000],
    ['Oklahoma City', 35.468, -97.516, 1000000], ['New Orleans', 29.951, -90.072, 960000], ['Grand Rapids', 42.963, -85.668, 750000],
    ['Hartford', 41.765, -72.674, 950000], ['Buffalo', 42.886, -78.878, 950000], ['Birmingham', 33.521, -86.802, 750000],
    ['Tucson', 32.222, -110.975, 900000], ['Rochester NY', 43.157, -77.616, 750000], ['Honolulu', 21.307, -157.858, 850000],
    ['Tulsa', 36.154, -95.993, 720000], ['Fresno', 36.738, -119.787, 720000], ['Omaha', 41.257, -95.935, 820000],
    ['Albuquerque', 35.084, -106.650, 770000], ['El Paso', 31.762, -106.485, 850000], ['Bakersfield', 35.373, -119.019, 570000],
    ['Albany NY', 42.653, -73.756, 600000], ['Knoxville', 35.961, -83.921, 600000], ['Baton Rouge', 30.451, -91.187, 630000],
    ['McAllen', 26.203, -98.230, 780000], ['Dayton', 39.759, -84.192, 720000], ['Columbia SC', 34.000, -81.035, 550000],
    ['Charleston SC', 32.776, -79.931, 680000], ['Greenville SC', 34.853, -82.394, 500000], ['Boise', 43.615, -116.202, 550000],
    ['Colorado Springs', 38.834, -104.821, 650000], ['Des Moines', 41.587, -93.625, 530000], ['Little Rock', 34.746, -92.290, 460000],
    ['Wichita', 37.687, -97.330, 500000], ['Akron', 41.081, -81.519, 570000], ['Toledo', 41.654, -83.536, 500000],
    ['Syracuse', 43.049, -76.147, 410000], ['Spokane', 47.659, -117.426, 480000], ['Madison-area exurbs', 43.0, -89.6, 0],
    ['Harrisburg', 40.273, -76.887, 450000], ['Allentown', 40.608, -75.490, 620000], ['Scranton', 41.409, -75.662, 380000],
    ['Chattanooga', 35.046, -85.309, 400000], ['Lexington', 38.040, -84.504, 320000], ['Fort Wayne', 41.079, -85.139, 330000],
    ['Lincoln', 40.813, -96.703, 300000], ['Reno', 39.530, -119.814, 450000], ['Provo', 40.234, -111.659, 500000],
    ['Ogden', 41.223, -111.974, 420000], ['Fort Collins', 40.585, -105.084, 330000], ['Lubbock', 33.578, -101.855, 290000],
    ['Amarillo', 35.222, -101.831, 220000], ['Corpus Christi', 27.801, -97.396, 350000], ['Shreveport', 32.525, -93.750, 300000],
    ['Jackson MS', 32.299, -90.185, 350000], ['Mobile', 30.695, -88.040, 330000], ['Pensacola', 30.421, -87.217, 400000],
    ['Tallahassee', 30.438, -84.281, 260000], ['Savannah', 32.081, -81.091, 300000], ['Greensboro', 36.073, -79.792, 500000],
    ['Asheville', 35.595, -82.551, 280000], ['Roanoke', 37.271, -79.941, 210000], ['Portland ME', 43.659, -70.257, 250000],
    ['Burlington VT', 44.476, -73.212, 120000], ['Manchester NH', 42.991, -71.464, 250000], ['Springfield MA', 42.101, -72.590, 580000],
    ['Worcester', 42.263, -71.802, 490000], ['New Haven', 41.308, -72.928, 560000], ['Billings', 45.783, -108.501, 130000],
    ['Missoula', 46.872, -113.994, 90000], ['Rapid City', 44.081, -103.231, 100000], ['Cheyenne', 41.140, -104.820, 80000],
    ['Casper', 42.867, -106.313, 60000], ['Flagstaff', 35.198, -111.651, 80000], ['Santa Fe', 35.687, -105.938, 110000],
    ['Eugene', 44.052, -123.087, 270000], ['Salem OR', 44.943, -123.035, 280000], ['Medford', 42.327, -122.876, 160000],
    ['Bend', 44.058, -121.315, 110000], ['Tacoma', 47.253, -122.444, 0], ['Yakima', 46.602, -120.506, 130000],
    ['Tri-Cities WA', 46.235, -119.223, 250000], ['Santa Barbara', 34.420, -119.698, 200000], ['Stockton', 37.958, -121.291, 420000],
    ['Modesto', 37.639, -120.997, 360000], ['Palm Springs', 33.830, -116.545, 360000], ['Redding', 40.587, -122.392, 120000],
    ['Anchorage', 61.218, -149.900, 300000], ['Fairbanks', 64.838, -147.716, 70000], ['Juneau', 58.302, -134.420, 32000],
    // Canada
    ['Toronto', 43.653, -79.383, 6200000], ['Montreal', 45.502, -73.567, 4200000], ['Vancouver', 49.283, -123.121, 2600000],
    ['Calgary', 51.045, -114.057, 1450000], ['Edmonton', 53.546, -113.494, 1350000], ['Ottawa-Gatineau', 45.421, -75.697, 1300000],
    ['Winnipeg', 49.895, -97.138, 800000], ['Quebec City', 46.813, -71.208, 800000], ['Hamilton', 43.256, -79.869, 750000],
    ['Kitchener-Waterloo', 43.452, -80.493, 550000], ['London ON', 42.984, -81.246, 500000], ['Halifax', 44.649, -63.575, 440000],
    ['Victoria', 48.428, -123.366, 390000], ['Windsor', 42.315, -83.037, 340000], ['Saskatoon', 52.133, -106.670, 320000],
    ['Regina', 50.445, -104.619, 250000], ['Sherbrooke', 45.404, -71.893, 220000], ['St Johns', 47.561, -52.713, 210000],
    ['Kelowna', 49.888, -119.496, 220000], ['Barrie', 44.389, -79.690, 210000], ['Sudbury', 46.522, -80.953, 170000],
    ['Kingston', 44.231, -76.486, 170000], ['Saguenay', 48.428, -71.068, 160000], ['Trois-Rivieres', 46.344, -72.548, 160000],
    ['Moncton', 46.088, -64.778, 160000], ['Thunder Bay', 48.382, -89.247, 120000], ['Saint John', 45.273, -66.063, 130000],
    ['Red Deer', 52.269, -113.811, 100000], ['Lethbridge', 49.694, -112.833, 100000], ['Kamloops', 50.675, -120.327, 100000],
    ['Nanaimo', 49.166, -123.940, 110000], ['Prince George', 53.917, -122.749, 85000], ['Sault Ste Marie ON', 46.522, -84.346, 0],
    ['Whitehorse', 60.721, -135.057, 28000], ['Yellowknife', 62.454, -114.372, 20000]
  ].filter(c => c[3] > 0);
  const LP_BOX = { lat0: 24, lat1: 72, lon0: -170, lon1: -52 };
  // bucket cities on a 4-degree grid so each sky-glow lookup only visits nearby cities
  const BUCKET = 4, buckets = new Map();
  CITIES.forEach(c => { const k = Math.floor(c[1] / BUCKET) + ':' + Math.floor(c[2] / BUCKET); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(c); });
  function nearbyCities(lat, lon) {
    const out = [], bi = Math.floor(lat / BUCKET), bj = Math.floor(lon / BUCKET), span = lat > 55 ? 3 : 2;
    for (let i = bi - 1; i <= bi + 1; i++) for (let j = bj - span; j <= bj + span; j++) { const b = buckets.get(i + ':' + j); if (b) out.push(...b); }
    return out;
  }
  function kmBetween(la1, lo1, la2, lo2) {
    const x = (lo2 - lo1) * D2R * Math.cos((la1 + la2) / 2 * D2R), y = (la2 - la1) * D2R;
    return Math.sqrt(x * x + y * y) * 6371;
  }
  // Artificial sky brightness as a multiple of the natural sky (Walker 1977: ~0.01 * P * d^-2.5),
  // with each city spread over a core radius so its centre does not blow up.
  function skyGlow(lat, lon) {
    let r = 0;
    for (const c of nearbyCities(lat, lon)) {
      const d = kmBetween(lat, lon, c[1], c[2]);
      if (d > 450) continue;
      const core = 0.26 * Math.pow(c[3], 0.3);
      const de = Math.sqrt(d * d + core * core);
      r += 0.03 * c[3] * Math.pow(de, -2.5) * Math.exp(-d / 300); // extinction over long paths
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
    for (const c of nearbyCities(lat, lon)) { const d = kmBetween(lat, lon, c[1], c[2]); const w = c[3] * Math.pow(Math.max(d, 5), -2.5); if (!near || w > near.w) near = { name: c[0], d, w }; }
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


  /* ---------- Jupiter's Galilean moons ---------- */
  const RJ_AU = 71492 / AU_KM;
  function jupiterMoons(date) {
    const g = A.GeoVector('Jupiter', date, true);
    const dist = Math.hypot(g.x, g.y, g.z), u = [g.x / dist, g.y / dist, g.z / dist];
    const lt = dist * AU_KM / 299792.458; // light time, seconds
    const jm = A.JupiterMoons(new Date(date.getTime() - lt * 1000));
    let e = [-u[1], u[0], 0]; const el = Math.hypot(e[0], e[1]); e = [e[0] / el, e[1] / el, 0];
    const n = [u[1] * e[2] - u[2] * e[1], u[2] * e[0] - u[0] * e[2], u[0] * e[1] - u[1] * e[0]];
    const out = {};
    for (const k of ['io', 'europa', 'ganymede', 'callisto']) {
      const m = jm[k], v = [m.x, m.y, m.z];
      const dx = (v[0] * e[0] + v[1] * e[1] + v[2] * e[2]) / RJ_AU, dy = (v[0] * n[0] + v[1] * n[1] + v[2] * n[2]) / RJ_AU, dz = (v[0] * u[0] + v[1] * u[1] + v[2] * u[2]) / RJ_AU;
      const onDisk = Math.hypot(dx, dy / 0.935) < 1;
      out[k] = { x: dx, y: dy, front: dz < 0, transit: onDisk && dz < 0, hidden: onDisk && dz > 0 };
    }
    return out;
  }
  const MOON_NAMES = { io: 'Io', europa: 'Europa', ganymede: 'Ganymede', callisto: 'Callisto' };
  function jupiterEvents(start, end) {
    const ev = [], state = {};
    for (let t = start.getTime(); t <= end.getTime(); t += 5 * 60e3) {
      const jm = jupiterMoons(new Date(t));
      for (const k in jm) {
        const kind = jm[k].transit ? 'transit' : jm[k].hidden ? 'hidden' : null, prev = state[k];
        if (kind && (!prev || prev.kind !== kind)) { state[k] = { kind, start: new Date(t) }; }
        if ((!kind || (prev && prev.kind !== kind)) && prev && prev.kind) { ev.push({ moon: MOON_NAMES[k], kind: prev.kind, start: prev.start, end: new Date(t) }); state[k] = kind ? { kind, start: new Date(t) } : null; }
      }
    }
    for (const k in state) if (state[k]) ev.push({ moon: MOON_NAMES[k], kind: state[k].kind, start: state[k].start, end: null });
    return ev.sort((a, b) => a.start - b.start);
  }

  /* ---------- Moon features along the terminator ---------- */
  // selenographic longitude (east +), short note
  const LUNAR = [
    ['Mare Crisium', 59, 'a walled sea near the eastern edge'], ['Langrenus', 61, 'big crater with central peaks'], ['Petavius', 60, 'crater with a rille across its floor'],
    ['Cleomedes', 56, 'large crater north of Mare Crisium'], ['Posidonius', 30, 'ruined crater on the edge of Mare Serenitatis'], ['Theophilus, Cyrillus and Catharina', 25, 'a chain of three great craters'],
    ['Rupes Altai', 23, 'a long curving cliff'], ['Maurolycus', 14, 'heavily cratered southern highlands'], ['Hipparchus and Albategnius', 4, 'old, flat-floored craters'],
    ['Alpine Valley', 3, 'a straight valley slicing the Alps'], ['Lunar X', 1, 'an X of light on crater rims, for a few hours around first quarter'],
    ['Ptolemaeus, Alphonsus and Arzachel', -2, 'a line of three big craters'], ['Apennine Mountains', -3, 'the Moon’s grandest mountain range'], ['Archimedes', -4, 'a lava-flooded crater'],
    ['Rupes Recta (the Straight Wall)', -8, 'a 110 km fault line'], ['Plato', -9, 'a dark, smooth-floored crater'], ['Tycho', -11, 'a young crater with rays'], ['Eratosthenes', -11, 'terraced crater at the end of the Apennines'],
    ['Clavius', -14, 'a huge crater with a curve of smaller craters inside'], ['Copernicus', -20, 'the "monarch of the Moon," terraced walls and peaks'], ['Sinus Iridum', -31, 'the Bay of Rainbows, a half-ring of mountains'],
    ['Kepler', -38, 'bright rayed crater'], ['Gassendi', -40, 'crater with a cracked floor'], ['Aristarchus', -47, 'the brightest spot on the Moon'], ['Schickard', -55, 'a vast low-walled crater'], ['Grimaldi', -68, 'a very dark crater near the western edge']
  ];
  function moonTerminator(date) {
    const ph = A.MoonPhase(date), waxing = ph < 180;
    const Lt = waxing ? 90 - ph : 270 - ph;
    const list = LUNAR.filter(([n, lon]) => { const d = waxing ? lon - Lt : Lt - lon; return d >= 1 && d <= 15; }).map(([name, lon, note]) => ({ name, lon, note }));
    return { phase: ph, waxing, terminatorLon: Lt, features: list };
  }

  /* ---------- Lunar occultations (Moon covering a planet or bright star) ---------- */
  const OCC_STARS = [['Aldebaran', 4.5987, 16.509], ['Regulus', 10.1395, 11.967], ['Spica', 13.4199, -11.161], ['Antares', 16.4901, -26.432], ['the Pleiades', 3.7836, 24.1167]];
  function occultations(start, months, lat, lon) {
    const end = new Date(start.getTime() + months * 30.44 * 864e5), obs = new A.Observer(lat, lon, 0), out = [];
    const targets = [['Mercury'], ['Venus'], ['Mars'], ['Jupiter'], ['Saturn'], ['Uranus'], ['Neptune']].map(x => ({ name: x[0], body: x[0] })).concat(OCC_STARS.map(s => ({ name: s[0], ra: s[1], dec: s[2] })));
    const posGeo = (t, d) => t.body ? A.Equator(t.body, d, GEO, false, true) : { ra: t.ra, dec: t.dec };
    for (let t = start.getTime(); t <= end.getTime(); t += 3 * 3600e3) {
      const d = new Date(t), m = A.Equator('Moon', d, GEO, false, true);
      for (const tg of targets) {
        const p = posGeo(tg, d);
        if (sepDeg(m.ra, m.dec, p.ra, p.dec) > 2.2) continue;
        // refine with the view from this location
        let best = null;
        for (let tt = t - 4 * 3600e3; tt <= t + 4 * 3600e3; tt += 4 * 60e3) {
          const dd = new Date(tt), mt = A.Equator('Moon', dd, obs, false, true), pt = tg.body ? A.Equator(tg.body, dd, obs, false, true) : { ra: tg.ra, dec: tg.dec };
          const sep = sepDeg(mt.ra, mt.dec, pt.ra, pt.dec), rad = Math.asin(1737.4 / (mt.dist * AU_KM)) * R2D;
          if (!best || sep - rad < best.miss) best = { miss: sep - rad, time: dd };
        }
        if (best && best.miss < 0) {
          const h = A.Horizon(best.time, obs, A.Equator('Moon', best.time, obs, true, true).ra, A.Equator('Moon', best.time, obs, true, true).dec, 'normal');
          const sun = topo('Sun', best.time, lat, lon).alt;
          if (h.altitude > 3 && out.every(o => o.name !== tg.name || Math.abs(o.time - best.time) > 6 * 3600e3)) {
            out.push({ name: tg.name, time: best.time, moonAlt: h.altitude, sunAlt: sun, dark: sun < -6, illum: A.Illumination('Moon', best.time).phase_fraction });
          }
        }
      }
    }
    return out.sort((a, b) => a.time - b.time);
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

  const api = { jupiterMoons, jupiterEvents, moonTerminator, occultations, LUNAR, azFast, compass, whereText, suggestView, eyepieceAdvice, exposurePlan, trailLimit, shutterText, MESSIER, horizonAt, CITIES, skyGlow, lightPollution, inLPBox, kmBetween, geomagLat, auroraChance, kpNeeded, nightAlert, marsLs, marsSeason, saturnRings, ringText, solarDays, A, clamp, lerp, altFast, geoEq, gast, topo, topoFixed, sepDeg, moonInfo, moonPhaseName, planetState, gearStats, estSeeing, estTransparency, PLANETS, DSO, KIND_LABEL, gearReach, scoreHour, rating, evaluateTargets, bestWindow, nights, calendar, NELM_BY_BORTLE };
  if (typeof module !== 'undefined') module.exports = api; else root.Core = api;
})(this);
