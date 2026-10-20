# Starcast: notes for Claude

Starcast is an astronomy viewing-conditions globe: earth.nullschool-style weather layers on a 3D globe, ClearDarkSky-style hourly forecasts for any clicked spot, and Stellarium-style sky knowledge, scored against the owner's own telescope and interests. It was designed and built in a claude.ai conversation in October 2026; this file carries that context forward. `ROADMAP.md` is the feature log and `README.md` is the user-facing guide. Keep both current when features change.

## The owner

- Hobbyist observer in Wisconsin (timezone America/Chicago). Uses ClearDarkSky, earth.nullschool.net and Stellarium, and wanted something combining them.
- Gear: Barska AE10758 reflector (114 mm aperture, 900 mm focal length), K20 Kellner eyepiece (about 40° apparent field), 3× Barlow, UHC filter. Plans a T-ring and T-adapter for a Canon EOS Rebel T3 at prime focus. Also enjoys naked-eye stargazing. No solar filter yet.
- Interests: planets, the Moon, deep sky, double stars, meteor showers, astrophotography, solar observing, aurora, Mars seasons, Saturn's ring tilt.
- Hosts the site on GitHub Pages from this repository. Single user for now; the app may serve others and become a phone app later.

## Decisions so far

- Web app that runs in any browser first. One self-contained `index.html` so it can be opened as a file or hosted statically.
- Weather map layers cover Wisconsin first (0.5° grid, lat 42–47.5, lon −93.5 to −86). Spot forecasts work anywhere.
- Weather: Open-Meteo (free, non-commercial, CC BY 4.0; attribution is shown in the Saved tab and must stay). The US "best match" blends HRRR and GFS. Aerosols from CAMS via Open-Meteo's air-quality API.
- Seeing and transparency are Starcast's own estimates (`estSeeing`, `estTransparency` in `src/core.js`). They are not ClearDarkSky's Canadian (CMC) forecasts. The owner is logging comparisons in the app's Forecast checks (Saved tab); when they paste the copied table, use it to retune the thresholds.
- Light pollution: a Walker's-law city-glow model over 48 Upper Midwest cities (`CITIES`, `skyGlow` in `src/core.js`), not satellite data. Calibrated so downtown Madison ≈ Bortle 7, Kettle Moraine South ≈ 5, Governor Dodge ≈ 4, northern Wisconsin forests and Newport State Park ≈ 3. Only valid inside `LP_BOX`.
- Aurora: NOAA SWPC Kp 3-day forecast and OVATION nowcast. Rule of thumb: overhead poleward of 67 − 2.5×Kp geomagnetic latitude, visible low in the north about 3° beyond.
- Alerts: GitHub Actions on a schedule (`.github/workflows/alerts.yml`) runs `alerts/check.mjs`, which sends via ntfy and/or Gmail SMTP. Locations and settings live in the `ALERTS_CONFIG` repository secret, not in the public repo, to keep home coordinates private. Never commit `alerts.json` or any secret.
- Safety: never recommend observing the Sun unless a solar filter is listed in gear; otherwise show the warning.

## Repository layout

| Path | What it is |
|---|---|
| `src/app.html` | The app's page, styles and interface code. `<!--LIBS-->` marks where libraries are inlined |
| `src/core.js` | Shared engine: astronomy, gear maths, condition estimates, target scoring, calendar, Mars seasons, Saturn rings, light pollution, aurora, alert text. Runs in the browser and in Node |
| `build.mjs` | Builds `index.html` from `src/` plus libraries, and copies `src/core.js` to `alerts/core.js` |
| `index.html` | Built output that GitHub Pages serves. Do not edit by hand; edit `src/` and rebuild |
| `alerts/check.mjs` | Scheduled alert job (`--mode=daily|evening|test`, `--dry-run`, `--config=file`) |
| `alerts/core.js` | Copy of `src/core.js` made by the build. Do not edit directly |
| `.github/workflows/alerts.yml` | Alert schedule: 20:35 and 01:35 UTC, plus manual runs |

## Building and testing

- `npm install`, then `npm run build`. Commit the rebuilt `index.html` and `alerts/core.js` together with the `src/` change.
- Alert job offline: in `alerts/`, run `npm install`, then `STARCAST_MOCK=1 node check.mjs --mode=test --dry-run --config=<settings.json>` (PowerShell: `$env:STARCAST_MOCK=1; node check.mjs ...`). The mock serves a clear night, then clouds, and a Kp 6 storm.
- The app shows "Sample weather" when Open-Meteo can't be reached; it generates moving cloud bands so the interface stays usable.
- Check light and dark themes and a phone-width layout (about 400 px) after interface changes.

## Code conventions

- Library versions are pinned (Astronomy Engine 2.1.19, D3 7.9.0, topojson-client 3.1.0). Astronomy Engine's `Illumination(...).ring_tilt` is negative when the north face shows; `saturnRings()` flips the sign.
- All colors are CSS tokens on `:root`, with light values under `prefers-color-scheme: light` and `[data-theme="light"]`. Globe colors come from the `--map-*` tokens via `readPalette()`. No literal colors in components.
- Settings persist in `localStorage` under `starcast.*` keys, wrapped in try/catch.
- Plain-language copy, written from the observer's side. Times show as "9 pm". Units default to °F and mph.
- External services the browser calls directly: `api.open-meteo.com`, `air-quality-api.open-meteo.com`, `services.swpc.noaa.gov`, `overpass-api.de`. Each must fail gracefully.

## Next up

From `ROADMAP.md`:
- Tune seeing and transparency once about 10 Forecast checks are in.
- Horizon profiles per saved site: sketch by hand first, phone-panorama capture later.
- Driving times and park hours for "Where to go".
- Larger target catalog, Jupiter Great Red Spot transits and moon events, solar eclipses, lunar occultations, ISS passes, comets.
- Satellite-based light pollution to refine the city-glow model.
- Accounts and sync across devices; installable phone web app; weather layers beyond Wisconsin.
