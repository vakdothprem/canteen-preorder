-- =====================================================================
-- Canteen Pre-Order Management System :: SQLite schema
-- Covers every module named in the specification:
--   User Module, Menu Management, Order Management, Payment Module,
--   Notification Module, Admin Module (users / reports)
-- =====================================================================

-- ---------- User Module -------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'student'
                        CHECK (role IN ('student', 'staff', 'admin')),
  department    TEXT,
  phone         TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------- Menu Management ---------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS menu_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name         TEXT    NOT NULL,
  description  TEXT,
  price        REAL    NOT NULL CHECK (price >= 0),
  image_emoji  TEXT,
  is_veg       INTEGER NOT NULL DEFAULT 1 CHECK (is_veg IN (0, 1)),
  prep_minutes INTEGER NOT NULL DEFAULT 10 CHECK (prep_minutes >= 0),
  stock_qty    INTEGER,                       -- NULL = unlimited
  is_available INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0, 1)),
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_available ON menu_items(is_available);

-- ---------- Order Management --------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT    NOT NULL UNIQUE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status         TEXT    NOT NULL DEFAULT 'Pending'
                         CHECK (status IN ('Pending', 'Confirmed', 'Preparing',
                                           'Ready', 'Completed', 'Cancelled')),
  payment_method TEXT    NOT NULL DEFAULT 'Cash on Pickup'
                         CHECK (payment_method IN ('Cash on Pickup', 'Online')),
  payment_status TEXT    NOT NULL DEFAULT 'Unpaid'
                         CHECK (payment_status IN ('Unpaid', 'Paid', 'Refunded')),
  pickup_time    TEXT,
  notes          TEXT,
  subtotal       REAL    NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  service_fee    REAL    NOT NULL DEFAULT 0 CHECK (service_fee >= 0),
  total          REAL    NOT NULL DEFAULT 0 CHECK (total >= 0),
  placed_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_user   ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_placed ON orders(placed_at);

CREATE TABLE IF NOT EXISTS order_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE SET NULL,
  item_name    TEXT    NOT NULL,          -- price/name snapshot (menu may change later)
  unit_price   REAL    NOT NULL CHECK (unit_price >= 0),
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  line_total   REAL    NOT NULL CHECK (line_total >= 0)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- Audit trail for every status transition (Pending -> ... -> Completed)
CREATE TABLE IF NOT EXISTS order_status_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     TEXT    NOT NULL,
  changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  note       TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_history_order ON order_status_history(order_id);

-- ---------- Notification Module -----------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id   INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  message    TEXT    NOT NULL,
  is_read    INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
