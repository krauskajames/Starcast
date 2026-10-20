# Starcast feature log

An astronomy viewing-conditions globe: earth.nullschool-style weather on a globe, ClearDarkSky-style forecasts, Stellarium-style sky knowledge, tuned to your own gear and interests.

Last updated: October 20, 2026 · Current version: v2.0

**Status key:** ✅ Done · 🔧 In progress · 🔜 Next up · 💡 Planned for later

---

## Decisions so far

- Web app that runs in any browser first; a phone app maybe later.
- Single user for now; built so accounts can be added later.
- Weather map layers cover Wisconsin first; spot forecasts work anywhere.
- Weather data: Open-Meteo (free for non-commercial use), which blends NOAA's HRRR and GFS models for the US. Haze from Copernicus (CAMS) aerosol forecasts.
- Astronomy math runs in the browser (Astronomy Engine library), so sky positions, events and seasons need no outside data.

---

## 1. The globe

| Feature | Status | Notes |
|---|---|---|
| 3D globe: drag to rotate, scroll or pinch to zoom, click any spot | ✅ | |
| Wisconsin outline, cities, Newport State Park (Dark Sky Park), Yerkes Observatory | ✅ | |
| 72-hour time slider with play button | ✅ | Bar is shaded by darkness and cloud at the selected spot |
| Red night-vision mode | ✅ | |
| Light, dark and automatic themes | ✅ | Added v2.0 |
| Weather layers for the whole globe | 💡 | Needs a server to pre-process global model data |
| Wind-particle animation like nullschool (jet stream) | 💡 | |

## 2. Weather layers (Wisconsin)

