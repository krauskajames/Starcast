// Starcast alerts: checks tonight's forecast for each saved location and sends a
// phone notification (ntfy) and/or email when your rules are met.
//
// Usage:  node check.mjs --mode=daily|evening|weekly|test [--dry-run] [--config=path.json]
//   daily   : afternoon check; sends a viewing alert if tonight qualifies (plus aurora)
//   evening : sends only aurora alerts for the next few hours
//   weekly  : the week ahead: which nights look best at each spot (sent every time)
//   test    : always sends tonight's summary, to confirm notifications work
//
// Settings come from the ALERTS_CONFIG environment variable (copied from Starcast's
// Saved tab) or a local JSON file. Notification secrets come from environment variables:
//   NTFY_TOPIC                         phone push via the free ntfy app
//   SMTP_USER, SMTP_PASS, ALERT_EMAIL_TO  email (SMTP_HOST defaults to smtp.gmail.com, SMTP_PORT to 465)

import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('./core.js');

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const MODE = args.mode || 'daily';
const DRY = !!args['dry-run'];
const env = process.env;

function loadConfig() {
  const raw = env.ALERTS_CONFIG && env.ALERTS_CONFIG.trim() ? env.ALERTS_CONFIG : (fs.existsSync(args.config || 'alerts.json') ? fs.readFileSync(args.config || 'alerts.json', 'utf8') : null);
  if (!raw) throw new Error('No settings found. Add the ALERTS_CONFIG secret (Starcast → Saved → Copy alert settings).');
  const cfg = JSON.parse(raw);
  if (!cfg.locations || !cfg.locations.length) throw new Error('ALERTS_CONFIG has no locations with alerts turned on.');
  cfg.rules = Object.assign({ quality: 'good', minHours: 2, aurora: true }, cfg.rules || {});
  cfg.timezone = cfg.timezone || 'America/Chicago';
  return cfg;
}

const VARS = ['cloud_cover', 'cloud_cover_high', 'relative_humidity_2m', 'dew_point_2m', 'temperature_2m', 'wind_speed_10m', 'wind_speed_250hPa', 'wind_speed_500hPa'];
const KEYS = ['cloud', 'hcloud', 'rh', 'td', 'temp', 'w10', 'j250', 'w500'];

