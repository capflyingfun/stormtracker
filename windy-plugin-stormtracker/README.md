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

## Publishing to Windy

To publish the plugin to `windy-plugins.com` so it can be installed by anyone:

### 1. Get a Windy API Key
Go to [https://api.windy.com/keys](https://api.windy.com/keys) and create a **Windy Plugins API** key.

### 2. Add the API Key to GitHub
In this repository's **Settings → Secrets and Variables → Actions**, click **New repository secret** and create a secret named `WINDY_API_KEY` with the key from step 1.

### 3. Add the Publish Workflow
Create the file `.github/workflows/publish-plugin.yml` in the repository (via GitHub's web editor or locally). Use this content:

```yaml
name: publish-plugin

on:
    workflow_dispatch:

jobs:
    publish-plugin:
        runs-on: ubuntu-latest
        env:
            WINDY_API_KEY: '${{ secrets.WINDY_API_KEY }}'
        steps:
            - uses: actions/checkout@v2
            - name: Build
              run: |
                  npm install
                  npm run build
            - name: Publish Plugin
              run: |
                  if [ -z "$WINDY_API_KEY" ]; then
                    echo "Secret WINDY_API_KEY is not configured" >&2
                    exit 1
                  fi
                  cd dist
                  echo "Creating plugin archive..."
                  echo "{\"repositoryName\": \"${{ github.repository }}\", \"commitSha\": \"${{ github.sha }}\", \"repositoryOwner\": \"${{ github.repository_owner }}\"}" > /tmp/plugin-info.json
                  mv plugin.json /tmp
                  jq -s '.[0] * .[1]' /tmp/plugin.json /tmp/plugin-info.json > plugin.json
                  tar cf ../plugin.tar .
                  echo "Publishing plugin..."
                  curl -s --fail-with-body -XPOST 'https://node.windy.com/plugins/v1.0/upload' -H "x-windy-api-key: ${WINDY_API_KEY}" -F "plugin_archive=@../plugin.tar"
```

### 4. Run the Workflow
Go to **Actions → publish-plugin → Run workflow** and select the `main` branch. After it completes, the plugin URL will appear in the job log.

### 5. Share the Plugin URL
Your published plugin URL will look like:
```
https://windy-plugins.com/{userId}/windy-plugin-stormtracker/1.0.0/plugin.min.js
```

Share this URL — anyone can paste it into Windy's plugin loader to install your storm detection overlay.

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