| Layer | Status | Notes |
|---|---|---|
| Cloud cover | ✅ | |
| Observing score (clear + dark + steady + transparent) | ✅ | |
| Seeing (estimated) | ✅ | From jet-stream and surface winds; being checked against ClearDarkSky |
| Transparency (estimated) | ✅ | From high cloud, humidity and aerosols; being checked against ClearDarkSky |
| High cloud | ✅ | |
| Jet stream (250 hPa wind) | ✅ | |
| Dew risk (temperature vs dew point) | ✅ | |
| Light pollution | ✅ | Added v2.0; city-glow model (Walker's law) over 48 Upper Midwest cities |
| Light pollution from satellite night-lights data | 💡 | Would refine the city-glow model |
| Aurora forecast (NOAA) | ✅ | Added v2.0; globe layer, Kp row in the forecast strip, aurora line in alerts |
| Forecast confidence (agreement between HRRR, GFS and ECMWF) | 💡 | |
| Smoke | 💡 | |

## 3. Sky over the globe

| Feature | Status | Notes |
|---|---|---|
| Night side and twilight shading | ✅ | |
| Sunlit side and "Sun overhead" point | ✅ | Added v1.1 |
| Planet visibility zones: Mercury, Venus, Mars, Jupiter, Saturn | ✅ | Where each is up while the sky is dark enough |
| Moon-up zone | ✅ | |
| Aurora oval: NOAA OVATION for the next hour, Kp forecast beyond | ✅ | Added v2.0 |
| "Planet overhead" points | ✅ | |
| Visibility zones for comets and bright deep-sky objects | 💡 | |

## 4. Spot forecast (click a location)

| Feature | Status | Notes |
|---|---|---|
| ClearDarkSky-style 72-hour strip: cloud, transparency, seeing, darkness, dew risk, wind, temperature | ✅ | Tap a column to move the globe to that hour |
| Snapshot cards for the selected hour | ✅ | |
| Alert preview message ("Viewing conditions are great from 9–11 pm at My Backyard for viewing the rings of Saturn") | ✅ | Real delivery is in section 8 |
| Works outside Wisconsin (spot forecast only) | ✅ | |
| Aurora chance per hour for your latitude | ✅ | Added v2.0 |
| "Where to go": darkest, clearest public parks and forests within 30–120 miles, with directions | ✅ | Added v2.0; OpenStreetMap park data |
| Driving times and park opening hours | 💡 | Currently straight-line distance plus a reminder to check hours |
| Solar observing days and clear spells | ✅ | Added v1.1; only with a solar filter in your gear, otherwise a safety warning |
| Sunspot and solar activity information | 💡 | |

## 5. What's worth seeing

| Feature | Status | Notes |
|---|---|---|
| Per-target score 0–100 per hour, per night | ✅ | Combines altitude, darkness, moonlight, clouds, seeing or transparency, gear, and how rewarding the target is |
| Best viewing window and peak altitude per target | ✅ | |
| Moon interference (phase, altitude, distance from target) | ✅ | |
| "What it will look like" notes for your gear | ✅ | e.g. apparent size at 135×, Cassini Division, Galilean moons |
| Catalog: Moon, 7 planets, 31 deep-sky showpieces, 2 double stars, Milky Way | ✅ | |
| Filter advice (use your UHC on emission nebulae, leave it off for galaxies) | ✅ | Added v1.1 |
| Mars seasons in the Mars notes (Mars Year, Ls, polar caps) | ✅ | Added v1.1 |
| Saturn ring tilt in the Saturn notes | ✅ | Added v1.1 |
| Live Martian weather | 💡 | No reliable free source right now; season and dust-storm risk are shown instead |
| Larger catalog (all Messier, best NGC/Caldwell objects) | 💡 | |
| Jupiter: Great Red Spot transit times, moon shadows and eclipses | 💡 | |

## 6. Your gear and interests

| Feature | Status | Notes |
|---|---|---|
| Telescope, eyepieces, Barlow | ✅ | Barska AE10758, K20 Kellner, 3× Barlow preloaded |
| Derived stats: powers, fields of view, exit pupil, faintest star, resolution | ✅ | |
| Camera at prime focus: field of view, image scale | ✅ | Canon EOS Rebel T3 preloaded |
| Filters (UHC, OIII, H-beta, light pollution, Moon, solar, color) | ✅ | Added v1.1; UHC preloaded |
| Interests: naked eye, planets, Moon, deep sky, doubles, meteors, astrophotography, solar | ✅ | Solar added v1.1 |
| Sky darkness (Bortle class) per saved location | ✅ | |
| Estimated Bortle class for any spot in the Upper Midwest | ✅ | Added v2.0 |
| Binoculars as a separate instrument | 💡 | |
| Multiple telescope profiles | 💡 | |

## 7. Calendar

| Feature | Status | Notes |
|---|---|---|
| 12 months of events: full and new Moons, oppositions, greatest elongations, lunar eclipses, meteor showers | ✅ | Meteor showers include radiant height and moonlight |
| Events inside the 72-hour window show the cloud forecast | ✅ | |
| Mars seasons and dust-storm season events | ✅ | Added v1.1 |
| Planet status card: Mars season, Saturn ring tilt | ✅ | Added v1.1 |
| Solar eclipses, lunar occultations of planets and bright stars | 💡 | |
| ISS and bright satellite passes | 💡 | |
| Comets | 💡 | Needs periodic data updates |

## 8. Saved locations and alerts

| Feature | Status | Notes |
|---|---|---|
| Save locations with names and sky darkness | ✅ | Stored in the browser on one device |
| Email or phone alerts for saved locations | ✅ | Added v2.0; GitHub Actions job, phone push via ntfy and/or email. One-time setup in README |
| Aurora alerts | ✅ | Added v2.0; evening check |
| Alert settings edited inside the app without copying to GitHub | 💡 | Needs accounts or a small server |
| "Best clear, dark public land within driving range" | ✅ | Added v2.0; see section 4 |
| Sync saved spots and gear across devices (accounts) | 💡 | |

## 9. Horizon and site

| Feature | Status | Notes |
|---|---|---|
| Horizon profile per saved site, sketched by hand | 💡 | "Saturn clears your trees at 9:40 pm" |
| Horizon from a phone panorama (compass and tilt sensors) | 💡 | |

## 10. Accuracy and learning

| Feature | Status | Notes |
|---|---|---|
| Forecast checks: record ClearDarkSky and what you saw, compare with Starcast | ✅ | Added v1.1; in the Saved tab, with bias summary and copy-out |
| Tune seeing and transparency estimates from your checks | 🔧 | After about 10 nights of checks |
| Observing log that learns which model to trust at your site | 💡 | |

## 11. Hosting and platform

| Feature | Status | Notes |
|---|---|---|
| Single-file web app | ✅ | |
| Free web hosting with a link that works on your phone | 🔜 | Ready for GitHub Pages; steps in README |
| Installable on a phone home screen (web app) | 💡 | |
| Phone app | 💡 | |

---

## Version history

- **v2.0 (Oct 20, 2026):** Light and dark themes, light-pollution layer and Bortle estimates, aurora layer and forecasts, "Where to go" for dark public land, real alerts by phone or email through GitHub Actions.
- **v1.1 (Oct 20, 2026):** Filters with UHC advice, Mars seasons and dust-storm season, Saturn ring tilt, Sun overlay, solar observing interest and forecasts, planet status card, forecast-check log, this feature log.
- **v1 (Oct 20, 2026):** Globe, Wisconsin weather layers, planet visibility, spot forecast strip, target scoring, alert preview, calendar, gear, saved locations.
