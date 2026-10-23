# Starcast: notes for Claude

Starcast is an astronomy viewing-conditions globe: earth.nullschool-style weather layers on a 3D globe, ClearDarkSky-style hourly forecasts for any clicked spot, and Stellarium-style sky knowledge, scored against the owner's own telescope and interests. It was designed and built in a claude.ai conversation in October 2026; this file carries that context forward. `ROADMAP.md` is the feature log and `README.md` is the user-facing guide. Keep both current when features change.

## The owner

- Hobbyist observer in Wisconsin (timezone America/Chicago). Uses ClearDarkSky, earth.nullschool.net and Stellarium, and wanted something combining them.
- Gear: Barska AE10758 reflector (114 mm aperture, 900 mm focal length) on a manual equatorial mount (no motor), K20 Kellner eyepiece (about 40° apparent field), 3× Barlow, UHC filter. Plans a T-ring and T-adapter for a Canon EOS Rebel T3 at prime focus; no camera lenses yet. No binoculars (but wants Starcast to support them) and no solar filter yet. Also enjoys naked-eye stargazing.
- Interests: planets, the Moon, deep sky, double stars, meteor showers, astrophotography, solar observing, aurora, Mars seasons, Saturn's ring tilt.
- Hosts the site on GitHub Pages from this repository. Single user for now; the app may serve others and become a phone app later.

## Decisions so far

- Web app that runs in any browser first. One self-contained `index.html` so it can be opened as a file or hosted statically.
- Worldwide weather (v3.4): `pipeline/gfs.py` (Python, eccodes + numpy) runs in `.github/workflows/site.yml` every 6 hours (cron 20 4,10,16,22 UTC) and on pushes. It reads the newest complete GFS run (0p50 files, f000–f072 every 3 h, averaged down to 1° with a tent filter so small showers don't become speckle) by byte range from NOAA's AWS bucket using the .idx inventory, falls back to the NOMADS grib filter, and if neither works copies the files already published at krauskagis.com/Starcast/data/wx (pushes use `--reuse-only`). Output `data/wx/manifest.json` + `<cycle>/fFFF.bin.gz`: 1° grid (lat −90..90 rows, lon −180..179), 8 one-byte channels (cloud, hcloud, rh, temp, spread=T−Td, w10, j250, w500; byte 255 = missing; value = offset + byte×scale; units %, °C, km/h like Open-Meteo). Cloud prefers instantaneous fields, otherwise de-averages GFS 0–6 h means. The deploy uses actions/deploy-pages, so Pages Source must be "GitHub Actions"; `data/` is never committed. Offline test: `pipeline/test/make_fake.py` + `fake_server.py` (Range and filter requests). Client: `src/js/22-global.js` (`loadGlobal`, `globalValue` with a cubic B-spline in space (GFS cloud is near-binary; Catmull-Rom made square blocks), linear in time; IndexedDB cache keys `gfs:<cycle>/…`; a new run swaps in only once its first steps load). `gridValRaw` uses GFS as the base everywhere, then Open-Meteo detail tiles (now any land, via a 0.25° land raster `inLand`) feathered on top; the North American Open-Meteo grid (`loadCoarse`) runs only if the files can't load. `?debug` exposes `window.__sc` for tests. The service worker skips `/data/`.
- Open-Meteo North American grid (v3, now the fallback). Open-Meteo's free tier is 600 calls/minute, 5,000/hour, 10,000/day, and each location in a multi-location request counts (weight = places × variables/10). v3.0 broke this (about 1,400 places at once → HTTP 429 → sample weather). Since v3.1 every Open-Meteo request goes through `omGet()` in `src/js/20-weather.js`, which keeps a rolling budget (`LIMITS`: 420/min, 3,800/h, 8,500/day, stored in localStorage `omUse`), records 429 blocks, and throws `RateLimited`. Weights are counted conservatively as at least 1 per place. The coarse grid is 3° × 3.5° to 84°N (`COARSE`, about 365 places, fits one minute's budget); 5° tiles at 0.5° load at most 4 at a time for the zoomed view. Interpolation is Catmull-Rom (clamped) with bilinear fallback at gaps. The map uses detail tiles only when zoomed in (k ≥ 9; tiles load from k ≥ 8) and only finished tiles, feathered over 1.5° into the coarse grid where a neighbouring tile isn't loaded (`tileTrust`); spot forecasts always use the best data. Cache lifetime is 2 hours. Partially loaded layers resume (`todo` chunks). Never show sample weather on failure; demo data only with `?demo`.
- Weather: Open-Meteo (free, non-commercial, CC BY 4.0; attribution is shown in the Saved tab and must stay). The US "best match" blends HRRR and GFS. Aerosols from CAMS via Open-Meteo's air-quality API.
- Seeing and transparency are Starcast's own estimates (`estSeeing`, `estTransparency` in `src/core.js`). They are not ClearDarkSky's Canadian (CMC) forecasts. The owner is logging comparisons in the app's Forecast checks (Saved tab); when they paste the copied table, use it to retune the thresholds.
- Light pollution: a Walker's-law city-glow model with 300 km atmospheric extinction over 224 North American cities (`CITIES`, `skyGlow` in `src/core.js`; dense small-town detail only in the Upper Midwest), not satellite data. Calibration checks: downtown Madison ≈ Bortle 7, Middleton 6, Kettle Moraine South 5, Governor Dodge 4, Cherry Springs PA 3 (real ≈ 2), northern Wisconsin and Newport State Park 2–3. The app renders it from cached tiles (`lpVal` in `20-weather.js`).
- Aurora: NOAA SWPC Kp 3-day forecast and OVATION nowcast. Rule of thumb: overhead poleward of 67 − 2.5×Kp geomagnetic latitude, visible low in the north about 3° beyond.
- Alerts: GitHub Actions on a schedule (`.github/workflows/alerts.yml`) runs `alerts/check.mjs`, which sends via ntfy and/or Gmail SMTP. Locations and settings live in the `ALERTS_CONFIG` repository secret, not in the public repo, to keep home coordinates private. Never commit `alerts.json` or any secret.
- Safety: never recommend observing the Sun unless a solar filter is listed in gear; otherwise show the warning.

