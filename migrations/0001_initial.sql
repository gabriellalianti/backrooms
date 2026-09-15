PRAGMA foreign_keys = ON;

CREATE TABLE users (
  email TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'staff', 'admin')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  location TEXT,
  source_row INTEGER,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  page_url TEXT,
  price_cents INTEGER,
  image_key TEXT,
  metadata_state TEXT NOT NULL DEFAULT 'unavailable'
    CHECK (metadata_state IN ('current', 'last_known', 'unavailable')),
  sheet_synced_at TEXT,
  metadata_refreshed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX products_active_name_idx ON products(active, normalized_name);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  source_message_id TEXT UNIQUE,
  date_added TEXT NOT NULL,
  source_status TEXT NOT NULL,
  comments TEXT,
  collection_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (collection_state IN ('pending', 'collected')),
  collected_by TEXT REFERENCES users(email),
  collected_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX orders_state_date_idx ON orders(collection_state, date_added DESC);

CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  raw_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0),
  product_id TEXT REFERENCES products(id),
  match_status TEXT NOT NULL
    CHECK (match_status IN ('exact', 'parenthetical', 'manual', 'ambiguous', 'unmatched')),
  sort_order INTEGER NOT NULL,
  UNIQUE(order_id, sort_order)
);

CREATE INDEX order_items_order_idx ON order_items(order_id, sort_order);

CREATE TABLE order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('pending', 'collected')),
  actor_email TEXT NOT NULL REFERENCES users(email),
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX order_events_order_idx ON order_events(order_id, created_at DESC);

CREATE TABLE sync_runs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('catalogue', 'orders', 'metadata')),
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  records_seen INTEGER NOT NULL DEFAULT 0,
  records_changed INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT
);

