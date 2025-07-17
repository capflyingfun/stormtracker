# StormTracker - Real-Time Storm Detection Application

## Overview

StormTracker is a real-time storm detection web application built with React, Express, and TypeScript. It provides users with live weather radar maps, storm tracking, and weather alerts based on their location. The application uses GPS location detection or manual location search to monitor storm activity within a customizable radius.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui component library
- **State Management**: React Query (@tanstack/react-query) for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Build Tool**: Vite for fast development and optimized builds
- **UI Components**: Radix UI primitives with custom styling

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **Database**: PostgreSQL with Drizzle ORM
- **Database Provider**: Neon Database (@neondatabase/serverless)
- **Session Management**: PostgreSQL session store (connect-pg-simple)
- **Build Tool**: esbuild for server bundling

### Project Structure
```
├── client/          # React frontend
│   ├── src/
│   │   ├── components/  # UI components
│   │   ├── pages/       # Route components
│   │   ├── hooks/       # Custom React hooks
│   │   └── lib/         # Utility functions
├── server/          # Express backend
├── shared/          # Shared types and schemas
└── migrations/      # Database migrations
```

## Key Components

### Location Services
- **GPS Detection**: Browser geolocation API for automatic location detection
- **Location Search**: OpenWeather geocoding API for manual location input
- **Reverse Geocoding**: Converting coordinates to human-readable addresses

### Weather Data Integration
- **OpenWeather API**: Primary weather data provider
- **Radar Data**: Live weather radar overlays using Leaflet maps
- **Storm Detection**: Real-time storm cell identification and tracking
- **Weather Alerts**: Government weather alerts and warnings

### User Interface
- **Interactive Map**: Leaflet-based map with radar overlays and storm markers
- **Storm Tracking Panels**: Real-time storm information with distance and intensity
- **Alert System**: Weather alert notifications with severity levels
- **Settings Panel**: Unit preferences (metric/imperial) and radar range controls

### Database Schema
- **Users**: User authentication and preferences
- **Locations**: Stored location data with GPS/search source tracking
- **Storms**: Storm event data with intensity, direction, and speed
- **Weather Alerts**: Weather alert storage with severity and expiration

## Data Flow

1. **Location Setup**: User provides location via GPS or search
2. **Weather Data Fetching**: Backend queries OpenWeather API for current conditions
3. **Storm Detection**: Real-time processing of radar data to identify storm cells
4. **Alert Processing**: Continuous monitoring for weather alerts in the user's area
5. **Map Rendering**: Frontend displays interactive map with radar overlays and storm markers
6. **Auto-refresh**: Periodic updates every 5 minutes when tracking is active

## External Dependencies

### APIs
- **OpenWeather API**: Weather data, geocoding, and radar information
- **Government Weather Services**: Weather alerts and warnings

### Libraries
- **Leaflet**: Interactive mapping library
- **React Query**: Server state management and caching
- **Drizzle ORM**: Type-safe database operations
- **Zod**: Runtime schema validation
- **Radix UI**: Accessible UI component primitives

### Development Tools
- **Vite**: Frontend build tool with HMR
- **ESBuild**: Server bundling for production
- **TypeScript**: Type safety across the entire stack
- **Tailwind CSS**: Utility-first CSS framework

## Deployment Strategy

### Development
- **Dev Server**: Vite development server with Express API proxy
- **Database**: Neon Database for development and production
- **Environment**: NODE_ENV=development with hot reloading

### Production
- **Build Process**: 
  1. Vite builds optimized React bundle
  2. ESBuild bundles server code
  3. Static files served from dist/public
- **Database**: PostgreSQL via Neon Database with connection pooling
- **Process**: Single Node.js process serving both API and static files

### Environment Variables
- `DATABASE_URL`: PostgreSQL connection string
- `OPENWEATHER_API_KEY`: OpenWeather API key (defaults to provided key)
- `NODE_ENV`: Environment mode (development/production)

### Key Architectural Decisions

1. **Monorepo Structure**: Shared types and schemas between frontend and backend for type safety
2. **Real-time Updates**: React Query with refetch intervals for live data updates
3. **Responsive Design**: Mobile-first approach with Tailwind CSS
4. **Error Handling**: Comprehensive error boundaries and API error handling
5. **Performance**: Optimized map rendering with conditional layer loading
6. **Accessibility**: Radix UI components ensure WCAG compliance

## Recent Changes - July 17, 2025

### Enhanced Location Search
- **Fixed ZIP Code Support**: Added dedicated ZIP code API endpoint for US postal codes (10001, 90210, etc.)
- **Improved Geocoding**: Better handling of multiple location formats (city names, addresses, zip codes)
- **Error Handling**: Enhanced error handling for failed geocoding attempts

### Interactive Radar Map Improvements
- **RainViewer Integration**: Replaced complex radar simulation with proven RainViewer API for authentic global radar data
- **Real-time Radar Frames**: Implemented animated radar loops using RainViewer's past frame data
- **Authentic Precipitation Data**: Direct access to actual radar reflectivity data instead of simulated patterns
- **Global Coverage**: RainViewer provides worldwide radar coverage with consistent data quality
- **NEXRAD Fallback**: Maintains Iowa Environmental Mesonet as backup when RainViewer is unavailable

### Advanced Storm Detection System
- **RainViewer Data Integration**: Storm detection now analyzes real precipitation patterns from RainViewer API
- **Sector-Based Search**: Maintained 6 distance rings (every 5 miles) and 12 angular sectors (every 30°)
- **Reduced False Positives**: Significantly cleaner detection results matching actual radar patterns
- **Authentic Storm Patterns**: Detection based on real weather systems instead of simulated data
- **Storm Consolidation**: Intelligent grouping of nearby detections to prevent duplicates while preserving intensity data
- **Directional Precision**: Storm positions calculated using proper bearing calculations for accurate directional information

### Blitzortung-Style Interface Design
- **Real-time Storm Detection**: Clean, minimal interface inspired by Blitzortung lightning tracker
- **Sector Grid Visualization**: Optional overlay showing the 6-ring × 12-sector detection grid
- **Storm Counter Display**: Live count of detected storms with range information
- **Sector Highlighting**: Active precipitation sectors highlighted based on actual radar data
- **Performance Optimized**: Fast, responsive interface with smooth radar layer transitions

### API Architecture Updates
- **RainViewer Backend**: Server-side integration with RainViewer API for storm detection
- **Authentic Data Sources**: Eliminated radar simulation in favor of real-time precipitation data
- **Error Handling**: Robust fallback system when primary radar sources are unavailable
- **Performance Optimization**: Efficient radar frame caching and loading