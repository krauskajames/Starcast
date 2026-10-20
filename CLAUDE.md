# Starcast: notes for Claude

Starcast is an astronomy viewing-conditions globe: earth.nullschool-style weather layers on a 3D globe, ClearDarkSky-style hourly forecasts for any clicked spot, and Stellarium-style sky knowledge, scored against the owner's own telescope and interests. It was designed and built in a claude.ai conversation in October 2026; this file carries that context forward. `ROADMAP.md` is the feature log and `README.md` is the user-facing guide. Keep both current when features change.

## The owner

- Hobbyist observer in Wisconsin (timezone America/Chicago). Uses ClearDarkSky, earth.nullschool.net and Stellarium, and wanted something combining them.
- Gear: Barska AE10758 reflector (114 mm aperture, 900 mm focal length) on a manual equatorial mount (no motor), K20 Kellner eyepiece (about 40° apparent field), 3× Barlow, UHC filter. Plans a T-ring and T-adapter for a Canon EOS Rebel T3 at prime focus; no camera lenses yet. No binoculars (but wants Starcast to support them) and no solar filter yet. Also enjoys naked-eye stargazing.
- Interests: planets, the Moon, deep sky, double stars, meteor showers, astrophotography, solar observing, aurora, Mars seasons, Saturn's ring tilt.
- Hosts the site on GitHub Pages from this repository. Single user for now; the app may serve others and become a phone app later.

## Decisions so far

- Web app that runs in any browser first. One self-contained `index.html` so it can be opened as a file or hosted statically.
- Weather map layers cover the contiguous US, Alaska and Canada (v3). A coarse continental grid (2.5° × 3°, `COARSE` in `src/js/20-weather.js`) loads first; 5° tiles at 0.5° load for the zoomed-in view (max 8 at a time) and around the selected spot. Layers and tiles are cached in IndexedDB for 90 minutes to stay within Open-Meteo's free limits. Grid points far from US/Canada land are skipped. Spot forecasts work anywhere.
- Weather: Open-Meteo (free, non-commercial, CC BY 4.0; attribution is shown in the Saved tab and must stay). The US "best match" blends HRRR and GFS. Aerosols from CAMS via Open-Meteo's air-quality API.
- Seeing and transparency are Starcast's own estimates (`estSeeing`, `estTransparency` in `src/core.js`). They are not ClearDarkSky's Canadian (CMC) forecasts. The owner is logging comparisons in the app's Forecast checks (Saved tab); when they paste the copied table, use it to retune the thresholds.
- Light pollution: a Walker's-law city-glow model with 300 km atmospheric extinction over 224 North American cities (`CITIES`, `skyGlow` in `src/core.js`; dense small-town detail only in the Upper Midwest), not satellite data. Calibration checks: downtown Madison ≈ Bortle 7, Middleton 6, Kettle Moraine South 5, Governor Dodge 4, Cherry Springs PA 3 (real ≈ 2), northern Wisconsin and Newport State Park 2–3. The app renders it from cached tiles (`lpVal` in `20-weather.js`).
- Aurora: NOAA SWPC Kp 3-day forecast and OVATION nowcast. Rule of thumb: overhead poleward of 67 − 2.5×Kp geomagnetic latitude, visible low in the north about 3° beyond.
- Alerts: GitHub Actions on a schedule (`.github/workflows/alerts.yml`) runs `alerts/check.mjs`, which sends via ntfy and/or Gmail SMTP. Locations and settings live in the `ALERTS_CONFIG` repository secret, not in the public repo, to keep home coordinates private. Never commit `alerts.json` or any secret.
- Safety: never recommend observing the Sun unless a solar filter is listed in gear; otherwise show the warning.

## Repository layout

| Path | What it is |
|---|---|
| `src/app.html` | Page markup and CSS. `<!--LIBS-->` marks where libraries go, `<!--APP-->` where the modules go |
| `src/js/*.js` | App modules, concatenated in filename order inside one IIFE: `10-main` (state, globe, time bar, panels), `20-weather` (grid/tiles, IndexedDB cache, light-pollution tiles), `30-locations` (search, coordinates, home, horizon), `40-telescope` (plan, red view, sky chart, log), `50-gear` (profiles, advisor, photography), `60-events` (Jupiter moons, Moon terminator, satellite passes, occultations), `70-app` (model agreement, drive times, backup, install), `90-boot` |
| `src/core.js` | Shared engine: astronomy, gear maths, condition estimates, target scoring, calendar, Mars seasons, Saturn rings, light pollution, aurora, alert text. Runs in the browser and in Node |
| `build.mjs` | Builds `index.html` from `src/` plus libraries and sky data (d3-celestial stars ≤ mag 5, constellation lines/boundaries, with inside-out boundaries fixed), and copies `src/core.js` to `alerts/core.js` |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | Home-screen install; network-first service worker for the app shell only |
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
- Module order matters only for top-level statements: a module's top-level code may use anything from earlier files; functions are hoisted across all modules.
- The page defines its own `[hidden]{display:none!important}`; modals rely on it.
- All colors are CSS tokens on `:root`, with light values under `prefers-color-scheme: light` and `[data-theme="light"]`. Globe colors come from the `--map-*` tokens via `readPalette()`. No literal colors in components.
- Settings persist in `localStorage` under `starcast.*` keys, wrapped in try/catch.
- Plain-language copy, written from the observer's side. Times show as "9 pm". Units default to °F and mph.
- External services the browser calls directly: `api.open-meteo.com` (forecast, and multi-model `models=` for agreement), `air-quality-api.open-meteo.com`, `geocoding-api.open-meteo.com`, `services.swpc.noaa.gov`, `overpass-api.de`, `router.project-osrm.org`, `celestrak.org`. Each must fail gracefully.

## Next up

From `ROADMAP.md`:
- Tune seeing and transparency once about 10 Forecast checks are in.
- Jupiter Great Red Spot transit times and moon shadows; solar eclipses; Starlink trains; comets.
- Live satellite cloud imagery (GOES), smoke layer, solar activity.
- Satellite-based light pollution (to capture small towns), more detailed Canadian coastline, weather beyond North America.
- "Clearing later tonight" alerts; accounts and sync; horizon capture from a phone panorama; sketches and photos in the log; NGC/Caldwell catalog.
