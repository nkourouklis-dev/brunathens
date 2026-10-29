-- Κερδίσετο: γενική εφαρμογή loyalty για πολλές επιχειρήσεις (multi-tenant).
--
-- ΠΡΟΣΟΧΗ: σβήνει ΟΛΑ τα παλιά δεδομένα (παλιά loyalty tables, tenants).
-- Η βάση (cafe-orders-db) μένει ίδια, μόνο το περιεχόμενό της ξαναφτιάχνεται από την αρχή.
--
--   npx wrangler d1 execute cafe-orders-db --remote --file ../migrations/0100_kerdiseto_reset.sql   (από το frontend/)

PRAGMA foreign_keys = OFF;

-- παλιά εφαρμογή παραγγελιών
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS favorites;
DROP TABLE IF EXISTS product_options;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS customer_push_subscriptions;
DROP TABLE IF EXISTS push_subscriptions;
DROP TABLE IF EXISTS customers;

-- παλιό loyalty (single-tenant / πρώτη εκδοχή tenants)
DROP TABLE IF EXISTS loyalty_apple_registrations;
DROP TABLE IF EXISTS loyalty_login_codes;
DROP TABLE IF EXISTS loyalty_sessions;
DROP TABLE IF EXISTS loyalty_transactions;
DROP TABLE IF EXISTS loyalty_rate_limits;
DROP TABLE IF EXISTS loyalty_settings;
DROP TABLE IF EXISTS loyalty_staff;
DROP TABLE IF EXISTS loyalty_members;
DROP TABLE IF EXISTS tenants;

-- νέο σχήμα
DROP TABLE IF EXISTS apple_registrations;
DROP TABLE IF EXISTS login_codes;
DROP TABLE IF EXISTS member_sessions;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS members;
DROP TABLE IF EXISTS invitations;
DROP TABLE IF EXISTS team_sessions;
DROP TABLE IF EXISTS team_members;
DROP TABLE IF EXISTS rewards;
DROP TABLE IF EXISTS businesses;
DROP TABLE IF EXISTS rate_limits;

PRAGMA foreign_keys = ON;

