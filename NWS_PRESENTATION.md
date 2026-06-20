# StormTracker — Professional Weather Application
## Presentation for National Weather Service — Mobile, Alabama

### Project Overview
StormTracker is a real-time storm detection and tracking application that blends multiple
authoritative weather data sources into one fast, mobile-first interface. It runs as an
installable Progressive Web App (PWA) — no app store required — and works both in the
United States (high-resolution NEXRAD) and internationally (global RainViewer radar). The
goal is practical public safety: help people see what weather is coming, how strong it is,
when it will arrive, and what official alerts are in effect.

---

### Current Features

#### Radar Integration
- **NEXRAD (US high-resolution)**: Iowa Environmental Mesonet RIDGE tiles for authentic NWS radar.
- **Global coverage**: RainViewer integration for international weather monitoring.
- **Automatic source selection**: Intelligent switching between NEXRAD (US) and RainViewer
  (global) based on the user's location.
- **Pixel-level dBZ sampling**: Radar tiles are decoded pixel-by-pixel and converted to
  reflectivity (dBZ) for precise storm cell placement — the same pipeline runs in the
  browser and on the background scanner.
- **Animation & forecast loops**: Past and nowcast radar playback with adjustable speed.

#### Storm Detection & Tracking
- **Real-time analysis**: Precipitation cells detected directly from radar reflectivity.
- **5-category dBZ classification**: Light, Moderate, Heavy, Intense, and Extreme bands using
  professional meteorological thresholds.
- **Cell tracking & movement**: Frame-by-frame comparison of consecutive scans to derive each
  cell's speed and direction.
- **ETA & impact scoring**: Live arrival countdowns plus a custom impact score based on
  distance, bearing, and cell motion.
- **Marshall–Palmer rainfall rates**: Estimated rain rate (mm/h and in/h) from reflectivity.
- **2.5D / 3D storm view**: Isometric projection with cell heights scaled to reflectivity.
- **Terrain awareness**: Local elevation is considered for channeling/blocking effects.

#### Lightning Indicators (radar-derived)
- **Honest data source**: StormTracker does **not** currently ingest a real-time lightning
  strike network. Lightning indicators are **inferred from radar** — strong convective cores
  (≈48 dBZ and above, flagged as severe at ≈55 dBZ) are marked as likely lightning-producing.
- **Visualization**: Age-based markers on the map and sonar, with distance and bearing.
- **Why this matters**: It is a useful proximity heuristic for convective storms, not a
  ground-truth strike feed — a genuine lightning network (see Collaboration below) would
  replace the inference with measured strikes.

#### NWS Alerts & Official Products (US)
- **Active alerts**: Warnings, watches, and advisories for the user's location from the NWS API.
- **Alert polygons**: Geographic warning bounds drawn directly on the map.
- **Area Forecast Discussion (AFD)**: Parses and surfaces the local forecaster discussion.
- **SPC storm reports**: Tornado, hail, and wind reports from the Storm Prediction Center.
- **NHC tropical tracks**: Real-time hurricane/cyclone cones and paths from the National
  Hurricane Center, with proximity alerting ahead of any local watch.
- **mPING ground truth**: Citizen-reported observations (NOAA/NSSL) overlaid on the map.

#### Background Push Notifications
- **Works in the background**: A scheduled scanner checks each subscriber's location and sends
  push notifications even when the app is closed — including on iOS (installed to home screen).
- **What it covers**: Inbound storm cells, a short-range "rain clock" (when rain starts/stops
  over you), radar-derived lightning proximity, and — in the US — NWS watches/warnings and
  tropical systems.
- **Global by design**: Storm, rain, and lightning alerts use global radar, so they work
  outside the US; NWS government alerts are US-only because that data source is US-only.
- **Respects user settings**: Times follow each user's time zone and 12-hour/24-hour choice;
  thresholds, cadence, and quiet behavior are configurable per user.

#### AI Weather Assistant (optional)
- **Conversational briefing**: Summarizes current conditions, storm ETAs, alerts, and the AFD.
- **Selectable persona**: Professional, Friendly, or Humorous tone, with adjustable detail.
- **Bring-your-own-key**: AI features use the user's own OpenAI key. It is entirely optional —
  without a key, the full app and all notifications still work with clear, built-in wording.