## Accounts (v3.2)

- Supabase (Postgres + PostGIS) with Google sign-in, PKCE flow. Config constants `SUPABASE_URL` and `SUPABASE_ANON_KEY` (publishable key) at the top of `src/js/75-account.js`; empty means accounts are off and the Sign in button is hidden. Configured Oct 22, 2026 for Supabase project `lqlkyanlnmszxyuyqjyd`. The site is served at https://krauskagis.com/Starcast/ (the user site's custom domain applies to project pages); github.io addresses redirect there. Supabase redirect URLs and Google JavaScript origins must use krauskagis.com. The service_role key must never be used in the app.
- `supabase/schema.sql`: `user_state` (one jsonb per user mirroring the localStorage keys in `SYNC_KEYS`) and `saved_locations` (geography(Point,4326), GiST index, written only via the `sync_saved_locations(jsonb)` function, read via the `saved_locations_v` view). RLS: own rows only, `to authenticated`. Verified on local Postgres 16 + PostGIS: idempotent, user B cannot read/insert/update A's rows, anon sees nothing.
- Sync: `store.set` calls `store.onChange`; changes to `SYNC_KEYS` are pushed after 1.5 s. On sign-in the device's data merges with the cloud (lists by id: saved `cid`, gears/log/checks `id`; scalars: cloud wins), then one reload. Saved spots carry a stable `cid` (added on load if missing).
- Setup steps for the owner are in `SETUP-ACCOUNTS.md`.

## Repository layout

