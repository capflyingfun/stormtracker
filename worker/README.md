# StormTracker Notification Worker

A Cloudflare Worker that provides user accounts, settings sync, and email weather alerts for StormTracker.

## Features

- **User Accounts**: Simple email + 4-6 digit PIN authentication (no personal info required)
- **Settings Sync**: Upload/download all app settings (favorites, thresholds, units, UI preferences) as a JSON blob
- **Email Alerts**: Cron trigger checks weather every 10 minutes for all users with alerts enabled, sends email via Resend when thresholds are exceeded
- **Privacy**: Only email and hashed PIN stored. Settings stored as an opaque JSON blob. No tracking.

## Setup

### Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed (`npm install -g wrangler`)
- [Resend account](https://resend.com) for email delivery (free tier: 100 emails/day)

### 1. Clone and install

```bash
cd worker
npm install
```

### 2. Authenticate with Cloudflare

```bash
wrangler login
```

### 3. Create D1 database

```bash
wrangler d1 create stormtracker-db
```

Copy the `database_id` from the output and paste it into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "stormtracker-db"
database_id = "YOUR_ACTUAL_DATABASE_ID"
```

### 4. Run the database migration

```bash
wrangler d1 execute stormtracker-db --file=./migrations/0001_init.sql
```

### 5. Configure secrets

```bash
wrangler secret put RESEND_API_KEY
# Paste your Resend API key when prompted

wrangler secret put RESEND_DOMAIN
# Your verified sending domain in Resend (e.g., stormtracker.dev)
```

These are stored securely as Cloudflare Worker secrets (not in `wrangler.toml`).

Update `wrangler.toml` with your app URL:

```toml
[vars]
APP_URL = "https://your-username.github.io/StormTracker/"
```

### 6. Deploy

```bash
wrangler deploy
```

The worker will be available at `https://stormtracker-notifications.<your-subdomain>.workers.dev`.

### 7. Configure StormTracker

In the StormTracker app, open **Settings → Sync & Alerts**, and paste your worker URL in the "Server URL" field.

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/signup` | No | Create account (email + PIN). Re-signing up with the same email resets the PIN (account recovery). |
| POST | `/api/login` | No | Log in (email + PIN) |
| POST | `/api/logout` | Yes | Log out (invalidate session) |
| GET | `/api/settings` | Yes | Download settings |
| POST | `/api/settings/sync` | Yes | Upload settings |
| DELETE | `/api/account` | Yes | Delete account and all data |
| GET | `/api/health` | No | Health check |

## Cron Schedule

The worker runs a scheduled task every 10 minutes (`*/10 * * * *`) that:

1. Queries all users with email alerts enabled
2. Fetches current weather from Open-Meteo for each saved location
3. Evaluates weather against user-configured thresholds
4. Sends alert emails via Resend for any threshold breaches
5. Logs sent alerts to the `alert_log` table
6. Respects a 15-minute cooldown per alert type per user per location

## Database Schema

- **users**: id, email, pin_hash, created_at
- **sessions**: token, user_id, created_at
- **user_settings**: user_id, settings_json, updated_at
- **alert_log**: id, user_id, alert_type, location_name, message, sent_at

## Local Development

```bash
wrangler dev
```

This starts the worker locally with a local D1 database. Run the migration against the local DB first:

```bash
wrangler d1 execute stormtracker-db --local --file=./migrations/0001_init.sql
```
