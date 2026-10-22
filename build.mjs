// Builds index.html (the whole app in one file) from src/app.html, src/core.js and the
// libraries in node_modules, and copies the shared engine to alerts/core.js.
// Usage: npm install, then npm run build
import fs from 'node:fs';
const nm = p => new URL(`./node_modules/${p}`, import.meta.url);
const read = p => fs.readFileSync(p, 'utf8');
const js = p => `<script>\n${read(p).replaceAll('</script', '<\\/script')}\n</script>`;
const geo = {
  land: JSON.parse(read(nm('world-atlas/land-50m.json'))),
  countries: JSON.parse(read(nm('world-atlas/countries-110m.json'))),
  states: JSON.parse(read(nm('us-atlas/states-10m.json')))
};
// Sky chart data from d3-celestial (BSD licence): stars to magnitude 5, constellation lines, boundaries, names
const d3 = await import('d3');
const cel = f => JSON.parse(read(nm('d3-celestial/data/' + f)));
const r2 = x => Math.round(x * 100) / 100;
const roundCoords = c => typeof c[0] === 'number' ? c.map(r2) : c.map(roundCoords);
const stars6 = cel('stars.6.json'), starNames = cel('starnames.json');
const starList = stars6.features.filter(f => f.properties.mag <= 5.0).sort((a, b) => a.properties.mag - b.properties.mag);
const bounds = cel('constellations.bounds.json');
bounds.features.forEach(f => { // some boundaries are wound inside-out for d3's spherical maths
  if (d3.geoArea(f) > 2 * Math.PI) { if (f.geometry.type === 'Polygon') f.geometry.coordinates.forEach(r => r.reverse()); else f.geometry.coordinates.forEach(p => p.forEach(r => r.reverse())); }
});
const sky = {
  stars: starList.map(f => [r2(f.geometry.coordinates[0]), r2(f.geometry.coordinates[1]), f.properties.mag]),
  names: Object.fromEntries(starList.map((f, i) => [i, f.properties.mag <= 2.1 && starNames[f.id] ? starNames[f.id].name : '']).filter(e => e[1])),
  lines: Object.fromEntries(cel('constellations.lines.json').features.map(f => [f.id, roundCoords(f.geometry.coordinates)])),
  bounds: { type: 'FeatureCollection', features: bounds.features.map(f => ({ type: 'Feature', id: f.id, geometry: { type: f.geometry.type, coordinates: roundCoords(f.geometry.coordinates) } })) },
  cons: Object.fromEntries(cel('constellations.json').features.map(f => [f.id, [f.properties.name, r2(f.geometry.coordinates[0]), r2(f.geometry.coordinates[1]), +f.properties.rank]]))
};
const libs = [
  js(nm('d3/dist/d3.min.js')),
  js(nm('topojson-client/dist/topojson-client.min.js')),
  js(nm('astronomy-engine/astronomy.browser.min.js')),
  js(nm('satellite.js/dist/satellite.min.js')),
  js(nm('@supabase/supabase-js/dist/umd/supabase.js')),
  `<script>window.GEO=${JSON.stringify(geo)};window.SKY=${JSON.stringify(sky)};</script>`,
  js(new URL('./src/core.js', import.meta.url))
].join('\n');
const jsDir = new URL('./src/js/', import.meta.url);
const appJs = fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).sort()
  .map(f => `/* ---- ${f} ---- */\n` + read(new URL(f, jsDir))).join('\n');
const app = read(new URL('./src/app.html', import.meta.url))
  .replace('<!--LIBS-->', () => libs)
  .replace('<!--APP-->', () => `<script>\n(function(){\n'use strict';\n${appJs.replaceAll('</script', '<\\/script')}\n})();\n</script>`);
const head = '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
  + '<link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#05080f"><link rel="icon" href="icon-192.png"><link rel="apple-touch-icon" href="icon-192.png">'
  + '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Starcast"><meta name="description" content="Astronomy viewing conditions on a globe, with forecasts tuned to your telescope.">';
const out = `<!doctype html>\n<html lang="en"><head>${head}</head><body>\n${app}\n</body></html>\n`;
fs.writeFileSync(new URL('./index.html', import.meta.url), out);
fs.copyFileSync(new URL('./src/core.js', import.meta.url), new URL('./alerts/core.js', import.meta.url));
console.log(`index.html: ${Math.round(out.length / 1024)} KB · alerts/core.js updated`);
