# Starcast

**An astronomy viewing-conditions globe.** Starcast puts sky-watching weather on a 3D globe the way earth.nullschool.net does for wind, gives you ClearDarkSky-style hourly forecasts for any spot you click, and tells you what is worth pointing your own telescope at tonight. It can also send you an alert when tonight looks good.

Version 2.0 · October 2026 · Weather map layers cover Wisconsin; spot forecasts and sky information work anywhere.

---

## What it does

**On the globe**
- **Wisconsin weather layers:** cloud cover, an overall observing score, seeing, transparency, high cloud, jet stream, dew risk and light pollution.
- **Sky layers:** the night side, the sunlit side, the aurora (from NOAA), and where on Earth Mercury, Venus, Mars, Jupiter, Saturn or the Moon can be seen.
- **72-hour time slider** with a play button.
- **Light, dark or automatic theme**, plus a red night-vision mode.

**For any spot you click**
- **Hourly strip:** cloud, transparency, seeing, darkness, dew risk, wind, aurora chance and temperature.
- **Sky darkness:** an estimated Bortle class from Starcast's light-pollution model, which you can override for saved spots.
- **Worth seeing tonight:** the Moon, planets and 30+ deep-sky showpieces scored 0–100 for each night. Each target gets a best viewing window and a note on what it will look like in your telescope.
- **Alert preview:** the message an alert would send, including aurora chances.
- **Where to go:** the darkest, clearest public parks and forests within 30–120 miles, with directions.
- **Solar observing:** daytime clear spells, shown only once a certified solar filter is in your gear.

**Planning and setup**
- **Sky calendar:** 12 months of oppositions, elongations, meteor showers, eclipses, Moon phases and Mars seasons, plus a status card for Mars and Saturn's rings.
- **Your gear:** telescope, eyepieces, Barlow, camera and filters, with advice on when to use a nebula filter.
- **Saved locations, alerts and forecast checks** in the Saved tab.

## Using it

1. Open `index.html` in a current browser, or visit your hosted link.
2. **Drag** the globe to rotate, **scroll or pinch** to zoom, and **click** a spot for its forecast.
3. Choose layers on the left (on phones, the strip above the time bar).
4. Move the **time slider**, or tap a column in the forecast strip, to change the hour.
5. In **Forecast**, press **Save** to keep a spot, and use **Find dark, clear spots** to plan a drive.
6. Set up your equipment and interests in **Gear**.

The line under the logo shows whether the forecast is live. "Sample weather" means the forecast service could not be reached; sky information is still accurate.

## How the forecasts work