| Path | What it is |
|---|---|
| `src/app.html` | Page markup and CSS. `<!--LIBS-->` marks where libraries go, `<!--APP-->` where the modules go |
| `src/js/*.js` | App modules, concatenated in filename order inside one IIFE: `10-main` (state, globe, time bar, panels), `20-weather` (request budget, grid/tiles, IndexedDB cache, light-pollution tiles), `25-basemap` (tile base maps warped onto the globe with per-triangle affine transforms; no pixel access needed), `30-locations` (search, coordinates, home, horizon), `40-telescope` (plan, red view, sky chart, log), `50-gear` (profiles, advisor, photography), `60-events` (Jupiter moons, Moon terminator, satellite passes, occultations), `70-app` (model agreement, drive times, backup, install), `75-account` (Supabase sign-in and sync), `90-boot` |
| `src/core.js` | Shared engine: astronomy, gear maths, condition estimates, target scoring, calendar, Mars seasons, Saturn rings, light pollution, aurora, alert text. Runs in the browser and in Node |
| `build.mjs` | Builds `index.html` from `src/` plus libraries and sky data (d3-celestial stars ≤ mag 5, constellation lines/boundaries, with inside-out boundaries fixed), and copies `src/core.js` to `alerts/core.js` |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | Home-screen install; network-first service worker for the app shell only |
| `src/js/22-global.js` | Worldwide GFS weather files (see Decisions) and the world land raster |
| `pipeline/gfs.py`, `.github/workflows/site.yml` | GFS pipeline and the Pages deploy |
| `index.html` | Built output that GitHub Pages serves. Do not edit by hand; edit `src/` and rebuild |
| `alerts/check.mjs` | Scheduled alert job (`--mode=daily|evening|test`, `--dry-run`, `--config=file`) |
| `alerts/core.js` | Copy of `src/core.js` made by the build. Do not edit directly |
| `.github/workflows/alerts.yml` | Alert schedule: daily 20:35 UTC, aurora 01:35 UTC, weekly Monday 13:35 UTC, plus manual runs |

## Building and testing

- `npm install`, then `npm run build`. Commit the rebuilt `index.html` and `alerts/core.js` together with the `src/` change.
- Alert job offline: in `alerts/`, run `npm install`, then `STARCAST_MOCK=1 node check.mjs --mode=test --dry-run --config=<settings.json>` (PowerShell: `$env:STARCAST_MOCK=1; node check.mjs ...`). The mock serves a clear night, then clouds, and a Kp 6 storm.
- The app shows "Sample weather" when Open-Meteo can't be reached; it generates moving cloud bands so the interface stays usable.
- Check light and dark themes and a phone-width layout (about 400 px) after interface changes.

## Code conventions

- Library versions are pinned (Astronomy Engine 2.1.19, D3 7.9.0, topojson-client 3.1.0, satellite.js 5.0.0, d3-celestial 0.7.35 for data only). Astronomy Engine's `Illumination(...).ring_tilt` is negative when the north face shows; `saturnRings()` flips the sign.
- Globe drawing order: sea, base map or land, under-overlay (night, sunlit side), weather raster (opacity `S.wxOpacity`), over-overlay (aurora, planet zones), lines and labels.
- Module order matters only for top-level statements: a module's top-level code may use anything from earlier files; functions are hoisted across all modules.
- The page defines its own `[hidden]{display:none!important}`; modals rely on it.
- All colors are CSS tokens on `:root`, with light values under `prefers-color-scheme: light` and `[data-theme="light"]`. Globe colors come from the `--map-*` tokens via `readPalette()`. No literal colors in components.
- Settings persist in `localStorage` under `starcast.*` keys, wrapped in try/catch.
- Plain-language copy, written from the observer's side. Times show as "9 pm". Units default to °F and mph.
- External services the browser calls directly: `api.open-meteo.com` (forecast, and multi-model `models=` for agreement), `air-quality-api.open-meteo.com`, `geocoding-api.open-meteo.com`, `services.swpc.noaa.gov`, `overpass-api.de` (POST, with kumi.systems and private.coffee mirrors), `router.project-osrm.org`, `celestrak.org`, plus base-map tile servers (OSM, OpenTopoMap, Esri, CARTO, NASA GIBS; the GIBS night-lights URL was not verified when written). Each must fail gracefully.

## Next up

From `ROADMAP.md`:
- Tune seeing and transparency once about 10 Forecast checks are in.
- Jupiter Great Red Spot transit times and moon shadows; solar eclipses; Starlink trains; comets.
- Live satellite cloud imagery (GOES), smoke layer, solar activity.
- Satellite-based light pollution worldwide (to capture small towns and cover the rest of the world), more detailed Canadian coastline.
- Portfolio: Google branding verification through krauskagis.com. Done: `?embed` (globe + layers, `MODE` in 10-main; store writes kept in memory), `?record` + `media/tools/record.py` + `.github/workflows/media.yml` (manual; commits media/), case study at krauskagis.com/starcast.html (repo krauskajames.github.io; copy media/starcast-globe.mp4/.jpg and starcast-ui.jpg there after re-recording).
- "Clearing later tonight" alerts; accounts and sync; horizon capture from a phone panorama; sketches and photos in the log; NGC/Caldwell catalog.
