# Starcast

**An astronomy viewing-conditions globe.** Starcast puts sky-watching weather on a 3D globe the way earth.nullschool.net does for wind, gives you ClearDarkSky-style hourly forecasts for any spot, tells you what is worth pointing your own telescope or binoculars at tonight, plans the night for you, and alerts you when a good night is coming.

Version 3.1 · October 2026 · Weather map layers cover the contiguous US, Alaska and Canada; spot forecasts and sky information work anywhere.

---

## What it does

**On the globe**
- **Weather layers for the US and Canada:** cloud cover, an overall observing score, seeing, transparency, high cloud, jet stream, dew risk and light pollution. Zoom in and detailed regional data loads automatically.
- **Sky layers:** the night side, the sunlit side, the aurora (NOAA), and where on Earth each planet or the Moon can be seen.
- **Base maps:** the simple map, OpenStreetMap, topographic, satellite, dark streets, or NASA's night-lights view of the Earth (a good real-world check on light pollution). Choose **None** under weather to read the map clearly.
- **72-hour time slider**, light/dark/automatic theme, and a red night-vision mode.

**For any spot**
- **Find it** by clicking the globe, searching a place name, typing coordinates, or using your current location. Set one saved spot as **home** and Starcast opens there.
- **Hourly strip:** cloud, transparency, seeing, darkness, dew risk, wind, how well the weather models agree, aurora chance and temperature.
- **Worth seeing tonight:** the Moon, planets, all 110 Messier objects and other showpieces, scored for your instrument, sky darkness, moonlight and weather, with a note on what each will look like.
- **Observing plan:** tonight's targets in order, with the time, where to look ("partway up in the southwest, 32° up"), the constellation, and which eyepiece and filter to use.
- **Red view:** the plan one target at a time in large red text for use at the telescope. It keeps the screen awake.
- **Sky chart:** your whole sky at the chosen hour, with constellations, planets, tonight's targets and your horizon.
- **Tonight's events:** Jupiter's moons and their shadows (and when they cross the planet), Moon features along the terminator, and visible ISS and Tiangong passes.
- **Where to go:** named state and county parks, forests, natural areas, campgrounds and dark-sky parks within 30–120 miles, ranked by sky darkness, clouds and distance, with driving times and opening hours where known.
- **Solar observing:** daytime clear spells, shown only once a certified solar filter is in your gear.

**Planning and setup**
- **Sky calendar:** 12 months of oppositions, elongations, meteor showers, lunar and solar eclipses, Moon phases, Mars seasons, and lunar occultations as seen from your spot, plus the next solar eclipse worth seeing from there.
- **Gear:** telescope, binoculars and naked-eye profiles, with pick-lists of common eyepieces and cameras and a worked explanation of every number. Telescopes include eyepieces, Barlow, filters, mount and camera. The eyepiece advisor suggests what to add next. The photography helper gives starting exposures, trailing limits, and a framing preview for deep-sky objects and for the Sun, Moon and planets at today's size.
- **Saved tab:** saved spots with sky darkness and horizon profiles, the observing log with Messier progress, alert settings, forecast checks, and backup/restore.
- **Install on your phone's home screen** so it opens like an app.
- **Accounts (optional):** sign in with Google to keep saved spots, gear, the observing log and settings on every device. See [SETUP-ACCOUNTS.md](SETUP-ACCOUNTS.md) to switch this on.

## Using it

1. Visit your hosted link, or open `index.html` in a current browser.
2. **Drag** the globe to rotate, **scroll or pinch** to zoom, and **click** a spot. Or use the search box at the top of the Forecast tab: a town name, or coordinates like `43.07, -89.40` or `43°4'23"N 89°24'4"W`.
3. Choose layers on the left (on phones, the strip above the time bar), and move the **time slider** to change the hour.
4. In **Forecast**, press **Save** to keep a spot. Then set its horizon: how high trees and buildings block the sky in each direction.
5. Use **Observing plan → Red view** at the telescope, and press **Seen it** to log each target.
6. Set up your instruments and interests in **Gear**.

The line under the logo shows whether the forecast is live. "Sample weather" means the forecast service could not be reached; sky information is still accurate.

## How the forecasts work