| Value | Source |
|---|---|
| Clouds, humidity, dew point, temperature, wind, jet stream | Open-Meteo, which blends NOAA's HRRR and GFS models for the US |
| Haze (aerosol optical depth) | Copernicus CAMS, through Open-Meteo |
| Seeing (1–5) | Starcast estimate from jet-stream, mid-level and surface winds |
| Transparency (1–5) | Starcast estimate from high cloud, humidity and haze |
| Light pollution and Bortle class | Starcast estimate: a city-glow model (Walker's law) using populations of 48 Upper Midwest cities |
| Aurora | NOAA SWPC: 3-day Kp forecast, and the OVATION aurora map for the next hour or so |
| Parks and public land | OpenStreetMap, through the Overpass API |
| Sun, Moon, planets, events, Saturn's ring tilt | Calculated in the browser with Astronomy Engine |
| Mars seasons | Solar longitude (Ls) per Allison & McEwen (2000), the method behind NASA's Mars24 |

Seeing, transparency and light pollution are estimates. Use **Forecast checks** in the Saved tab to compare seeing and transparency with ClearDarkSky and with what you actually see.

Light pollution is estimated only within the Upper Midwest; elsewhere Starcast uses your default sky darkness. Aurora chances use a simple rule of thumb: at Kp, the aurora is overhead poleward of about 67 − 2.5×Kp degrees geomagnetic latitude, and visible low in the north about 3 degrees beyond that. Southern Wisconsin typically needs Kp 5 or more.

## Alerts (one-time setup)

Alerts run as a free scheduled job on GitHub. Every afternoon it checks tonight's forecast for each saved spot with alerts turned on. If your rules are met, it sends a phone notification, an email, or both. A second evening run checks only for aurora.

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
- Scheduled times are in UTC. The daily check runs at 3:35 pm CDT (2:35 pm CST), and the aurora check at 8:35 pm CDT (7:35 pm CST). To change them, edit the `cron` lines in `.github/workflows/alerts.yml`. GitHub may run them a few minutes late.
- GitHub pauses scheduled jobs in a repository with no activity for 60 days. Any commit, or re-enabling the workflow under Actions, restarts them.
- When you change saved spots or gear, copy the alert settings again and update the `ALERTS_CONFIG` secret.

## Your data

Everything you enter (saved locations, gear, settings and forecast checks) stays in your browser on that device. The app sends only the coordinates of spots you look at: to Open-Meteo for forecasts, and to OpenStreetMap's Overpass service when you search for places to go. Alert settings live only in your GitHub secret.

## Hosting

This repository is set up for GitHub Pages: go to **Settings → Pages** and deploy from the `main` branch, `/ (root)` folder. The app appears at `https://krauskajames.github.io/starcast/`, and updates a minute or two after each commit.

## Files

| File | What it is |
|---|---|
| `index.html` | The whole app in one file, built from `src/`. This is what GitHub Pages serves |
| `src/app.html` | The app's page, styles and interface code |
| `src/core.js` | Starcast's astronomy, forecast and scoring engine, shared by the app and the alert job |
| `build.mjs`, `package.json` | Build script: `npm install`, then `npm run build` rebuilds `index.html` |
| `alerts/check.mjs` | The alert job: fetches forecasts and sends notifications |
| `alerts/core.js` | Copy of the engine for the alert job, made by the build |
| `.github/workflows/alerts.yml` | The schedule that runs the alert job |
| `CLAUDE.md` | Project notes for Claude Code |
| `README.md` | This file |
| `ROADMAP.md` | Feature log: everything planned and its status |

To change the app, edit the files in `src/` and run `npm run build` (needs Node.js 20 or newer). To try the alert job on your own computer: in `alerts/`, run `npm install`, then `node check.mjs --mode=test --dry-run --config=my-settings.json`.

## Known limits

- Weather map layers cover Wisconsin only; spot forecasts work worldwide.
- Seeing, transparency and light pollution are estimates still being checked.
- The aurora map from NOAA covers only the next hour or so. Further ahead, the aurora layer is drawn from the Kp forecast.
- "Where to go" measures straight-line distance, and parks may close at night. Check hours and access before you go.
- No live Martian weather; Mars season and dust-storm risk are shown instead.
- Saved data lives on one device.

## Credits

- Weather data by [Open-Meteo.com](https://open-meteo.com/), licensed CC BY 4.0. Free use is for non-commercial purposes.
- Aerosol forecasts from the Copernicus Atmosphere Monitoring Service (CAMS).
- Aurora and Kp forecasts from the [NOAA Space Weather Prediction Center](https://www.swpc.noaa.gov/).
- Park data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, through the Overpass API.
- [Astronomy Engine](https://github.com/cosinekitty/astronomy) by Don Cross (MIT License).
- [D3](https://d3js.org/) and [TopoJSON](https://github.com/topojson/topojson-client) by Mike Bostock (ISC License).
- Map outlines from [Natural Earth](https://www.naturalearthdata.com/) (public domain) via world-atlas and us-atlas.
- Phone notifications through [ntfy.sh](https://ntfy.sh/); email through [Nodemailer](https://nodemailer.com/).
- Inspired by [ClearDarkSky](https://www.cleardarksky.com/), [earth.nullschool.net](https://earth.nullschool.net/) and [Stellarium](https://stellarium.org/).

**Safety:** never look at the Sun through any telescope, finder, binoculars or camera without a certified full-aperture solar filter.