-- Μία γραμμή ανά επιχείρηση: branding + κανόνες πόντων + τρόπος εγγραφής πελατών.
CREATE TABLE businesses (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  slug                   TEXT NOT NULL UNIQUE,                    -- /b/<slug>
  name                   TEXT NOT NULL,
  tagline                TEXT,
  icon                   TEXT NOT NULL DEFAULT 'star',            -- κλειδί από shared/constants.js
  color                  TEXT NOT NULL DEFAULT '#1f2937',         -- #rrggbb (φόντο κάρτας)
  logo                   TEXT,                                    -- data URL (PNG/JPEG/WebP) που ανεβάζει ο ιδιοκτήτης
  logo_version           INTEGER NOT NULL DEFAULT 0,              -- αλλάζει σε κάθε νέο λογότυπο (cache busting)
  unit_one               TEXT NOT NULL DEFAULT 'πόντος',
  unit_many              TEXT NOT NULL DEFAULT 'πόντοι',
  card_style             TEXT NOT NULL DEFAULT 'stamps' CHECK (card_style IN ('stamps', 'points')),
  points_per_visit       INTEGER NOT NULL DEFAULT 1 CHECK (points_per_visit BETWEEN 1 AND 100),
  max_points_per_scan    INTEGER NOT NULL DEFAULT 5 CHECK (max_points_per_scan BETWEEN 1 AND 1000),
  scan_cooldown_seconds  INTEGER NOT NULL DEFAULT 60 CHECK (scan_cooldown_seconds BETWEEN 0 AND 86400),
  welcome_points         INTEGER NOT NULL DEFAULT 0 CHECK (welcome_points BETWEEN 0 AND 100),
  signup_mode            TEXT NOT NULL DEFAULT 'open' CHECK (signup_mode IN ('open', 'code', 'closed')),
  join_code              TEXT NOT NULL,                           -- μπαίνει στο link εγγραφής· αλλάζει όποτε θέλει ο ιδιοκτήτης
  legal_name             TEXT,
  legal_address          TEXT,
  legal_vat              TEXT,
  contact_email          TEXT,
  contact_phone          TEXT,
  status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Δώρα που ορίζει ο ιδιοκτήτης (πόσοι πόντοι κοστίζει το καθένα).
CREATE TABLE rewards (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id  INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  cost         INTEGER NOT NULL CHECK (cost BETWEEN 1 AND 100000),
  icon         TEXT NOT NULL DEFAULT 'gift',
  active       INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_rewards_business ON rewards(business_id, active, cost);

-- Ομάδα της επιχείρησης: owner (όλα), manager (πελάτες/στατιστικά/διορθώσεις), staff (μόνο ταμείο).
CREATE TABLE team_members (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id    INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
  email          TEXT COLLATE NOCASE,                             -- owner/manager: σύνδεση με email + κωδικό
  password_hash  TEXT,                                            -- pbkdf2$iterations$salt$hash
  pin_lookup     TEXT,                                            -- staff: HMAC(secret, business|pin), ποτέ το ίδιο το PIN
  active         INTEGER NOT NULL DEFAULT 1,
  last_login_at  TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX idx_team_email ON team_members(business_id, email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX idx_team_pin ON team_members(business_id, pin_lookup) WHERE pin_lookup IS NOT NULL;

CREATE TABLE team_sessions (
  token_hash   TEXT PRIMARY KEY,                                  -- SHA-256 του cookie
  member_id    INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  business_id  INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  expires_at   TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_team_sessions_member ON team_sessions(member_id);

-- Προσκλήσεις (ιδιοκτήτης από την πλατφόρμα, manager/staff από τον ιδιοκτήτη): link μίας χρήσης.
CREATE TABLE invitations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id  INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
  label        TEXT,                                              -- π.χ. το όνομα που περιμένουμε
  token_hash   TEXT NOT NULL UNIQUE,
  created_by   INTEGER REFERENCES team_members(id) ON DELETE SET NULL,  -- NULL = πλατφόρμα
  expires_at   TEXT NOT NULL,
  used_at      TEXT,
  used_by      INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
  revoked_at   TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_invitations_business ON invitations(business_id, created_at DESC);

-- Οι πελάτες (μία κάρτα ανά επιχείρηση).
CREATE TABLE members (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id        INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  public_id          TEXT NOT NULL UNIQUE,                        -- μπαίνει στα QR και στο Wallet
  card_number        TEXT NOT NULL UNIQUE,                        -- 8 χαρακτήρες που πληκτρολογεί το ταμείο
  name               TEXT NOT NULL,
  email              TEXT NOT NULL COLLATE NOCASE,
  email_verified_at  TEXT,
  points             INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  lifetime_points    INTEGER NOT NULL DEFAULT 0,
  rewards_redeemed   INTEGER NOT NULL DEFAULT 0,
  visits             INTEGER NOT NULL DEFAULT 0,
  terms_accepted_at  TEXT NOT NULL,
  marketing_opt_in   INTEGER NOT NULL DEFAULT 0,
  qr_version         INTEGER NOT NULL DEFAULT 1,
  last_earn_at       TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at         TEXT,
  UNIQUE (business_id, email)
);
CREATE INDEX idx_members_business ON members(business_id, deleted_at, created_at DESC);

CREATE TABLE member_sessions (
  token_hash  TEXT PRIMARY KEY,
  member_id   INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_member_sessions_member ON member_sessions(member_id);

CREATE TABLE login_codes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_login_codes_member ON login_codes(member_id, id DESC);

-- Κάθε αλλαγή πόντων είναι μία γραμμή. members.points είναι το τρέχον υπόλοιπο.
CREATE TABLE transactions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id   INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  member_id     INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  delta         INTEGER NOT NULL CHECK (delta <> 0),
  kind          TEXT NOT NULL CHECK (kind IN ('earn', 'redeem', 'adjust', 'reversal', 'welcome')),
  reward_id     INTEGER REFERENCES rewards(id) ON DELETE SET NULL,
  reward_name   TEXT,
  team_id       INTEGER REFERENCES team_members(id) ON DELETE SET NULL,   -- NULL = σύστημα/πλατφόρμα
  team_name     TEXT NOT NULL,
  note          TEXT,
  scan_ticket   TEXT,
  reverses_id   INTEGER REFERENCES transactions(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_tx_member ON transactions(member_id, id DESC);
CREATE INDEX idx_tx_business ON transactions(business_id, id DESC);
CREATE UNIQUE INDEX idx_tx_scan ON transactions(business_id, scan_ticket, kind) WHERE scan_ticket IS NOT NULL;
CREATE UNIQUE INDEX idx_tx_reverses ON transactions(reverses_id) WHERE reverses_id IS NOT NULL;

CREATE TABLE apple_registrations (
  device_library_id  TEXT NOT NULL,
  serial_number      TEXT NOT NULL,
  push_token         TEXT NOT NULL,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (device_library_id, serial_number)
);
CREATE INDEX idx_apple_serial ON apple_registrations(serial_number);

CREATE TABLE rate_limits (
  key           TEXT PRIMARY KEY,
  window_start  INTEGER NOT NULL,
  count         INTEGER NOT NULL
);