| Value | Source |
|---|---|
| Clouds, humidity, dew point, temperature, wind, jet stream | Open-Meteo. In the US it blends NOAA's HRRR and GFS models; in Canada it uses the Canadian GEM model |
| Model agreement | Open-Meteo: US (GFS), European (ECMWF) and Canadian (GEM) cloud forecasts compared hour by hour |
| Haze (aerosol optical depth) | Copernicus CAMS, through Open-Meteo |
| Seeing and transparency (1–5) | Starcast estimates from jet-stream winds, humidity, high cloud and haze |
| Light pollution and Bortle class | Starcast estimate: a city-glow model (Walker's law with atmospheric extinction) over 224 North American cities |
| Aurora | NOAA SWPC: 3-day Kp forecast, and the OVATION aurora map for the next hour or so |
| Place search | Open-Meteo geocoding |
| Parks, public land, opening hours | OpenStreetMap, through the Overpass API |
| Driving times | OSRM public routing service |
| Satellite orbits | CelesTrak |
| Sun, Moon, planets, Jupiter's moons, events, occultations | Calculated in the browser with Astronomy Engine |
| Satellite passes | Calculated in the browser with satellite.js |
| Stars and constellations | d3-celestial data (stars to magnitude 5) |
| Mars seasons | Solar longitude (Ls) per Allison & McEwen (2000), the method behind NASA's Mars24 |

Seeing, transparency and light pollution are estimates. Use **Forecast checks** in the Saved tab to compare seeing and transparency with ClearDarkSky and with what you actually see.

The light-pollution model counts towns of a few thousand people only in the Upper Midwest. Elsewhere it uses cities of about 30,000 or more, so some rural spots near small towns read a little darker than they really are. You can override sky darkness for any saved spot.

Open-Meteo's free tier allows 600 calls a minute, 5,000 an hour and 10,000 a day, and counts each place in a request as a call. Starcast keeps a running budget below those limits:
- A grid for the whole continent loads first (about 320 places, one point every 3° by 3.5°).
- Detailed 0.5° data loads a few areas at a time for wherever you zoom in.
- Everything is cached in your browser for 2 hours.

If the limit is reached anyway, the line under the logo says so and when loading will continue. Starcast never fills the map with made-up weather; add `?demo` to the address to see sample weather for testing.

## Alerts (one-time setup)

Alerts run as a free scheduled job on GitHub. Every afternoon it checks tonight's forecast for each saved spot with alerts turned on, and sends a phone notification, an email, or both when your rules are met. An evening run checks for aurora, and on Monday mornings you get a week-ahead outlook.

**1. Choose how to be notified** (one or both):
- **Phone notification (easiest):** install the free **ntfy** app (iPhone or Android). Subscribe to a topic with a long, hard-to-guess name, for example `starcast-` followed by random letters. Anyone who knows the name can read the alerts, so keep it private.
- **Email:** for Gmail, turn on 2-Step Verification, then create an **App password** under Google Account → Security. You'll use it as `SMTP_PASS`.

**2. Copy your alert settings.** In Starcast, go to **Saved → Alerts**. Tick the spots to watch, choose your rules, enter your Starcast web address, and press **Copy alert settings**.

**3. Add repository secrets.** In your GitHub repository, go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret | Value |
|---|---|
| `ALERTS_CONFIG` | The settings you copied in step 2 |
| `NTFY_TOPIC` | Your ntfy topic name (for phone notifications) |
| `SMTP_USER` | Your Gmail address (for email) |
| `SMTP_PASS` | Your Gmail app password (for email) |
| `ALERT_EMAIL_TO` | Where to send emails (for email) |

For a provider other than Gmail, also add `SMTP_HOST` and `SMTP_PORT`.

Your locations go in a secret rather than a file because the repository is public. That keeps your backyard's coordinates private.

**4. Test it.** Go to **Actions → Starcast alerts → Run workflow**, keep mode on **test**, and run it. You should get a notification within a minute or two. If not, open the run to see what went wrong.

**Good to know**
- Scheduled times are in UTC, set in the `cron` lines of `.github/workflows/alerts.yml`:
  - daily check: 3:35 pm CDT (2:35 pm CST)
  - aurora check: 8:35 pm CDT (7:35 pm CST)
  - weekly outlook: Mondays at 8:35 am CDT (7:35 am CST)
- GitHub may run scheduled jobs a few minutes late.
- GitHub pauses scheduled jobs in a repository with no activity for 60 days. Any commit, or re-enabling the workflow under Actions, restarts them.
- When you change saved spots, horizons or gear, copy the alert settings again and update the `ALERTS_CONFIG` secret.

## Your data

Without an account, everything you enter (saved spots, gear, log, settings and forecast checks) stays in your browser on that device. Use **Saved → Back up and move to another device** to save it to a file, or to copy it onto your phone.

If you sign in with Google, the same data is also stored in Starcast's Supabase database so it can sync between devices. Database security rules let each person read and change only their own rows. Your name, email and profile picture come from Google and are used only to show who is signed in. You can delete your cloud data from the account menu at any time.

The app sends only the coordinates of spots you look at, to these services:
- Open-Meteo, for forecasts and place search
- OpenStreetMap's Overpass service and OSRM, when you search for places to go
- NOAA and CelesTrak, which receive no location at all

Alert settings live only in your GitHub secret.

## Hosting

This repository is set up for GitHub Pages: go to **Settings → Pages** and deploy from the `main` branch, `/ (root)` folder. The site is served at https://krauskagis.com/Starcast/ because the portfolio site's custom domain applies to all GitHub Pages sites on this account. It updates a minute or two after each commit. "Install on your phone" and "Use my location" need the hosted site, since browsers allow them only over https.

## Files

| File | What it is |
|---|---|
| `index.html` | The whole app in one file, built from `src/`. This is what GitHub Pages serves |
| `src/app.html` | The page layout and styles |
| `src/js/*.js` | The app's code, in modules: main (globe, panels), weather, base maps, locations, telescope (plan, red view, sky chart, log), gear, events, app (confidence, drive times, backup, install), boot |
| `src/core.js` | Starcast's astronomy, forecast and scoring engine, shared by the app and the alert job |
| `build.mjs`, `package.json` | Build script: `npm install`, then `npm run build` rebuilds `index.html` |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | Let Starcast install on a phone and open offline |
| `alerts/check.mjs` | The alert job: fetches forecasts and sends notifications |
| `alerts/core.js` | Copy of the engine for the alert job, made by the build |
| `.github/workflows/alerts.yml` | The schedule that runs the alert job |
| `supabase/schema.sql` | Database tables and security rules for accounts (run once in Supabase) |
| `SETUP-ACCOUNTS.md` | Step-by-step guide to switching on Google sign-in |
| `CLAUDE.md` | Project notes for Claude Code |
| `README.md` | This file |
| `ROADMAP.md` | Feature log: everything planned and its status |

To change the app, edit the files in `src/` and run `npm run build` (needs Node.js 20 or newer). To try the alert job on your own computer: in `alerts/`, run `npm install`, then `node check.mjs --mode=test --dry-run --config=my-settings.json`.

## Known limits

- Weather map layers cover the US (including Alaska) and Canada; spot forecasts work worldwide.
- Seeing, transparency and light pollution are estimates still being checked.
- The aurora map from NOAA covers only the next hour or so; further ahead, the aurora layer is drawn from the Kp forecast.
- Driving times come from a free public routing service and may be missing at busy times; park hours appear only where OpenStreetMap lists them.
- Satellite passes cover the ISS and Tiangong only.
- No live Martian weather; Mars season and dust-storm risk are shown instead.
- Without an account, saved data lives in one browser; use backup and restore, or sign in, to move it.

## Credits

- Weather data and place search by [Open-Meteo.com](https://open-meteo.com/), licensed CC BY 4.0. Free use is for non-commercial purposes.
- Aerosol forecasts from the Copernicus Atmosphere Monitoring Service (CAMS).
- Aurora and Kp forecasts from the [NOAA Space Weather Prediction Center](https://www.swpc.noaa.gov/).
- Park data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, through the Overpass API. Driving times from [OSRM](https://project-osrm.org/).
- Satellite orbits from [CelesTrak](https://celestrak.org/).
- Base map tiles: [OpenStreetMap](https://www.openstreetmap.org/copyright) (© OpenStreetMap contributors), [OpenTopoMap](https://opentopomap.org/) (CC-BY-SA), Esri World Imagery (© Esri, Maxar, Earthstar Geographics), [CARTO](https://carto.com/attributions) dark basemap, and NASA Black Marble night lights via [GIBS](https://www.earthdata.nasa.gov/gibs). Tiles are loaded only for what's on screen, as their usage policies ask.
- [Astronomy Engine](https://github.com/cosinekitty/astronomy) by Don Cross (MIT License).
- [satellite.js](https://github.com/shashwatak/satellite-js) (MIT License).
- Star, constellation and Messier data from [d3-celestial](https://github.com/ofrohn/d3-celestial) by Olaf Frohn (BSD 3-Clause License).
- [D3](https://d3js.org/) and [TopoJSON](https://github.com/topojson/topojson-client) by Mike Bostock (ISC License).
- Map outlines from [Natural Earth](https://www.naturalearthdata.com/) (public domain) via world-atlas and us-atlas.
- Accounts and database by [Supabase](https://supabase.com/) (supabase-js, MIT License) with [PostGIS](https://postgis.net/).
- Phone notifications through [ntfy.sh](https://ntfy.sh/); email through [Nodemailer](https://nodemailer.com/).
- Inspired by [ClearDarkSky](https://www.cleardarksky.com/), [earth.nullschool.net](https://earth.nullschool.net/) and [Stellarium](https://stellarium.org/).

**Safety:** never look at the Sun through any telescope, finder, binoculars or camera without a certified full-aperture solar filter.
