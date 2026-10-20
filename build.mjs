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
const libs = [
  js(nm('d3/dist/d3.min.js')),
  js(nm('topojson-client/dist/topojson-client.min.js')),
  js(nm('astronomy-engine/astronomy.browser.min.js')),
  `<script>window.GEO=${JSON.stringify(geo)};</script>`,
  js(new URL('./src/core.js', import.meta.url))
].join('\n');
const app = read(new URL('./src/app.html', import.meta.url)).replace('<!--LIBS-->', () => libs);
const out = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n${app}\n</body></html>\n`;
fs.writeFileSync(new URL('./index.html', import.meta.url), out);
fs.copyFileSync(new URL('./src/core.js', import.meta.url), new URL('./alerts/core.js', import.meta.url));
console.log(`index.html: ${Math.round(out.length / 1024)} KB · alerts/core.js updated`);
