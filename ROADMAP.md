# Starcast feature log

An astronomy viewing-conditions globe: earth.nullschool-style weather on a globe, ClearDarkSky-style forecasts, Stellarium-style sky knowledge, tuned to your own gear and interests.

Last updated: October 23, 2026 · Current version: v3.4

**Status key:** ✅ Done · 🔧 In progress · 🔜 Next up · 💡 Planned for later

---

## Decisions so far

- Web app that runs in any browser first, installable on a phone's home screen; a store app maybe later.
- Single user for now; built so accounts can be added later.
- Weather map layers cover the whole world (v3.4): NOAA GFS files prepared every 6 hours by GitHub Actions and published with the site; Open-Meteo for spot forecasts and zoomed-in detail. Spot forecasts work anywhere.
- Weather data: Open-Meteo (free for non-commercial use: 600 calls a minute, 5,000 an hour, 10,000 a day, counted per location). Starcast keeps a running budget below those limits: a 3° × 3.5° continental grid loads first, detailed 0.5° tiles load gradually for the region you zoom into, and everything is cached for 2 hours. If data can't load, the map shows no weather rather than sample weather.
- Astronomy math runs in the browser (Astronomy Engine, satellite.js), so sky positions, events and seasons need no outside data.
- Alerts run as a free scheduled GitHub Actions job; personal locations live in a repository secret.

---

## 1. The globe

| Feature | Status | Notes |
|---|---|---|
| 3D globe: drag, zoom, click any spot | ✅ | |
| 72-hour time slider with play button | ✅ | |
| Red night-vision mode | ✅ | |
| Light, dark and automatic themes | ✅ | v2.0 |
| Weather layers for the contiguous US, Alaska and Canada | ✅ | v3.0; coarse grid plus detailed tiles on zoom |
| City labels that scale with zoom; dark-sky parks and observatories marked | ✅ | v3.0 |
| Base maps: simple, OpenStreetMap, topographic, satellite, dark streets, NASA night lights | ✅ | v3.1 |
| "None" weather layer, to read the base map clearly | ✅ | v3.1 |
| Weather opacity slider | ✅ | v3.3; in the layer legend |
| More detailed Canadian coastline | 💡 | Currently a simplified outline |
| Weather layers for the rest of the world | ✅ | v3.4; see section 13 |
| Wind-particle animation like nullschool (jet stream) | 💡 | |

## 2. Weather layers

| Layer | Status | Notes |
|---|---|---|
| Cloud cover, observing score, seeing, transparency, high cloud, jet stream, dew risk | ✅ | Seeing and transparency are Starcast estimates |
| Light pollution | ✅ | v2.0 city-glow model; v3.0 extended to 224 North American cities with atmospheric extinction |
| Aurora (NOAA) | ✅ | v2.0 |
| Forecast confidence: agreement between US, European and Canadian models | ✅ | v3.0; spot forecast strip and alert text |
| Live satellite cloud imagery (GOES) | 💡 | |
| Smoke | 💡 | |
| Light pollution from satellite night-lights data, including small towns | 🔜 | Needed for global coverage; see section 13 |

## 3. Sky over the globe

| Feature | Status | Notes |
|---|---|---|
| Night side, sunlit side, "overhead" points | ✅ | |
| Planet visibility zones and Moon-up zone | ✅ | |
| Aurora oval | ✅ | v2.0 |
| Visibility zones for comets and bright deep-sky objects | 💡 | |

## 4. Locations

| Feature | Status | Notes |
|---|---|---|
| Click the globe to pick a spot | ✅ | |
| Search for a place by name | ✅ | v3.0; Open-Meteo geocoding |
| Type coordinates (decimal, N/S/E/W, or degrees-minutes-seconds) | ✅ | v3.0; in the search box or Saved → Add a location |
| Use my current location | ✅ | v3.0; needs the hosted (https) site |
| Home location that Starcast opens at | ✅ | v3.0 |
| Saved spots with sky darkness (Bortle) | ✅ | |
| Horizon profile per saved spot, entered by hand (8 directions) | ✅ | v3.0; used in scoring, plans and the sky chart |
| Horizon from a phone panorama (compass and tilt sensors) | 💡 | |

