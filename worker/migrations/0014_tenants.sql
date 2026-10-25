-- Multi-business loyalty platform (Kerdiseto): every business is a tenant with its own branding, rules, staff and members.
-- Existing rows (from 0013) become tenant 1 ("brun"). Also safe on an empty database after 0013.
--
-- Members, sessions, login codes and the ledger are rebuilt together (SQLite cannot drop the global UNIQUE on email in place).
-- Apply (production):  cd frontend && npx wrangler d1 execute <db> --remote --file ../worker/migrations/0014_tenants.sql
-- Apply (local dev):    cd frontend && npx wrangler d1 execute <db> --local  --file ../worker/migrations/0014_tenants.sql

PRAGMA defer_foreign_keys = on;

CREATE TABLE IF NOT EXISTS tenants (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT NOT NULL UNIQUE,                 -- URL part: /<slug>
  name            TEXT NOT NULL,
  tagline         TEXT,
  icon            TEXT NOT NULL DEFAULT 'coffee',       -- key of a built-in icon (see src/loyalty/icons.jsx)
  color           TEXT NOT NULL DEFAULT '#2b2b2b',      -- card colour, #rrggbb
  logo            TEXT,                                 -- PNG data URL (uploaded by the owner) or a site path
  owner_key_hash  TEXT,                                 -- HMAC of the owner's access key: never the key itself
  legal_name      TEXT,                                 -- shown in the privacy policy
  legal_address   TEXT,
  legal_vat       TEXT,
  contact_email   TEXT,
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT OR IGNORE INTO tenants (id, slug, name, icon, color, logo) VALUES (1, 'brun', 'BRUN', 'coffee', '#2b2b2b', '/brun-logo.jpg');

-- Staff: plain tenant column (rows from 0013 default to tenant 1).
ALTER TABLE loyalty_staff ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_loyalty_staff_tenant ON loyalty_staff(tenant_id);

-- Members: email is unique per business, not globally.
CREATE TABLE loyalty_members_new (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id          INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id),
  public_id          TEXT NOT NULL UNIQUE,
  card_number        TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  email              TEXT NOT NULL COLLATE NOCASE,
  email_verified_at  TEXT,
  points             INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  lifetime_points    INTEGER NOT NULL DEFAULT 0,
  rewards_redeemed   INTEGER NOT NULL DEFAULT 0,
  favorite_drink     TEXT,
  terms_accepted_at  TEXT NOT NULL,
  marketing_opt_in   INTEGER NOT NULL DEFAULT 0,
  qr_version         INTEGER NOT NULL DEFAULT 1,
  last_earn_at       TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at         TEXT,
  UNIQUE (tenant_id, email)
);
INSERT INTO loyalty_members_new (id, public_id, card_number, name, email, email_verified_at, points, lifetime_points, rewards_redeemed,
  favorite_drink, terms_accepted_at, marketing_opt_in, qr_version, last_earn_at, created_at, updated_at, deleted_at)
  SELECT id, public_id, card_number, name, email, email_verified_at, points, lifetime_points, rewards_redeemed,
  favorite_drink, terms_accepted_at, marketing_opt_in, qr_version, last_earn_at, created_at, updated_at, deleted_at FROM loyalty_members;

CREATE TABLE loyalty_sessions_new (
  token_hash  TEXT PRIMARY KEY,
  member_id   INTEGER NOT NULL REFERENCES loyalty_members_new(id),
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO loyalty_sessions_new (token_hash, member_id, expires_at, created_at) SELECT token_hash, member_id, expires_at, created_at FROM loyalty_sessions;

CREATE TABLE loyalty_login_codes_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   INTEGER NOT NULL REFERENCES loyalty_members_new(id),
  code_hash   TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO loyalty_login_codes_new (id, member_id, code_hash, attempts, expires_at, used_at, created_at)
  SELECT id, member_id, code_hash, attempts, expires_at, used_at, created_at FROM loyalty_login_codes;

CREATE TABLE loyalty_transactions_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id    INTEGER NOT NULL DEFAULT 1,
  member_id    INTEGER NOT NULL REFERENCES loyalty_members_new(id),
  delta        INTEGER NOT NULL CHECK (delta <> 0),
  kind         TEXT NOT NULL CHECK (kind IN ('earn', 'redeem', 'adjust', 'reversal')),
  staff_id     INTEGER REFERENCES loyalty_staff(id),
  staff_name   TEXT NOT NULL,
  note         TEXT,
  scan_ticket  TEXT,
  reverses_id  INTEGER REFERENCES loyalty_transactions_new(id),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO loyalty_transactions_new (id, tenant_id, member_id, delta, kind, staff_id, staff_name, note, scan_ticket, reverses_id, created_at)
  SELECT id, 1, member_id, delta, kind, staff_id, staff_name, note, scan_ticket, reverses_id, created_at FROM loyalty_transactions;

DROP TABLE loyalty_sessions;
DROP TABLE loyalty_login_codes;
DROP TABLE loyalty_transactions;
DROP TABLE loyalty_members;
ALTER TABLE loyalty_members_new RENAME TO loyalty_members;
ALTER TABLE loyalty_sessions_new RENAME TO loyalty_sessions;
ALTER TABLE loyalty_login_codes_new RENAME TO loyalty_login_codes;
ALTER TABLE loyalty_transactions_new RENAME TO loyalty_transactions;

CREATE INDEX IF NOT EXISTS idx_loyalty_members_tenant ON loyalty_members(tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_sessions_member ON loyalty_sessions(member_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_login_codes_member ON loyalty_login_codes(member_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_member ON loyalty_transactions(member_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_created ON loyalty_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_tenant ON loyalty_transactions(tenant_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_tx_scan ON loyalty_transactions(scan_ticket, kind) WHERE scan_ticket IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_tx_reverses ON loyalty_transactions(reverses_id) WHERE reverses_id IS NOT NULL;

-- Rules per business.
CREATE TABLE loyalty_settings_new (
  tenant_id  INTEGER NOT NULL DEFAULT 1,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  PRIMARY KEY (tenant_id, key)
);
INSERT INTO loyalty_settings_new (tenant_id, key, value) SELECT 1, key, value FROM loyalty_settings;
DROP TABLE loyalty_settings;
ALTER TABLE loyalty_settings_new RENAME TO loyalty_settings;
