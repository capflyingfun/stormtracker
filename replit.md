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
    - **Alert System**: Personalized, real-time risk alerts based on storm intensity, distance, and lightning. Includes visual storm highlighting, NWS alerts integration with chronological sorting, and an automated threat detection system.
    - **Messaging System**: Built-in, database-driven `message_inbox` for storing and managing storm alerts.
    - **Aviation Weather**: Multi-source METAR data from nearest airports, integrated with AI for comprehensive atmospheric analysis.
    - **Global Timezone System**: Comprehensive timezone detection and conversion.

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