## 5. Spot forecast

| Feature | Status | Notes |
|---|---|---|
| Hourly strip: cloud, transparency, seeing, darkness, dew, wind, model agreement, aurora, temperature | ✅ | Model agreement added v3.0 |
| Alert preview message | ✅ | Includes aurora and forecast confidence |
| Where to go: darkest, clearest public land within 30–120 miles | ✅ | v2.0 |
| Driving times and park opening hours for "Where to go" | ✅ | v3.0; OSRM routing, OpenStreetMap hours where listed |
| "Where to go" lists only real named places: state and county parks, forests, natural areas, campgrounds, dark-sky parks | ✅ | v3.1; backup OpenStreetMap servers when the main one is busy |
| Solar observing days (with a solar filter only) | ✅ | |
| Sunspot and solar flare activity | ✅ | v3.3; today's Sun from NASA SDO and NOAA's latest X-ray flare, in Solar observing |

## 6. At the telescope

| Feature | Status | Notes |
|---|---|---|
| Tonight's observing plan: ordered targets with time, direction, height, constellation, eyepiece and filter | ✅ | v3.0 |
| Red "at the eyepiece" view: large red text, one target at a time, keeps the screen awake | ✅ | v3.0 |
| All-sky chart for your location and hour, with tonight's targets, planets and your horizon | ✅ | v3.0; 1,600 stars, all 88 constellations |
| Observing log with conditions, and Messier checklist progress | ✅ | v3.0 |
| Notes on log entries | ✅ | v3.3 |
| Sketches and photos in the log | 💡 | Needs file storage (Supabase Storage once accounts are on) |
| Star-hopping guides to faint targets | 💡 | |

## 7. What's worth seeing