#### Aviation Weather Station (METAR/TAF)
- **Digital console**: Decoded METAR/TAF from nearby stations.
- **Flight category**: VFR / MVFR / IFR / LIFR with the limiting factor (ceiling vs. visibility).
- **Aviation metrics**: Density altitude, pressure altitude, altimeter, cloud base estimate.

#### Personal Weather Dashboard
- **Multi-source blend**: Open-Meteo (GFS + HRRR), NWS API, and AWC METAR, prioritizing the
  most accurate local source.
- **Forecasts & trends**: 72-hour hourly, 7-day daily, and 48-hour trend charts (temp,
  pressure, wind, visibility).
- **Derived meteorology**: Cloud base, fog risk, atmospheric stability, surface inversion, and
  barometric pressure tendency.

#### Wind, Sonar & Customization
- **Five wind gauge styles**: Neon, Marine, Minimal, G1000 (glass-cockpit), and Speedometer,
  with Beaufort scale, gust tracking, and min/max.
- **Radar sonar**: Circular radial-sweep mini-map showing storms as blips relative to the user.
- **Units & time**: Auto/Imperial/Metric/Custom unit presets; Auto/12-hour/24-hour time.
- **Multilingual**: UI translation for 20+ languages with auto-detection and RTL support.

---

### Technical Architecture
- **Frontend**: Vanilla HTML/CSS/JavaScript Progressive Web App (no build step), served as a
  static site on **GitHub Pages**. Installable with offline service-worker caching.
- **Mapping**: Leaflet.js for professional cartographic visualization.
- **Backend services**: A **Cloudflare Worker** (with D1/SQLite) handles push subscriptions,
  notification delivery, settings sync, and a CORS-safe proxy for select data sources.
- **Background scanning**: A scheduled **GitHub Actions** job runs the storm scanner, which
  mirrors the browser's radar pipeline to detect storms and trigger push alerts server-side.
- **Data handling**: Most logic runs client-side, calling official weather APIs directly; user
  preferences are stored locally on the device (no central account required).

> Note: An earlier prototype used React/TypeScript with an Express + PostgreSQL backend. The
> live application has since moved to the lightweight static-PWA architecture described above
> for speed, reliability, and zero-maintenance hosting.

---

### Educational & Public Safety Value
- **Storm awareness**: Helps users understand storm intensity, movement, and timing.
- **Weather education**: Visual, plain-language representation of meteorological concepts.
- **Public safety**: Real-time tracking and background alerts for emergency preparedness.
- **Data literacy**: Helps the public interpret official weather products (NWS alerts, AFD, METAR).

---

### Potential NWS Collaboration Opportunities

#### Data Integration
- **Ground-truth lightning**: Integrate a measured lightning source (e.g., NLDN or GOES GLM) to
  replace the current radar-derived inference with real strike data.
- **Enhanced NEXRAD access**: Higher-resolution or lower-latency radar products.
- **Deeper alert integration**: Tighter coupling with NWS warning/watch and impact-based
  decision-support products.
- **Forecast guidance**: Incorporate additional NWS forecast models and guidance.

#### Educational Partnership
- **Public outreach**: Support NWS education and awareness missions.
- **Weather safety**: Promote understanding of severe weather risks.
- **Emergency preparedness**: Support community storm-preparedness efforts.

#### Technical Benefits for NWS
- **Public engagement**: A modern, installable interface for weather-data visualization.
- **Accessibility**: Makes professional weather data approachable for the general public.
- **Community partnership**: Strengthens ties between the NWS and local communities.

---

### Proposed Next Steps
1. **Demo session**: Present current capabilities to NWS meteorologists.
2. **Lightning data**: Discuss specifications for integrating ground-truth lightning (NLDN/GLM).
3. **Partnership framework**: Explore formal collaboration opportunities.
4. **Public safety focus**: Align features with the NWS public-safety mission.
5. **Educational integration**: Support NWS community outreach and education goals.

---

*StormTracker represents a modern approach to weather-data visualization, combining authentic
meteorological data with a fast, user-friendly interface to promote weather awareness and
public safety.*
