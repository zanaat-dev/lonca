-- Lonca Panel waitlist (Cloudflare D1)
CREATE TABLE IF NOT EXISTS waitlist (
  email      TEXT PRIMARY KEY,
  lang       TEXT NOT NULL DEFAULT 'tr',
  source     TEXT NOT NULL DEFAULT '',
  needs      TEXT NOT NULL DEFAULT '[]',
  volume     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
