-- Loyalty card program: members, points ledger, staff PINs, sessions, Wallet registrations.
-- New tables only; the existing ordering tables (customers, orders, ...) are left untouched.
--
-- Apply (production):  cd frontend && npx wrangler d1 execute cafe-orders-db --remote --file ../worker/migrations/0013_loyalty.sql
-- Apply (local dev):    cd frontend && npx wrangler d1 execute cafe-orders-db --local  --file ../worker/migrations/0013_loyalty.sql

CREATE TABLE IF NOT EXISTS loyalty_members (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id          TEXT NOT NULL UNIQUE,              -- random id used in QR codes and as Wallet serial number
  card_number        TEXT NOT NULL UNIQUE,              -- short code the barista can type, e.g. K7Q49MZ2 (shown as K7Q4-9MZ2)
  name               TEXT NOT NULL,
  email              TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email_verified_at  TEXT,
  points             INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  lifetime_points    INTEGER NOT NULL DEFAULT 0,
  rewards_redeemed   INTEGER NOT NULL DEFAULT 0,
  favorite_drink     TEXT,
  terms_accepted_at  TEXT NOT NULL,
  marketing_opt_in   INTEGER NOT NULL DEFAULT 0,
  qr_version         INTEGER NOT NULL DEFAULT 1,        -- bump to invalidate the static Wallet QR
  last_earn_at       TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at         TEXT
);

CREATE TABLE IF NOT EXISTS loyalty_staff (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  pin_lookup  TEXT NOT NULL UNIQUE,                     -- HMAC(LOYALTY_SECRET, pin): never the PIN itself
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Every change of points is one row. loyalty_members.points is the running balance.
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id    INTEGER NOT NULL REFERENCES loyalty_members(id),
  delta        INTEGER NOT NULL CHECK (delta <> 0),
  kind         TEXT NOT NULL CHECK (kind IN ('earn', 'redeem', 'adjust', 'reversal')),
  staff_id     INTEGER REFERENCES loyalty_staff(id),    -- NULL = owner
  staff_name   TEXT NOT NULL,
  note         TEXT,
  scan_ticket  TEXT,                                    -- one earn per scan
  reverses_id  INTEGER REFERENCES loyalty_transactions(id),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_member ON loyalty_transactions(member_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_created ON loyalty_transactions(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_tx_scan ON loyalty_transactions(scan_ticket, kind) WHERE scan_ticket IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_tx_reverses ON loyalty_transactions(reverses_id) WHERE reverses_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS loyalty_sessions (
  token_hash  TEXT PRIMARY KEY,                         -- SHA-256 of the cookie value
  member_id   INTEGER NOT NULL REFERENCES loyalty_members(id),
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_loyalty_sessions_member ON loyalty_sessions(member_id);

CREATE TABLE IF NOT EXISTS loyalty_login_codes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   INTEGER NOT NULL REFERENCES loyalty_members(id),
  code_hash   TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_loyalty_login_codes_member ON loyalty_login_codes(member_id, id DESC);

CREATE TABLE IF NOT EXISTS loyalty_rate_limits (
  key           TEXT PRIMARY KEY,
  window_start  INTEGER NOT NULL,
  count         INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS loyalty_settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
INSERT OR IGNORE INTO loyalty_settings (key, value) VALUES
  ('points_per_reward', '10'),
  ('max_points_per_scan', '5'),
  ('scan_cooldown_seconds', '60'),
  ('reward_name', 'Δωρεάν καφές');

-- Apple Wallet devices that asked for updates of a pass.
CREATE TABLE IF NOT EXISTS loyalty_apple_registrations (
  device_library_id  TEXT NOT NULL,
  serial_number      TEXT NOT NULL,
  push_token         TEXT NOT NULL,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (device_library_id, serial_number)
);
CREATE INDEX IF NOT EXISTS idx_loyalty_apple_serial ON loyalty_apple_registrations(serial_number);
