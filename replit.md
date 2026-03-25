# StormTracker - Real-Time Storm Detection Application

## Overview

StormTracker is a real-time storm detection web application providing live weather radar maps, storm tracking, and weather alerts. It utilizes GPS or manual location input to monitor storm activity within a customizable radius, enhanced with AI-powered weather analysis integrating National Weather Service Area Forecast Discussions for comprehensive meteorological assessments. The project aims to deliver a professional, reliable, and user-friendly tool for anticipating and reacting to severe weather.

## User Preferences

Preferred communication style: Simple, everyday language with customizable AI assistant tone options (Professional, Friendly, Humorous) similar to Carrot Weather app for personalized user experience.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui and Radix UI
- **State Management**: React Query
- **Routing**: Wouter
- **Build Tool**: Vite
- **UI/UX**: Mobile-first, responsive design with interactive Leaflet-based maps, real-time storm tracking panels, and an intuitive alert system. Features include a sonar-style radar display, 3D storm visualization with height-based cloud rendering, and a comprehensive view mode toggle. UI emphasizes clean design and accessibility with professional meteorological color schemes and animations for visual feedback.
- **Multilingual Support**: 20 languages (en, es, fr, de, it, pt, nl, pl, ru, tr, ar, hi, id, ms, th, vi, ja, ko, zh, sw) via `client/src/lib/i18n.ts` translation system and `client/src/hooks/use-language.tsx` React context. Language selector in header with flag + native name dropdown. RTL support for Arabic. Browser language auto-detection with localStorage persistence. Key UI labels translated across header, weather dashboard, AI assistant, and storm tracker components. **Auto-Translation System**: `client/src/hooks/use-auto-translate.tsx` provides `useAutoTranslate()` hook with `at()` function for dynamic OpenAI-powered translation of any UI string. Backend endpoint `POST /api/translate` accepts `{texts[], lang}` and returns translations via GPT-4o-mini with server-side in-memory cache (5000 entries) and client-side localStorage cache. Batches requests (200ms debounce, 80 texts/chunk). Used extensively in Weather Station console and sub-components (WindCompass, FlightCategoryBanner, TrendGraphs, PressureTendencyChart, WindDirectionChart, ConditionTimeline, ForecastIconStrip, AlertTicker, MetarDecoder).

### Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL with Drizzle ORM (Neon Database for serverless)
- **Session Management**: `connect-pg-simple`
- **Build Tool**: esbuild
- **Core Features**:
    - **Location Services**: GPS detection and OpenWeather geocoding for manual search.
    - **Weather Data Integration**: OpenWeather API for primary data, RainViewer (global) and NEXRAD (US) for radar, and government weather services for alerts.
    - **Storm Detection System**: Multi-source data integration, sector-based search, direct pixel sampling, and intelligent clustering for precipitation waypoints. Features dynamic adaptive sampling and 5-category dBZ classification.
    - **Storm Tracking**: Frame-by-frame radar comparison for movement calculation, directional SVG arrows, and 30° storm movement cones with ETA impact assessment.
    - **AI Weather Assistant**: OpenAI GPT-4o integration for risk assessment, comprehensive weather analysis (including wind shear, thunderstorm formation, NWS AFD), and an integrated chat. Features dynamic tone adjustment based on weather severity and unit preference integration.
    - **Lightning Detection**: Radar-derived lightning indicators (⚡ emoji overlaid on storm cells ≥40 dBZ with randomized ×N strike counts scaling with intensity). Renders on all three views (map, sonar, 3D). Toggle to show/hide. Disclaimer: "Radar-derived, not observed." AccuWeather Lightning API endpoint available but requires enterprise plan for real strike data.
    - **Alert System**: Personalized, real-time risk alerts based on storm intensity, distance, and lightning. Includes visual storm highlighting, NWS alerts integration with chronological sorting and AI-powered translation for non-English languages (via GPT-4o-mini), and an automated threat detection system. Features impact threshold filter (0-85% adjustable in unified Settings modal, localStorage-persisted, 5% minimum floor), color-coded alert borders (red 75%+, orange 50%+, amber 25%+, purple for extreme dBZ), and live countdown timers (⏱️ ETA in hh:mm:ss format) for approaching storms. Single unified settings panel accessed via header gear icon combines units toggle, impact threshold, storm intensity, alert radius/frequency, and notification preferences.
    - **Storm Feedback System**: Self-correcting prediction system. When countdown timers reach 0, the app auto-rechecks storm data, then asks users "Did this storm affect your area?" with Yes/No/Unsure buttons. Feedback stored in `storm_feedback` table with prediction accuracy tracking. API: POST `/api/storm-feedback`, GET `/api/storm-feedback/stats`.
    - **Messaging System**: Built-in, database-driven `message_inbox` for storing and managing storm alerts.
    - **Aviation Weather**: Multi-source METAR data from nearest airports, integrated with AI for comprehensive atmospheric analysis.
    - **Weather Station (PWS Console)**: Dedicated "Station" tab with real-time METAR data from AWC (Aviation Weather Center). Features wind compass with animated direction arrow, temperature/dew point/feels-like display, circular gauges (humidity, visibility, UV), barometric pressure with trend indicator, precipitation accumulation (tappable in/mm/cm), cloud cover layers, moon phase, forecast trend icon strip, scrolling alert ticker, and station selector with ICAO search and favorites persistence. **Tappable unit cycling**: tap any value to switch units — Temperature (°F/°C), Wind (mph/kts/km∕h/m∕s/Beaufort with separate gust Beaufort), Pressure (inHg 2-decimal/mb/mmHg/kPa), Visibility (mi/km/m/NM), Precipitation (in/mm/cm). Dual units always shown (primary + secondary). **METAR Decoder**: automatic human-readable breakdown of raw METAR with color-coded severity for lightning ⚡, thunderstorms, hail, squalls. Includes direction/distance parsing for lightning reports. Beaufort wind scale with descriptive names. **Flight Category Banner**: Color-coded VFR (green)/MVFR (blue)/IFR (red)/LIFR (magenta) indicator with pulsing dot for non-VFR conditions. **24-Hour History & Trends**: 24h of METAR observations (typically 30-40 data points) with SVG sparkline charts for temperature (with feels-like overlay), pressure, wind speed, and visibility. **Pressure Tendency Chart**: Dedicated area chart with gradient fill showing 24h barometric pressure trend with rising/falling/steady label and mb change. **Wind Rose**: Polar chart showing 16-direction wind distribution over 24h with speed-colored petals (green <10, orange 10-20, red 20+ mph). **Condition Timeline**: Color-coded horizontal strip showing weather conditions over 24h (clear/cloudy/rain/snow/fog/thunderstorm) with hover tooltips and percentage breakdown. **Tappable Charts**: All charts (trends, pressure, condition timeline, wind direction) support tap-to-inspect — tapping shows exact value, time (in user's local timezone with minutes), and gust data where applicable. Min (▼) and max (▲) indicators shown on each chart with colored dot markers. **Multi-Station TAFs**: "📡 X stations" button reveals nearby station TAFs (up to 8 within ~70mi radius) — tap any station to load its TAF forecast. **Wind Direction Chart**: Scatter-style timeline chart showing 24h wind direction history with speed-colored dots (size scales with speed). Includes "Predominant Directions" breakdown with percentage bars. Replaces polar wind rose for better readability. API: `/api/nearby-stations`, `/api/station-data/:icao` (returns `history[]` with 24h observations, `fltCat`), `/api/nearby-tafs` (nearby stations with TAF), `/api/favorite-stations` (CRUD). Component: `client/src/components/weather-station-console.tsx`. Favorites stored in `favorite_stations` DB table.
    - **Global Timezone System**: Comprehensive timezone detection and conversion.
    - **Location Management System**: Three-tier location control: 📍 Home (stored initial GPS/search location, persisted in localStorage), 🔍 Scan Here (temporary map-center scan without page reload via `setLocationSoft`), and 🔦 HD Scan (deep scan dialog offering home/map-center/current-map-center with zoom level 12 for ~15mi detailed radar analysis). Map crosshair overlay always visible showing exact center point for scan targeting. Home location auto-initializes from first GPS or search location.

### Key Architectural Decisions
- **Monorepo Structure**: Shared types and schemas between frontend and backend.
- **Real-time Updates**: React Query with refetch intervals.
- **Performance**: Optimized map rendering, adaptive intelligent sampling, and optimized API timeouts.
- **Reliability**: Server-side proxy for external APIs, multi-source data integration with fallback strategies, and robust error handling.
- **Scalability**: Designed for global coverage with support for high volumes of storm data and international weather sources.

## External Dependencies

### APIs
- **OpenWeather API**: Weather data, geocoding, radar information.
- **RainViewer API**: Global weather radar tiles.
- **NEXRAD (Iowa Mesonet RIDGE API)**: US high-resolution radar data.
- **Government Weather Services / NWS API**: Weather alerts and warnings, Area Forecast Discussions.
- **Iowa Environmental Mesonet (IEM) mPING GeoJSON**: Crowdsourced weather reports from NOAA/NSSL mPING citizen science project, filtered by map bounds and last 3 hours.
- **USGS Earthquake API**: Real-time earthquake data (GeoJSON feed, M2.5+ in last 24h, filtered within 500mi radius).
- **NIFC Wildfire API**: Active fire perimeters via ArcGIS REST service (WFIGS Interagency Perimeters).
- **US Drought Monitor API**: State-level drought statistics by category (D0-D4) from USDM/UNL.
- **Open-Meteo API**: Current and forecasted upper atmospheric winds, atmospheric stability parameters.
- **OpenAI GPT-4o API**: AI weather assistant and chat functionality.
- **AccuWeather API**: MinuteCast™ minute-by-minute precipitation, current conditions, 5-day/12-hour forecasts, lightning endpoint (enterprise only). Free trial: 500 core + 50 MinuteCast + 50 lightning calls/day for 14 days.
- **CheckWX API**: International METAR/TAF data.
- **WeatherAPI.com**: Secondary weather data provider for forecasts, air quality, UV data, etc.

### Libraries
- **React**: Frontend framework.
- **Tailwind CSS**: Styling.
- **shadcn/ui, Radix UI**: UI component libraries.
- **React Query (@tanstack/react-query)**: Server state management.
- **Wouter**: Client-side routing.
- **Leaflet**: Interactive mapping library.
- **Drizzle ORM**: Type-safe database operations.
- **Zod**: Runtime schema validation.
- **@react-three/fiber, @react-three/drei**: 3D visualization.
- **Sharp**: Image processing for radar tile parsing.
- **connect-pg-simple**: PostgreSQL session store.

### Databases
- **PostgreSQL**: Primary database.
- **Neon Database**: Serverless PostgreSQL provider.