async function getJSON(url) {
  if (env.STARCAST_MOCK) return mock(url);
  const r = await fetch(url, { headers: { 'User-Agent': 'Starcast alerts (personal use)' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url.split('?')[0]}`);
  return r.json();
}

async function forecast(lat, lon, hours) {
  const days = hours.length > 72 ? 8 : 4;
  const w = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=${VARS.join(',')}&forecast_days=${days}&timeformat=unixtime&timezone=GMT`);
  let aq = null;
  try { aq = await getJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=aerosol_optical_depth&forecast_days=${Math.min(days, 5)}&timeformat=unixtime&timezone=GMT`); } catch (e) { /* haze is optional */ }
  const off = w.hourly.time.indexOf(hours[0]);
  if (off < 0) throw new Error('Forecast does not line up with the current hour');
  const P = {};
  KEYS.forEach((k, vi) => { P[k] = hours.map((_, t) => { const v = w.hourly[VARS[vi]][off + t]; return v == null ? NaN : v; }); });
  P.aod = hours.map(u => { if (!aq) return null; const i = aq.hourly.time.indexOf(u); const v = i >= 0 ? aq.hourly.aerosol_optical_depth[i] : null; return v == null ? null : v; });
  return t => isNaN(P.cloud[t]) ? null : {
    cloud: P.cloud[t], hcloud: P.hcloud[t], rh: P.rh[t], td: P.td[t], temp: P.temp[t], w10: P.w10[t], j250: P.j250[t], aod: P.aod[t],
    seeing: C.estSeeing(P.j250[t], P.w500[t], P.w10[t]), transp: C.estTransparency(P.hcloud[t], P.rh[t], P.aod[t])
  };
}

async function kpForecast() {
  try {
    const raw = await getJSON('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json');
    let rows = [];
    if (Array.isArray(raw) && Array.isArray(raw[0])) { const h = raw[0], ti = h.indexOf('time_tag'), ki = h.indexOf('kp'); rows = raw.slice(1).map(r => ({ t: Date.parse(r[ti].replace(' ', 'T') + 'Z') / 1000, kp: +r[ki] })); }
    else if (Array.isArray(raw)) rows = raw.map(r => ({ t: Date.parse(String(r.time_tag).replace(' ', 'T') + (String(r.time_tag).endsWith('Z') ? '' : 'Z')) / 1000, kp: +(r.kp ?? r.kp_index) }));
    return rows.filter(r => isFinite(r.t) && isFinite(r.kp)).sort((a, b) => a.t - b.t);
  } catch (e) { console.warn('Kp forecast unavailable:', e.message); return []; }
}
function kpAt(kp, u) { let best = null; for (const r of kp) { if (r.t <= u + 60) best = r; else break; } return best && u - best.t <= 3 * 3600 + 60 ? best.kp : null; }

async function main() {
  const cfg = loadConfig();
  const tz = cfg.timezone;
  const hFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', timeZone: tz });
  const dFmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: tz });
  const now = Math.floor(Date.now() / 3600000) * 3600;
  const hours = Array.from({ length: MODE === 'weekly' ? 168 : 72 }, (_, i) => now + i * 3600);
  const hourLabel = i => hFmt.format(new Date(hours[i] * 1000)).replace(/\s?([AP])M/, (m, a) => a === 'A' ? ' am' : ' pm');
  const kp = cfg.rules.aurora ? await kpForecast() : [];
  const messages = [];

  for (const loc of cfg.locations) {
    try {
      const wxAt = await forecast(loc.lat, loc.lon, hours);
      const ev = C.evaluateTargets({ lat: loc.lat, lon: loc.lon, hours, wxAt, gear: cfg.gear, bortle: loc.bortle || 5, interests: cfg.interests, horizon: loc.horizon });
      if (MODE === 'weekly') {
        const lines = [];
        for (const nn of C.nights(hours, loc.lat, loc.lon)) {
          if (nn.end - nn.start < 3) continue;
          const day = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: tz }).format(new Date(hours[nn.start] * 1000));
          const a = C.nightAlert(ev, nn, wxAt, loc.name, hourLabel, day);
          if (a.good && a.quality !== 'fair') {
            const what = a.rows.slice(0, 2).map(x => x.r.t.name.replace(/ \(M\d+\)$/, '')).join(' and ');
            lines.push(`${day}: ${a.quality}, ${hourLabel(a.start)} to ${hourLabel(a.end)}, clouds ~${Math.round(a.cloud)}%${what ? ` (${what})` : ''}`);
          }
        }
        messages.push({ title: `Week ahead at ${loc.name}`, tags: 'calendar',
          body: lines.length ? `Best nights for observing:\n${lines.join('\n')}\nForecasts beyond 3 days change often; Starcast will alert you on the day.` : 'No clear nights stand out this week. Starcast will still alert you if a night clears up.' });
        console.log(`${loc.name}: ${lines.length} good night(s) this week`);
        continue;
      }
      const n = C.nights(hours, loc.lat, loc.lon).find(x => x.start < 20); // tonight
      if (!n) { console.log(`${loc.name}: no darkness tonight`); continue; }
      const al = C.nightAlert(ev, n, wxAt, loc.name, hourLabel, 'tonight');
      const meets = al.good && al.hours >= cfg.rules.minHours && (cfg.rules.quality === 'great' ? al.quality === 'great' : al.quality !== 'fair');
      console.log(`${loc.name}: ${al.text} [meets rules: ${meets}]`);
      if ((MODE === 'daily' && meets) || MODE === 'test') {
        messages.push({ title: MODE === 'test' ? `Starcast test: ${loc.name}` : `Clear skies tonight at ${loc.name}`, body: al.text, tags: 'telescope' });
      }
      // aurora
      if (cfg.rules.aurora && kp.length) {
        const ml = C.geomagLat(loc.lat, loc.lon);
        const end = MODE === 'evening' ? Math.min(n.end, 7) : n.end;
        let best = null;
        for (let i = Math.max(n.start, 0); i < end; i++) {
          const k = kpAt(kp, hours[i]); if (k == null) continue;
          const ch = C.auroraChance(k, ml), w = wxAt(i);
          if (ch.level > 0 && (!w || w.cloud < 50) && (!best || ch.level > best.ch.level || k > best.k)) best = { i, k, ch, w };
        }
        if (best && MODE !== 'test') {
          messages.push({ title: `Aurora possible tonight at ${loc.name}`, tags: 'sparkles',
            body: `Northern lights ${best.ch.text} around ${hourLabel(best.i)} (Kp ${best.k.toFixed(1)} forecast; your spot needs about Kp ${C.kpNeeded(ml).toFixed(1)}). Clouds about ${best.w ? Math.round(best.w.cloud) : '?'}%. Look north away from lights.` });
        }
      }
    } catch (e) { console.error(`${loc.name}: ${e.message}`); }
  }

  if (!messages.length) { console.log('Nothing to send.'); return; }
  const click = cfg.appUrl || '';
  if (DRY) { console.log('\n--- DRY RUN: would send ---'); messages.forEach(m => console.log(`* ${m.title}\n  ${m.body}`)); return; }

  let sent = 0;
  if (env.NTFY_TOPIC) {
    for (const m of messages) {
      const r = await fetch(`https://ntfy.sh/${encodeURIComponent(env.NTFY_TOPIC)}`, { method: 'POST', body: m.body,
        headers: Object.assign({ Title: m.title, Tags: m.tags }, click ? { Click: click } : {}) });
      if (!r.ok) console.error('ntfy failed:', r.status); else sent++;
    }
  }
  if (env.SMTP_USER && env.SMTP_PASS && env.ALERT_EMAIL_TO) {
    const nodemailer = (await import('nodemailer')).default;
    const t = nodemailer.createTransport({ host: env.SMTP_HOST || 'smtp.gmail.com', port: +(env.SMTP_PORT || 465), secure: +(env.SMTP_PORT || 465) === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } });
    const subject = messages.length === 1 ? messages[0].title : `Starcast: ${messages.length} alerts for ${dFmt.format(new Date())}`;
    const text = messages.map(m => `${m.title}\n${m.body}`).join('\n\n') + (click ? `\n\nOpen Starcast: ${click}` : '') + '\n\nWeather data by Open-Meteo.com. Aurora forecast from NOAA SWPC.';
    await t.sendMail({ from: env.SMTP_USER, to: env.ALERT_EMAIL_TO, subject, text });
    sent++;
  }
  if (!sent) console.error('No notification channel is set up. Add NTFY_TOPIC, or SMTP_USER + SMTP_PASS + ALERT_EMAIL_TO, as repository secrets.');
  else console.log(`Sent ${messages.length} alert(s).`);
}

