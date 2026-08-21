-- Reserved local profile schema. Nothing runs this file automatically.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS profiles (
    profile_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
    avatar_ref TEXT,
    created_at TEXT NOT NULL,
    is_guest INTEGER NOT NULL DEFAULT 0 CHECK (is_guest IN (0, 1))
);

CREATE TABLE IF NOT EXISTS profile_preferences (
    profile_id TEXT PRIMARY KEY REFERENCES profiles(profile_id) ON DELETE CASCADE,
    reduced_motion INTEGER NOT NULL DEFAULT 0 CHECK (reduced_motion IN (0, 1)),
    high_contrast INTEGER NOT NULL DEFAULT 0 CHECK (high_contrast IN (0, 1)),
    large_text INTEGER NOT NULL DEFAULT 0 CHECK (large_text IN (0, 1)),
    locale TEXT NOT NULL DEFAULT 'en-US'
);

-- Authentication secrets, payment data, tokens, and recovery credentials do
-- not belong in this local UI database and are intentionally absent.
