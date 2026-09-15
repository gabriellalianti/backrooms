CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  google_subject TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX sessions_user_idx ON sessions(user_email);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

ALTER TABLE products ADD COLUMN image_url TEXT;