| Feature | Status | Notes |
|---|---|---|
| Per-target scores, best windows, Moon interference, gear notes | ✅ | |
| Catalog: Moon, planets, all 110 Messier objects, Double Cluster, North America Nebula, Albireo, Mizar, Milky Way | ✅ | Full Messier list added v3.0 |
| Filter advice (UHC on emission nebulae) | ✅ | |
| Mars seasons, Saturn ring tilt | ✅ | |
| Moon features along the terminator tonight | ✅ | v3.0; 26 well-known features |
| Jupiter's moons diagram (binocular or reflector orientation) and moons crossing or hidden by Jupiter | ✅ | v3.0 |
| Jupiter: moon shadows crossing the planet | ✅ | v3.3; in the diagram and the tonight text |
| Jupiter: Great Red Spot transit times | 💡 | Needs the Red Spot's current longitude, which drifts |
| 31 showpieces beyond Messier (Veil, Helix, Cat's Eye, Double Cluster, Rosette, Sculptor Galaxy…) | ✅ | v3.3; 146 targets in all |
| Fuller NGC and Caldwell catalog | 💡 | |
| Live Martian weather | 💡 | No reliable free source right now |

## 8. Gear

| Feature | Status | Notes |
|---|---|---|
| Telescope, eyepieces, Barlow, filters, camera | ✅ | |
| Mount type | ✅ | v3.0; manual equatorial preloaded |
| Multiple instrument profiles: telescopes, binoculars, naked eye | ✅ | v3.0; switch in Gear or next to "Worth seeing" |
| Eyepiece advisor: which eyepiece would fill gaps in your range | ✅ | v3.0 |
| Photography: starting exposures for the Moon and planets at prime focus, trailing limits, camera-lens table | ✅ | v3.0 |
| Framing preview: how a target fits the camera frame | ✅ | v3.0 |
| Eyepiece and camera pick-lists | ✅ | v3.3; common eyepiece designs and 10 cameras |
| Explanation of how gear numbers are calculated | ✅ | v3.3; worked examples with your own numbers |
| Framing preview for the Sun, Moon and planets at today's size, with or without the Barlow, with a pixel close-up | ✅ | v3.3 |

## 9. Calendar

| Feature | Status | Notes |
|---|---|---|
| Oppositions, elongations, Moon phases, lunar eclipses, meteor showers, Mars seasons | ✅ | |
| Planet status card (Mars season, Saturn's rings) | ✅ | |
| Lunar occultations of planets, bright stars and the Pleiades, as seen from your spot | ✅ | v3.0 |
| ISS and Tiangong passes (next 3 nights, Forecast tab) | ✅ | v3.0; CelesTrak orbits |
| Solar eclipses as seen from your location (calendar, plus the next one worth seeing) | ✅ | v3.3 |
| Starlink trains and other bright satellites | 💡 | |
| Comets | 💡 | Needs periodic orbit data |

## 10. Alerts

| Feature | Status | Notes |
|---|---|---|
| Afternoon viewing alerts by phone (ntfy) and/or email | ✅ | v2.0 |
| Aurora alerts | ✅ | v2.0 |
| Week-ahead outlook every Monday | ✅ | v3.0 |
| Horizon-aware alerts | ✅ | v3.0; horizon included in copied settings |
| "Clearing later tonight" alerts | 💡 | Needs memory of what was already sent |
| Alert settings edited inside the app without copying to GitHub | 💡 | Needs accounts or a small server |

## 11. Accuracy and learning

| Feature | Status | Notes |
|---|---|---|
| Forecast checks against ClearDarkSky and your own eyes | ✅ | v1.1 |
| First field check: Starcast's cloud, seeing and transparency lined up with ClearDarkSky (Canadian model) over the first nights of use | ✅ | Oct 2026, Wisconsin |
| Tune seeing and transparency estimates from your checks | 🔧 | Keep logging Forecast checks; about 10 nights gives numbers worth quoting |
| Publish a validation summary (agreement with ClearDarkSky and with what was observed) | 💡 | For the portfolio case study |
| Learn which model to trust at your site from the log | 💡 | |

## 12. App and data

| Feature | Status | Notes |
|---|---|---|
| Hosted on GitHub Pages | ✅ | |
| Install on a phone's home screen; app works offline (forecast needs a connection) | ✅ | v3.0 |
| Settings backup and restore by file, to move between devices | ✅ | v3.0 |
| Accounts: sign in with Google, sync saved spots, gear, log and settings across devices | 🔧 | v3.2; Supabase project connected Oct 22, 2026; awaiting first real sign-in test |
| Saved spots stored as PostGIS points with row-level security | ✅ | v3.2; ready for spatial queries |
| Alerts managed inside the app (moved from GitHub secret to Supabase) | 💡 | Next step after accounts |
| Phone app in the app stores | 💡 | |

---

## 13. Global coverage

Asking Open-Meteo for a grid of forecast points from every visitor's browser works for North America, but a global grid would need thousands of points per visit, well past the free limits. So since v3.4 the data is prepared once on a schedule, the way earth.nullschool.net does, and every visitor downloads the same small files.

| Feature | Status | Notes |
|---|---|---|
| Scheduled data pipeline: a GitHub Actions job every 6 hours downloads NOAA GFS global forecasts (total and high cloud, humidity, temperature and dew point, surface and 250/500 hPa winds) for the next 72 hours, every 3 hours | ✅ | v3.4; `pipeline/gfs.py`. Reads only the needed fields by byte range from NOAA's AWS Open Data bucket, with the NOMADS GRIB filter as backup; keeps the published data if NOAA is down |
| Compact files: one gzip file per 3-hour step, 8 channels at one byte per value on a 1° grid, published with the site to GitHub Pages | ✅ | v3.4; deployed by `.github/workflows/site.yml`, never committed, so the git history stays small |
| Seeing and transparency computed worldwide | ✅ | v3.4; in the browser from the GFS fields, same formulas as before |
| Map layers worldwide, with zoomed-in detail kept | ✅ | v3.4; GFS is the base everywhere, Open-Meteo 0.5° detail tiles blend in when zoomed in, now on any land. Falls back to the North American Open-Meteo grid if the files can't load |
| 0.5° worldwide files | 💡 | Four times the download; worth it once files load only for the area in view |
| Global light pollution from NASA Black Marble (VIIRS) night lights instead of the city list | 🔜 | Catches small towns everywhere |
| Wind-particle animation like nullschool, from the same wind data | 💡 | Natural next step once winds are gridded |
| HRRR 3 km data for the US in the pipeline | 💡 | Sharper clouds for the "Where to go" search |

## 14. Portfolio

| Feature | Status | Notes |
|---|---|---|
| Starcast served on krauskagis.com | ✅ | krauskagis.com/Starcast/ |
| Google branding verification through the krauskagis.com domain (Search Console DNS record) | 🔜 | Shows the Starcast name on Google's sign-in screen |
| Embed mode (`?embed`): compact layout for a case-study page, no sign-in (Google blocks sign-in inside embedded frames), an "Open full Starcast" button | 🔜 | |
| Case study page on krauskagis.com, matching the DuctBuilder page | 🔜 | Problem, data, methods, validation, architecture, lessons, what's next |
| Architecture diagram: data sources → pipeline → browser app → Supabase/PostGIS | 💡 | For the case study |

## Version history

- **v3.4 (Oct 23, 2026):** Worldwide weather map from NOAA GFS, prepared every 6 hours by GitHub Actions and published with the site; zoomed-in detail tiles anywhere on land.
- **v3.3 (Oct 22, 2026):** Aurora drawn above the weather layer; weather covers the Arctic islands to 84°N; weather opacity slider. Framing preview gains the Sun, Moon and planets at their real size today, a Barlow option and a pixel close-up; Gear explains how every number is calculated. Eyepiece and camera pick-lists, notes on log entries, 31 more deep-sky showpieces, Jupiter moon shadows, solar eclipses from your location, and "The Sun today".
- **v3.2 (Oct 22, 2026):** Accounts (Google sign-in through Supabase) with cross-device sync and PostGIS saved locations, ready to switch on. Multi-hue colour scales for cloud cover, observing (viridis), seeing and transparency (red to deep blue), dew risk and wind, so middle values read clearly. Detailed weather patches shown only when zoomed in to a region, with wider blended edges.
- **v3.1.4 (Oct 21, 2026):** Fixed twinkling holes in the Observing layer under overcast skies (a rounding overshoot past 100% cloud produced invalid values).
- **v3.1.3 (Oct 21, 2026):** Smoother weather map: finer continental grid (3° × 3.5°), smooth interpolation between points, detailed patches used only when zoomed in and blended in at their edges, so no more blobs or a hard-edged square around your spot.
- **v3.1.2 (Oct 21, 2026):** Aurora layer redrawn to match NOAA's map: the whole oval in NOAA's green-yellow-red probability colors, smoothly interpolated, faded rather than cut off on the daylight side, with a legend saying which NOAA forecast is shown.
- **v3.1.1 (Oct 21, 2026):** The alert job now finishes quietly, instead of failing and emailing you, when alerts haven't been set up yet. Clearer message when the settings secret is pasted incorrectly.
- **v3.1 (Oct 20, 2026):** Fixed live forecasts failing (too many requests for Open-Meteo's free limit) with a request budget and gradual loading; no more sample weather on failure. "Where to go" rebuilt around real named places. Added base maps and a "None" weather layer.
- **v3.0 (Oct 20, 2026):** North America coverage (US, Alaska, Canada); place search, typed coordinates, current location, home spot, horizon profiles; observing plan, red view, sky chart, observing log and Messier checklist; full Messier catalog; gear profiles with binoculars and naked eye, eyepiece advisor, photography helper and framing preview; Jupiter's moons, Moon terminator features, lunar occultations, ISS passes; forecast confidence, driving times, park hours; install as an app, backup and restore; weekly outlook alert.
- **v2.0 (Oct 20, 2026):** Light and dark themes, light-pollution layer and Bortle estimates, aurora, "Where to go," real alerts through GitHub Actions.
- **v1.1 (Oct 20, 2026):** Filters, Mars seasons, Saturn ring tilt, Sun overlay, solar observing, planet status card, forecast checks, feature log.
- **v1 (Oct 20, 2026):** Globe, Wisconsin weather layers, planet visibility, forecast strip, target scoring, alert preview, calendar, gear, saved locations.
