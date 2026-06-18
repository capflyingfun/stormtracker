# Background Storm Push Alerts — Setup Runbook

StormTracker can push storm alerts to subscribers' phones **even when the app is
closed**. The app code is already deployed; this is the **one-time** infrastructure
setup only the repo owner can do. Three pieces work together:

```
PWA (docs/, GitHub Pages)  ──subscribe──▶  Cloudflare Worker + D1  ◀──read/scan──  GitHub Actions scanner (cron 30m)
        ▲                                                                                   │
        └──────────────────────────────── Web Push ────────────────────────────────────────┘
```

You provide the secrets generated for this project. The **VAPID public key is already
embedded** in `docs/js/push.js`. The matching **private key** and the **scanner secret**
are stored locally in `.local/push-secrets.txt` (never committed) — copy the values from
there when a step below asks for them.

---

## Part 1 — Cloudflare Worker + D1

Prereqs: a free Cloudflare account and `npm i -g wrangler`, then `wrangler login`.

```bash
cd worker

# 1. Create the D1 database
wrangler d1 create stormtracker_push
#    -> copy the printed "database_id"

# 2. Paste that id into wrangler.toml (replace REPLACE_WITH_D1_DATABASE_ID)

# 3. Create the table (run BOTH: local is optional, --remote is required for prod)
wrangler d1 execute stormtracker_push --remote --file=schema.sql

# 4. Set the scanner shared secret (value = SCANNER_SECRET from .local/push-secrets.txt)
wrangler secret put SCANNER_SECRET

# 5. Deploy
wrangler deploy
#    -> note the deployed URL, e.g. https://stormtracker-proxy.<account>.workers.dev
```

**In the app:** the Worker URL is already baked into `docs/js/push.js` as `PUSH_API_DEFAULT`,
so standard users just open Settings → **Background Storm Alerts** and enable — no sync URL
needed. (Push is independent of the settings-sync server.) To point push at a *different*
worker, set `st_pushApiUrl` in localStorage; if you deploy your own worker, update
`PUSH_API_DEFAULT` in `docs/js/push.js`.

---

## Part 2 — GitHub Actions scanner

### 2a. Add the workflow file (one-time, manual)

The workflow lives at `.github/workflows/storm-scan.yml`. It must be added through the
GitHub web UI because the automated deploy token does not carry the `workflow`
permission scope (GitHub blocks programmatic writes under `.github/workflows/`).

GitHub → **Add file → Create new file** → name it `.github/workflows/storm-scan.yml`
→ paste the following → Commit:

```yaml
name: Storm Push Scanner

on:
  schedule:
    # Every 30 minutes. GitHub cron runs in UTC and may be delayed under load.
    - cron: "*/30 * * * *"
  workflow_dispatch: {}

concurrency:
  group: storm-scan
  cancel-in-progress: false

jobs:
  scan:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install scanner deps
        working-directory: scanner
        run: npm install --no-audit --no-fund

      - name: Run scan
        working-directory: scanner
        env:
          WORKER_URL: ${{ secrets.WORKER_URL }}
          SCANNER_SECRET: ${{ secrets.SCANNER_SECRET }}
          VAPID_PUBLIC_KEY: ${{ secrets.VAPID_PUBLIC_KEY }}
          VAPID_PRIVATE_KEY: ${{ secrets.VAPID_PRIVATE_KEY }}
          VAPID_SUBJECT: ${{ secrets.VAPID_SUBJECT }}
        run: node scan.js
```

> The same file is present in this repl at `.github/workflows/storm-scan.yml` if you'd
> rather copy it from there.

### 2b. Repository secrets

It runs every 30 minutes. Add these **repository secrets** (Settings → Secrets and variables → Actions → New
repository secret):

| Secret | Value |
| --- | --- |
| `WORKER_URL` | the Worker URL from Part 1 (no trailing slash) |
| `SCANNER_SECRET` | same value you set with `wrangler secret put` |
| `VAPID_PUBLIC_KEY` | the public key (already in `docs/js/push.js`) |
| `VAPID_PRIVATE_KEY` | the private key from `.local/push-secrets.txt` |
| `VAPID_SUBJECT` | optional, e.g. `mailto:you@example.com` |

Then enable Actions for the repo if prompted (Actions tab → enable workflows). Trigger a
first run manually via **Actions → Storm Push Scanner → Run workflow** and check the logs:
you should see `Subscribers: N` and per-location scan output.

> Note: GitHub's free scheduled-cron can be delayed or skipped under platform load; the
> 30-minute cadence is best-effort, not guaranteed to the minute.

---

## How it behaves

- A user enables alerts in Settings → permission prompt → their device subscription +
  saved home location + thresholds (min dBZ / min impact / watch radius) are stored in D1.
- Every run, the scanner reads all subscribers, runs the same detection engine as the live
  map (real dBZ palettes, winds-aloft steering, impact & ETA), and pushes only when an
  **inbound** cell matches that subscriber's thresholds.
- Each storm cell is de-duplicated with a 30-minute cooldown so you aren't spammed every run.
- Dead/expired subscriptions (HTTP 404/410 on push) are pruned automatically.

## Rotating secrets

Generate a fresh VAPID keypair / scanner secret with the `web-push` library, update
`docs/js/push.js` (public key), the Worker secret, and the GitHub secrets. Existing
subscriptions must re-subscribe after a VAPID public-key change.