/* Offline test data (STARCAST_MOCK=1): a clear night, then clouds, and a geomagnetic storm. */
function mock(url) {
  const d0 = Math.floor(Date.now() / 86400000) * 86400, T = Array.from({ length: 96 }, (_, i) => d0 + i * 3600);
  if (url.includes('air-quality')) return { hourly: { time: T, aerosol_optical_depth: T.map(() => 0.07) } };
  if (url.includes('k-index')) return [['time_tag', 'kp', 'observed', 'noaa_scale']].concat(Array.from({ length: 30 }, (_, i) => [new Date((d0 + i * 3 * 3600) * 1000).toISOString().slice(0, 19).replace('T', ' '), i >= 8 && i <= 10 ? '6.33' : '2.00', 'predicted', null]));
  const h = { time: T };
  h.cloud_cover = T.map(t => ((t - d0) / 3600 < 34 ? 8 : 85)); h.cloud_cover_high = T.map(() => 10); h.relative_humidity_2m = T.map(() => 70);
  h.dew_point_2m = T.map(() => 1); h.temperature_2m = T.map(() => 5); h.wind_speed_10m = T.map(() => 8); h.wind_speed_250hPa = T.map(() => 60); h.wind_speed_500hPa = T.map(() => 40);
  return { hourly: h };
}

main().catch(e => { console.error(e.message); process.exit(1); });
