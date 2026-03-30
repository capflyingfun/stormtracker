# StormTracker v3.50 — Feature Reference

## Weather Dashboard
- **Multi-source blending**: Combines Open-Meteo (GFS + HRRR), NWS API, and AWC METAR data, prioritizing the most accurate local source
- **Hero card**: Current temperature with "feels like", humidity, cloud cover, pressure (with trend arrow), precipitation, dew point, UV index, and freezing level
- **72-hour hourly forecast** and **7-day daily forecast** with NWS detailed text descriptions
- **48-hour trend charts**: Temperature, pressure, wind, and visibility plotted over time
- **Cloud base estimation**: Calculated from temperature–dewpoint spread (spread × 400 ft AGL)
- **Fog risk assessment**: Analyzes spread, wind speed, time of day, and cloud cover to rate radiation/advection fog probability
- **Atmospheric stability**: Rates conditions from Stable → Conditionally Unstable → Unstable based on temperature, humidity, and spread
- **Surface inversion detection**: Flags trapped pollutant / fog conditions from calm, clear overnight setups
- **Barometric pressure trend**: Shows rising/falling/steady with arrow indicators

## Radar Map
- **Dual-source radar**: Toggle between NEXRAD (US high-res) and RainViewer (global coverage)
- **Radar animation**: Playback controls for past and forecast radar loops with adjustable speed
- **Storm zone polygons**: Color-coded precipitation areas rendered as map overlays
- **ILS approach cone**: Animated inbound storm path visualization
- **NHC tropical tracks**: Real-time hurricane and cyclone paths from the National Hurricane Center
- **NWS alert polygons**: Geographic bounds of active weather warnings drawn on the map
- **mPING ground-truth reports**: Citizen-reported real-time weather observations (NOAA/NSSL)
- **HD Scan**: 15-mile high-resolution localized radar analysis at zoom 12
- **Scan Here**: Relocate scan center to current map view center
- **Map controls**: Zoom, recenter, toggle radar source, distance unit toggle (MI/KM)

## Storm Detection & Tracking
- **Automated radar scanning**: Periodic NEXRAD or RainViewer tile analysis to detect precipitation cells
- **Storm cell cards**: Each detected cell shows intensity (dBZ), distance, bearing, speed, and direction
- **Impact score (%)**: Custom algorithm estimating threat level based on distance, bearing, and cell movement
- **ETA countdown**: Live-updating arrival timers for approaching storms
- **Cell tracking**: Compares consecutive scans to determine individual cell velocity
- **Terrain interaction**: Analyzes local elevation (valleys/ridges) to predict channeling or blocking effects
- **2.5D/3D storm view**: Isometric projection with heights corresponding to radar reflectivity
- **Storm alerts**: Browser notifications for approaching cells with configurable thresholds

## Radar Sonar
- **Circular mini-map**: Radial sweep display showing storms as blips relative to user position
- **Configurable settings**: Sweep speed, fade duration, always-on mode, dot opacity, glow intensity, grid brightness, dBZ floor
- **Dot size by dBZ class**: Adjustable scaling for Light, Moderate, Heavy, Intense, and Extreme returns
- **Overlays**: Storm arrows, aloft wind indicator, lightning markers (≥ 48 dBZ)
- **Zoom levels**: 15 / 20 / 30 / 40 / 50 / 60 / 70 / 80 mile radius

## Wind Gauges
- **Five selectable gauge styles**:
  - **Neon**: Glowing cyan/orange segmented arc with wind direction pointer
  - **Marine**: Nautical-style compass with LED readouts (PORT/STBD labels)
  - **Minimal**: Clean arc gauge with gradient color
  - **G1000**: Garmin glass-cockpit inspired aviation display
  - **Speedometer**: Classic analog speedometer design
- **Wind simulation**: Real-time animated wind speed/direction updates
- **Beaufort scale bar**: Color-coded force indicator (F0–F12) with label
- **Min/max tracking**: Session minimum and maximum wind speed display
- **Gust tracking**: Separate gust display with configurable gust window (30s / 60s / 2m / 5m)
- **Trend arrow**: Rising/falling/steady wind speed indicator

## Station / METAR (Aviation Weather)
- **Digital weather console**: Dedicated tab mimicking a professional weather station
- **Raw METAR decode**: Parses and displays decoded observation data
- **Flight category badge**: VFR / MVFR / IFR / LIFR with color coding and limiting factor
- **Cloud base card**: Shows estimated cloud base (spread × 400 ft) with comparison arrow vs. METAR-reported ceiling — green ↑ if reported ≥ estimated, red ↓ if reported < estimated
- **Aviation metrics**: Density altitude, pressure altitude, altimeter setting
- **Tappable unit cycling**: Tap any value to cycle through all supported units
- **Nearby station list**: Shows closest METAR stations with distance

## Alerts & Notifications
- **NWS weather alerts**: Active warnings, watches, and advisories for current location (US only)
- **SPC storm reports**: Tornado, hail, and wind reports from the Storm Prediction Center
- **Threat ticker**: Scrolling header bar that changes color (green → yellow → orange → red) based on immediate local threat level
- **Configurable ticker speed**: Adjustable from 50% to 200% in settings
- **Browser push notifications**: Alerts for NWS warnings and storm cell approaches (works in background)
- **Custom threshold alerts**: User-defined triggers for wind speed, temperature, or storm intensity
- **Hazards section**: Local NWS hazard outlook

## AI Weather Assistant
- **Chat interface**: AI-powered meteorological briefing using all current app data (METAR, storm ETAs, alerts, AFD)
- **Customizable persona**: Set tone to Professional, Friendly, or Humorous
- **Detail level control**: Adjustable verbosity for AI responses
- **Area Forecast Discussion (AFD)**: Parses technical NWS forecaster discussions

## Location & Navigation
- **GPS location**: Browser geolocation with accuracy display and altitude capture
- **Location search**: Smart address picker with autocomplete (Nominatim → Photon → Open-Meteo fallback)
- **Map pick**: Full-screen map with crosshair for precise location selection
- **Favorites**: Save up to 5 locations with rename support
- **Home location**: One-tap return to saved home position
- **Travel mode**: Live GPS tracking that auto-refreshes weather and radar as the user moves
- **Auto unit detection**: Switches between Imperial (US) and Metric based on detected country

## Settings & Customization
- **Unit system**: Auto / Imperial / Metric / Custom presets with individual unit overrides for temperature (°F/°C), wind (mph/kts/km/h/m/s), pressure (inHg/mb/mmHg/kPa), visibility (mi/km), and precipitation (in/mm/cm)
- **Time format**: Auto / 12-hour / 24-hour
- **Gauge style selector**: Choose from 5 wind gauge designs
- **Wind simulation controls**: Adjustable update interval (5–30s), gust window, averaging window
- **Sonar settings**: Full configuration panel (see Radar Sonar section)
- **Neon weather icons**: Animated SVG/video weather icons
- **Scan radius**: Configurable storm detection radius
- **Radar metric toggle**: MI/KM distance display on radar
- **Desktop layout**: Responsive sidebar navigation, scaled-up text and controls on screens ≥ 1024px

## Platform & Infrastructure
- **Static site on GitHub Pages**: All files served from `docs/` directory
- **Cloudflare Worker API**: Backend proxy at `stormtracker.joshua-622.workers.dev`
- **Service worker**: Offline caching with versioned cache (`stormtracker-v350`)
- **Multi-language support**: UI translation for 30+ languages via integrated translation engine
- **Progressive Web App**: Installable with manifest and icons
- **No server-side storage**: All user preferences stored in localStorage
