# StormTracker Windy Plugin ⛈️

Real-time radar-based storm cell detection overlay for [Windy.com](https://www.windy.com). Brings [StormTracker](https://github.com/CAPFlyingFun/StormTracker)'s storm intelligence to Windy's global weather visualization.

## Features

- **Storm Points** — Colored markers showing storm cell positions with dBZ intensity
- **Movement Arrows** — Direction arrows showing where storms are heading (cell-tracked or wind-based)
- **Track Cones** — Predicted path cones showing likely storm trajectories
- **Three Display Modes** — Off / 12 Inbound (approaching storms only) / All storms
- **Auto-Scan** — Refreshes every 2 minutes for continuous monitoring
- **Dual Radar** — NEXRAD (US) primary with RainViewer (global) fallback
- **Winds Aloft** — Uses Open-Meteo 850-500hPa steering winds for movement estimation
- **Cell Tracking** — Frame-to-frame comparison for individual cell movement vectors

## Installation

### Development

```bash
git clone https://github.com/CAPFlyingFun/StormTracker-Windy-Plugin.git
cd StormTracker-Windy-Plugin
npm install
npm start
```

Open Windy.com, press the plugin button (or navigate to the menu), and load from `https://localhost:9999/plugin.js`.

### Building

```bash
npm run build
```

Output goes to `dist/plugin.min.js`.

## Display Modes

| Mode | Behavior |
|------|----------|
| **Off** | All storm layers hidden |
| **12 Inbound** | Shows up to 12 approaching storm cells with arrows and tracks |
| **All** | Shows every detected storm cell within scan radius |

## Layer Toggles

Each layer can be individually enabled/disabled:
- ✅ **Storm Points** — Circle markers colored by dBZ
- ✅ **Movement Arrows** — Cyan = cell-tracked, Blue = wind-estimated
- ✅ **Track Cones** — Semi-transparent path prediction cones

## Scan Radius

Choose 40, 80, or 120 miles. Adjusts the detection area around the current map center.

## Data Sources

- **Radar**: [RainViewer API](https://www.rainviewer.com/api.html) (global) + [Iowa State NEXRAD](https://mesonet.agron.iastate.edu/) (US)
- **Winds**: [Open-Meteo](https://open-meteo.com/) (850-500hPa steering winds)
- **Cell Tracking**: Frame-to-frame cell matching with speed/direction calculation

## License

MIT — see [StormTracker](https://github.com/CAPFlyingFun/StormTracker) for the parent project.
