-- StormTracker push subscriptions (Cloudflare D1)
-- Apply with:
--   wrangler d1 execute stormtracker_push --file=schema.sql            (local)
--   wrangler d1 execute stormtracker_push --remote --file=schema.sql   (production)

CREATE TABLE IF NOT EXISTS subscriptions (
  endpoint   TEXT PRIMARY KEY,   -- Web Push endpoint (unique per device/subscription)
  p256dh     TEXT NOT NULL,       -- subscription public key
  auth       TEXT NOT NULL,       -- subscription auth secret
  lat        REAL NOT NULL,       -- subscriber location
  lon        REAL NOT NULL,
  name       TEXT,                -- friendly location label
  thresholds TEXT NOT NULL,       -- JSON {dist,dbz,impact,radius}
  code       TEXT,                -- short shareable manage code
  last_alert TEXT,                -- JSON map cellKey -> timestamp (dedupe)
  created    INTEGER NOT NULL     -- epoch ms
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_code ON subscriptions (code);
