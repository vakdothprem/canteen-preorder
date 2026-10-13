'use strict';
/**
 * All REST endpoints for the Canteen Pre-Order Management System.
 *  /api/auth          User Module (registration / login / profile)
 *  /api/categories    Menu Management
 *  /api/menu          Menu Management
 *  /api/orders        Order Management + Payment Module
 *  /api/notifications Notification Module
 *  /api/users         Admin Module
 *  /api/reports       Admin Module (reports)
 */

const express = require('express');
const db = require('./db');
const {
  signToken,
  hashPassword,
  verifyPassword,
  optionalAuth,
  authRequired,
  requireRole,
} = require('./auth');

const router = express.Router();

const SERVICE_FEE_PERCENT = Number(process.env.SERVICE_FEE_PERCENT || 0);

// Order lifecycle from the specification:
// Pending -> Confirmed -> Preparing -> Ready -> Completed
const STATUSES = ['Pending', 'Confirmed', 'Preparing', 'Ready', 'Completed', 'Cancelled'];
const NEXT_STATUS = {
  Pending: ['Confirmed', 'Cancelled'],
  Confirmed: ['Preparing', 'Cancelled'],
  Preparing: ['Ready', 'Cancelled'],
  Ready: ['Completed'],
  Completed: [],
  Cancelled: [],
};

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const fail = (res, status, error, extra) => res.status(status).json({ success: false, error, ...(extra || {}) });
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const money = (n) => Math.round(Number(n) * 100) / 100;
const asBool = (v) => v === 1 || v === true || v === '1' || v === 'true';

const toMenuItem = (r) => ({
  ...r,
  price: Number(r.price),
  is_veg: asBool(r.is_veg),
  is_available: asBool(r.is_available),
  category_name: r.category_name || null,
});

const toOrder = (r) => ({
  ...r,
  subtotal: Number(r.subtotal),
  service_fee: Number(r.service_fee),
  total: Number(r.total),
});

function notify(userId, orderId, title, message) {
  db.run(
    'INSERT INTO notifications (user_id, order_id, title, message) VALUES (?, ?, ?, ?)',
    userId,
    orderId,
    title,
    message
  );
}

function notifyStaff(orderId, code, total) {
  const staff = db.all("SELECT id FROM users WHERE role IN ('staff', 'admin') AND is_active = 1");
  for (const s of staff) {
    notify(s.id, orderId, 'New pre-order received', `Order ${code} (₹${total.toFixed(2)}) is waiting to be accepted.`);
  }
}

function orderCode() {
  const d = new Date();
  const stamp =
    String(d.getFullYear()).slice(2) +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ORD-${stamp}-${rand}`;
}

function orderWithItems(orderId) {
  const order = db.get(
    `SELECT o.*, u.name AS customer_name, u.email AS customer_email, u.department AS customer_department
       FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = ?`,
    orderId
  );
  if (!order) return null;
  const items = db.all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', orderId);
  const history = db.all(
    `SELECT h.status, h.note, h.created_at, u.name AS changed_by_name
       FROM order_status_history h LEFT JOIN users u ON u.id = h.changed_by
      WHERE h.order_id = ? ORDER BY h.id`,
    orderId
  );
  return {
    ...toOrder(order),
    items: items.map((i) => ({ ...i, unit_price: Number(i.unit_price), line_total: Number(i.line_total) })),
    history,
  };
}

function setStatus(orderId, status, userId, note) {
  db.run("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?", status, orderId);
  db.run(
    'INSERT INTO order_status_history (order_id, status, changed_by, note) VALUES (?, ?, ?, ?)',
    orderId,
    status,
    userId || null,
    note || null
  );
}

/* =====================================================================
 * Health
 * =================================================================== */
router.get('/health', (_req, res) =>
  ok(res, { status: 'ok', driver: db.driver, time: new Date().toISOString() })
);

/* =====================================================================
 * User Module :: /api/auth
 * =================================================================== */
router.post(
  '/auth/register',
  h((req, res) => {
    const { name, email, password, department, phone } = req.body || {};
    const requestedRole = (req.body && req.body.role) || 'student';

    if (!name || !email || !password) return fail(res, 400, 'name, email and password are required');
    if (String(password).length < 6) return fail(res, 400, 'Password must be at least 6 characters');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email))) return fail(res, 400, 'Please provide a valid email address');
    // Self-registration can only create students or canteen staff; admins are provisioned.
    const role = ['student', 'staff'].includes(requestedRole) ? requestedRole : 'student';

    const exists = db.get('SELECT id FROM users WHERE email = ?', String(email));
    if (exists) return fail(res, 409, 'An account with that email already exists');

    const { lastInsertRowid } = db.run(
      'INSERT INTO users (name, email, password_hash, role, department, phone) VALUES (?, ?, ?, ?, ?, ?)',
      String(name).trim(),
      String(email).trim(),
      hashPassword(password),
      role,
      department || null,
      phone || null
    );

    const user = db.get(
      `SELECT ${require('./auth').PUBLIC_COLUMNS} FROM users WHERE id = ?`,
      lastInsertRowid
    );
    notify(user.id, null, 'Welcome to the canteen!', `Hi ${user.name}, your account is ready. Browse the menu and pre-order to skip the queue.`);
    ok(res, { user, token: signToken({ sub: user.id, role: user.role }) }, 201);
  })
);

router.post(
  '/auth/login',
  h((req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return fail(res, 400, 'email and password are required');

    const row = db.get('SELECT * FROM users WHERE email = ?', String(email));
    if (!row || !verifyPassword(password, row.password_hash)) {
      return fail(res, 401, 'Invalid email or password');
    }
    if (!row.is_active) return fail(res, 403, 'This account has been disabled. Contact the canteen admin.');

    const user = db.get(`SELECT ${require('./auth').PUBLIC_COLUMNS} FROM users WHERE id = ?`, row.id);
    ok(res, { user, token: signToken({ sub: user.id, role: user.role }) });
  })
);

router.get('/auth/me', authRequired, (req, res) => ok(res, req.user));

router.patch(
  '/auth/me',
  authRequired,
  h((req, res) => {
    const { name, department, phone } = req.body || {};
    db.run(
      "UPDATE users SET name = COALESCE(?, name), department = ?, phone = ?, updated_at = datetime('now') WHERE id = ?",
      name ? String(name).trim() : null,
      department ?? req.user.department ?? null,
      phone ?? req.user.phone ?? null,
      req.user.id
    );
    ok(res, db.get(`SELECT ${require('./auth').PUBLIC_COLUMNS} FROM users WHERE id = ?`, req.user.id));
  })
);

/* =====================================================================
 * Menu Management :: /api/categories  /api/menu
 * =================================================================== */
router.get('/categories', (_req, res) =>
  ok(res, db.all('SELECT * FROM categories ORDER BY sort_order, name'))
);

router.post(
  '/categories',
  authRequired,
  requireRole('admin'),
  h((req, res) => {
    const { name, description, sort_order } = req.body || {};
    if (!name) return fail(res, 400, 'name is required');
    const { lastInsertRowid } = db.run(
      'INSERT INTO categories (name, description, sort_order) VALUES (?, ?, ?)',
      String(name).trim(),
      description || null,
      Number(sort_order || 0)
    );
    ok(res, db.get('SELECT * FROM categories WHERE id = ?', lastInsertRowid), 201);
  })
);

router.put(
  '/categories/:id',
  authRequired,
  requireRole('admin'),
  h((req, res) => {
    const { name, description, sort_order, is_active } = req.body || {};
    const existing = db.get('SELECT * FROM categories WHERE id = ?', req.params.id);
    if (!existing) return fail(res, 404, 'Category not found');
    db.run(
      'UPDATE categories SET name = ?, description = ?, sort_order = ?, is_active = ? WHERE id = ?',
      name ? String(name).trim() : existing.name,
      description ?? existing.description,
      sort_order ?? existing.sort_order,
      is_active === undefined ? existing.is_active : Number(asBool(is_active)),
      req.params.id
    );
    ok(res, db.get('SELECT * FROM categories WHERE id = ?', req.params.id));
  })
);

router.delete(
  '/categories/:id',
  authRequired,
  requireRole('admin'),
  h((req, res) => {
    const used = db.get('SELECT COUNT(*) AS n FROM menu_items WHERE category_id = ?', req.params.id);
    if (used.n > 0) return fail(res, 409, `Category still has ${used.n} menu item(s). Move or delete them first.`);
    const { changes } = db.run('DELETE FROM categories WHERE id = ?', req.params.id);
    if (!changes) return fail(res, 404, 'Category not found');
    ok(res, { deleted: Number(req.params.id) });
  })
);

router.get(
  '/menu',
  h((req, res) => {
    const { category, q, available, veg, maxPrice, includeUnavailable } = req.query;
    const where = [];
    const params = [];

    if (category && category !== 'all') {
      where.push('(c.name = ? OR m.category_id = ?)');
      params.push(String(category), Number(category) || -1);
    }
    if (q) {
      where.push('(m.name LIKE ? OR m.description LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (available !== undefined || includeUnavailable !== 'true') {
      if (includeUnavailable !== 'true') where.push('m.is_available = 1');
    }
    if (veg === 'true') where.push('m.is_veg = 1');
    if (maxPrice) {
      where.push('m.price <= ?');
      params.push(Number(maxPrice));
    }

    const sql = `SELECT m.*, c.name AS category_name, c.sort_order AS category_order
                   FROM menu_items m LEFT JOIN categories c ON c.id = m.category_id
                  ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                  ORDER BY c.sort_order, m.name`;
    ok(res, db.all(sql, ...params).map(toMenuItem));
  })
);

router.get(
  '/menu/:id',
  h((req, res) => {
    const row = db.get(
      `SELECT m.*, c.name AS category_name FROM menu_items m
         LEFT JOIN categories c ON c.id = m.category_id WHERE m.id = ?`,
      req.params.id
    );
    if (!row) return fail(res, 404, 'Menu item not found');
    ok(res, toMenuItem(row));
  })
);

router.post(
  '/menu',
  authRequired,
  requireRole('admin'),
  h((req, res) => {
    const { name, price, category_id, description, image_emoji, is_veg, prep_minutes, stock_qty, is_available } =
      req.body || {};
    if (!name) return fail(res, 400, 'name is required');
    if (price === undefined || Number.isNaN(Number(price)) || Number(price) < 0) {
      return fail(res, 400, 'a valid non-negative price is required');
    }
    const { lastInsertRowid } = db.run(
      `INSERT INTO menu_items (name, price, category_id, description, image_emoji, is_veg, prep_minutes, stock_qty, is_available)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      String(name).trim(),
      money(price),
      category_id || null,
      description || null,
      image_emoji || '🍽️',
      is_veg === undefined ? 1 : Number(asBool(is_veg)),
      Number(prep_minutes || 10),
      stock_qty === undefined || stock_qty === null || stock_qty === '' ? null : Number(stock_qty),
      is_available === undefined ? 1 : Number(asBool(is_available))
    );
    const row = db.get(
      'SELECT m.*, c.name AS category_name FROM menu_items m LEFT JOIN categories c ON c.id = m.category_id WHERE m.id = ?',
      lastInsertRowid
    );
    ok(res, toMenuItem(row), 201);
  })
);

router.put(
  '/menu/:id',
  authRequired,
  requireRole('admin'),
  h((req, res) => {
    const existing = db.get('SELECT * FROM menu_items WHERE id = ?', req.params.id);
    if (!existing) return fail(res, 404, 'Menu item not found');
    const b = req.body || {};
    db.run(
      `UPDATE menu_items SET name = ?, price = ?, category_id = ?, description = ?, image_emoji = ?,
              is_veg = ?, prep_minutes = ?, stock_qty = ?, is_available = ?, updated_at = datetime('now')
        WHERE id = ?`,
      b.name ? String(b.name).trim() : existing.name,
      b.price === undefined ? existing.price : money(b.price),
      b.category_id === undefined ? existing.category_id : b.category_id || null,
      b.description === undefined ? existing.description : b.description,
      b.image_emoji === undefined ? existing.image_emoji : b.image_emoji,
      b.is_veg === undefined ? existing.is_veg : Number(asBool(b.is_veg)),
      b.prep_minutes === undefined ? existing.prep_minutes : Number(b.prep_minutes),
      b.stock_qty === undefined ? existing.stock_qty : b.stock_qty === null || b.stock_qty === '' ? null : Number(b.stock_qty),
      b.is_available === undefined ? existing.is_available : Number(asBool(b.is_available)),
      req.params.id
    );
    const row = db.get(
      'SELECT m.*, c.name AS category_name FROM menu_items m LEFT JOIN categories c ON c.id = m.category_id WHERE m.id = ?',
      req.params.id
    );
    ok(res, toMenuItem(row));
  })
);

// Kitchen staff may flip availability (e.g. an item sold out) without full admin rights.
router.patch(
  '/menu/:id/availability',
  authRequired,
  requireRole('admin', 'staff'),
  h((req, res) => {
    const existing = db.get('SELECT * FROM menu_items WHERE id = ?', req.params.id);
    if (!existing) return fail(res, 404, 'Menu item not found');
    const available = req.body && req.body.is_available !== undefined ? Number(asBool(req.body.is_available)) : existing.is_available ? 0 : 1;
    db.run("UPDATE menu_items SET is_available = ?, updated_at = datetime('now') WHERE id = ?", available, req.params.id);
    ok(res, toMenuItem(db.get('SELECT * FROM menu_items WHERE id = ?', req.params.id)));
  })
);

router.delete(
  '/menu/:id',
  authRequired,
  requireRole('admin'),
  h((req, res) => {
    const { changes } = db.run('DELETE FROM menu_items WHERE id = ?', req.params.id);
    if (!changes) return fail(res, 404, 'Menu item not found');
    ok(res, { deleted: Number(req.params.id) });
  })
);

/* =====================================================================
 * Order Management :: /api/orders
 * =================================================================== */
router.post(
  '/orders',
  authRequired,
  h((req, res) => {
    const { items, pickup_time, notes, payment_method } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) return fail(res, 400, 'Your cart is empty');
    if (items.length > 40) return fail(res, 400, 'Too many distinct items in one order (max 40)');

    const method = ['Cash on Pickup', 'Online'].includes(payment_method) ? payment_method : 'Cash on Pickup';

    const prepared = [];
    for (const line of items) {
      const id = Number(line.menu_item_id ?? line.id);
      const qty = Math.floor(Number(line.quantity ?? line.qty ?? 1));
      if (!id) return fail(res, 400, 'Each cart line needs a menu_item_id');
      if (!(qty >= 1) || qty > 50) return fail(res, 400, 'Quantity must be between 1 and 50');

      const item = db.get('SELECT * FROM menu_items WHERE id = ?', id);
      if (!item) return fail(res, 400, `Menu item #${id} no longer exists`);
      if (!item.is_available) return fail(res, 409, `"${item.name}" is currently unavailable`);
      if (item.stock_qty !== null && item.stock_qty !== undefined && qty > item.stock_qty) {
        return fail(res, 409, `Only ${item.stock_qty} × "${item.name}" left today`);
      }
      prepared.push({ item, qty, unit_price: Number(item.price), line_total: money(Number(item.price) * qty) });
    }

    const subtotal = money(prepared.reduce((sum, l) => sum + l.line_total, 0));
    const service_fee = money((subtotal * SERVICE_FEE_PERCENT) / 100);
    const total = money(subtotal + service_fee);
    const code = orderCode();

    const created = db.transaction(() => {
      const { lastInsertRowid: orderId } = db.run(
        `INSERT INTO orders (code, user_id, status, payment_method, payment_status, pickup_time, notes, subtotal, service_fee, total)
         VALUES (?, ?, 'Pending', ?, 'Unpaid', ?, ?, ?, ?, ?)`,
        code,
        req.user.id,
        method,
        pickup_time || null,
        notes || null,
        subtotal,
        service_fee,
        total
      );
      for (const l of prepared) {
        db.run(
          'INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price, quantity, line_total) VALUES (?, ?, ?, ?, ?, ?)',
          orderId,
          l.item.id,
          l.item.name,
          l.unit_price,
          l.qty,
          l.line_total
        );
        if (l.item.stock_qty !== null && l.item.stock_qty !== undefined) {
          db.run('UPDATE menu_items SET stock_qty = stock_qty - ? WHERE id = ?', l.qty, l.item.id);
        }
      }
      db.run(
        'INSERT INTO order_status_history (order_id, status, changed_by, note) VALUES (?, ?, ?, ?)',
        orderId,
        'Pending',
        req.user.id,
        'Order placed by customer'
      );
      return orderId;
    })();

    const order = orderWithItems(created);
    notify(req.user.id, created, 'Pre-order confirmed', `Order ${code} received. Total ₹${total.toFixed(2)}. We will notify you when it is ready for pickup.`);
    notifyStaff(created, code, total);
    ok(res, order, 201);
  })
);

router.get(
  '/orders',
  authRequired,
  h((req, res) => {
    const { status, from, to, q, mine } = req.query;
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const isStaff = req.user.role === 'staff' || req.user.role === 'admin';

    const where = [];
    const params = [];
    if (!isStaff || mine === 'true') {
      where.push('o.user_id = ?');
      params.push(req.user.id);
    }
    if (status && status !== 'all') {
      where.push('o.status = ?');
      params.push(status);
    }
    if (from) {
      where.push('date(o.placed_at) >= date(?)');
      params.push(from);
    }
    if (to) {
      where.push('date(o.placed_at) <= date(?)');
      params.push(to);
    }
    if (q) {
      where.push('(o.code LIKE ? OR u.name LIKE ? OR u.email LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const total = db.get(
      `SELECT COUNT(*) AS n FROM orders o JOIN users u ON u.id = o.user_id ${whereSql}`,
      ...params
    ).n;

    const rows = db.all(
      `SELECT o.*, u.name AS customer_name, u.email AS customer_email,
              (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
         FROM orders o JOIN users u ON u.id = o.user_id
         ${whereSql}
        ORDER BY o.placed_at DESC, o.id DESC
        LIMIT ? OFFSET ?`,
      ...params,
      limit,
      (page - 1) * limit
    );

    ok(res, {
      items: rows.map((r) => ({ ...toOrder(r), item_count: Number(r.item_count) })),
      page,
      limit,
      total: Number(total),
      pages: Math.max(1, Math.ceil(Number(total) / limit)),
    });
  })
);

// Live kitchen board: one column per status.
router.get(
  '/orders/board',
  authRequired,
  requireRole('admin', 'staff'),
  h((_req, res) => {
    const rows = db.all(
      `SELECT o.*, u.name AS customer_name,
              (SELECT SUM(oi.quantity) FROM order_items oi WHERE oi.order_id = o.id) AS total_qty
         FROM orders o JOIN users u ON u.id = o.user_id
        WHERE o.status IN ('Pending', 'Confirmed', 'Preparing', 'Ready')
        ORDER BY o.placed_at ASC`
    );
    const columns = { Pending: [], Confirmed: [], Preparing: [], Ready: [] };
    for (const r of rows) {
      columns[r.status].push({ ...toOrder(r), total_qty: Number(r.total_qty || 0) });
    }
    ok(res, columns);
  })
);

router.get(
  '/orders/:id',
  authRequired,
  h((req, res) => {
    const order = orderWithItems(req.params.id);
    if (!order) return fail(res, 404, 'Order not found');
    const isStaff = req.user.role === 'staff' || req.user.role === 'admin';
    if (!isStaff && order.user_id !== req.user.id) return fail(res, 403, 'You can only view your own orders');
    ok(res, order);
  })
);

router.patch(
  '/orders/:id/status',
  authRequired,
  requireRole('admin', 'staff'),
  h((req, res) => {
    const { status, note } = req.body || {};
    if (!STATUSES.includes(status)) return fail(res, 400, `status must be one of: ${STATUSES.join(', ')}`);
    const order = db.get('SELECT * FROM orders WHERE id = ?', req.params.id);
    if (!order) return fail(res, 404, 'Order not found');
    if (order.status === status) return fail(res, 409, `Order is already ${status}`);
    if (!NEXT_STATUS[order.status].includes(status)) {
      return fail(res, 409, `Invalid transition: ${order.status} → ${status}. Allowed: ${NEXT_STATUS[order.status].join(', ') || 'none'}`);
    }

    db.transaction(() => {
      setStatus(order.id, status, req.user.id, note || `Status changed to ${status} by ${req.user.name}`);
      if (status === 'Completed') {
        db.run("UPDATE orders SET payment_status = 'Paid', updated_at = datetime('now') WHERE id = ? AND payment_method = 'Cash on Pickup'", order.id);
      }
    })();

    const copy = {
      Confirmed: ['Order accepted', `Order ${order.code} has been confirmed by the canteen.`],
      Preparing: ['We are preparing your food', `Order ${order.code} is now being prepared in the kitchen.`],
      Ready: ['Ready for pickup!', `Order ${order.code} is ready. Please collect it from the canteen counter.`],
      Completed: ['Order completed', `Order ${order.code} has been picked up. Enjoy your meal!`],
      Cancelled: ['Order cancelled', `Order ${order.code} has been cancelled.`],
    }[status];
    if (copy) notify(order.user_id, order.id, copy[0], copy[1]);

    ok(res, orderWithItems(order.id));
  })
);

router.patch(
  '/orders/:id/payment',
  authRequired,
  requireRole('admin', 'staff'),
  h((req, res) => {
    const { payment_status, payment_method } = req.body || {};
    const order = db.get('SELECT * FROM orders WHERE id = ?', req.params.id);
    if (!order) return fail(res, 404, 'Order not found');
    const ps = ['Unpaid', 'Paid', 'Refunded'].includes(payment_status) ? payment_status : order.payment_status;
    const pm = ['Cash on Pickup', 'Online'].includes(payment_method) ? payment_method : order.payment_method;
    db.run("UPDATE orders SET payment_status = ?, payment_method = ?, updated_at = datetime('now') WHERE id = ?", ps, pm, order.id);
    if (ps === 'Paid') notify(order.user_id, order.id, 'Payment received', `Payment for order ${order.code} has been recorded (${pm}).`);
    ok(res, orderWithItems(order.id));
  })
);

router.post(
  '/orders/:id/cancel',
  authRequired,
  h((req, res) => {
    const order = db.get('SELECT * FROM orders WHERE id = ?', req.params.id);
    if (!order) return fail(res, 404, 'Order not found');
    const isStaff = req.user.role === 'staff' || req.user.role === 'admin';
    if (!isStaff && order.user_id !== req.user.id) return fail(res, 403, 'You can only cancel your own orders');
    if (!['Pending', 'Confirmed'].includes(order.status)) {
      return fail(res, 409, `Order can no longer be cancelled — it is already ${order.status}. Please contact the canteen.`);
    }
    db.transaction(() => {
      const lines = db.all('SELECT menu_item_id, quantity FROM order_items WHERE order_id = ?', order.id);
      for (const l of lines) {
        if (l.menu_item_id) db.run('UPDATE menu_items SET stock_qty = stock_qty + ? WHERE id = ? AND stock_qty IS NOT NULL', l.quantity, l.menu_item_id);
      }
      setStatus(order.id, 'Cancelled', req.user.id, (req.body && req.body.note) || 'Cancelled by customer');
      if (order.payment_status === 'Paid') db.run("UPDATE orders SET payment_status = 'Refunded' WHERE id = ?", order.id);
    })();
    notify(order.user_id, order.id, 'Order cancelled', `Order ${order.code} was cancelled.`);
    ok(res, orderWithItems(order.id));
  })
);

/* =====================================================================
 * Notification Module :: /api/notifications
 * =================================================================== */
router.get(
  '/notifications',
  authRequired,
  h((req, res) => {
    const rows = db.all(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY is_read, created_at DESC LIMIT 50',
      req.user.id
    );
    ok(res, {
      items: rows.map((r) => ({ ...r, is_read: asBool(r.is_read) })),
      unread: db.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0', req.user.id).n,
    });
  })
);

router.patch(
  '/notifications/:id/read',
  authRequired,
  h((req, res) => {
    const { changes } = db.run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
    if (!changes) return fail(res, 404, 'Notification not found');
    ok(res, { id: Number(req.params.id), is_read: true });
  })
);

router.post(
  '/notifications/read-all',
  authRequired,
  h((req, res) => {
    const { changes } = db.run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', req.user.id);
    ok(res, { updated: changes });
  })
);

/* =====================================================================
 * Admin Module :: /api/users
 * =================================================================== */
router.get(
  '/users',
  authRequired,
  requireRole('admin'),
  h((req, res) => {
    const { q, role } = req.query;
    const where = [];
    const params = [];
    if (q) {
      where.push('(name LIKE ? OR email LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (role && role !== 'all') {
      where.push('role = ?');
      params.push(role);
    }
    const rows = db.all(
      `SELECT u.id, u.name, u.email, u.role, u.department, u.phone, u.is_active, u.created_at,
              (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count,
              (SELECT COALESCE(SUM(o.total), 0) FROM orders o WHERE o.user_id = u.id AND o.status != 'Cancelled') AS lifetime_value
         FROM users u ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY u.role, u.name`,
      ...params
    );
    ok(res, rows.map((r) => ({ ...r, is_active: asBool(r.is_active), order_count: Number(r.order_count), lifetime_value: Number(r.lifetime_value) })));
  })
);

router.patch(
  '/users/:id',
  authRequired,
  requireRole('admin'),
  h((req, res) => {
    const target = db.get('SELECT * FROM users WHERE id = ?', req.params.id);
    if (!target) return fail(res, 404, 'User not found');
    const b = req.body || {};
    const role = ['student', 'staff', 'admin'].includes(b.role) ? b.role : target.role;
    const active = b.is_active === undefined ? target.is_active : Number(asBool(b.is_active));
    if (target.id === req.user.id && (role !== 'admin' || active === 0)) {
      return fail(res, 409, 'You cannot remove your own admin access.');
    }
    db.run(
      "UPDATE users SET name = ?, role = ?, department = ?, phone = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?",
      b.name ? String(b.name).trim() : target.name,
      role,
      b.department === undefined ? target.department : b.department,
      b.phone === undefined ? target.phone : b.phone,
      active,
      target.id
    );
    const updated = db.get(`SELECT ${require('./auth').PUBLIC_COLUMNS} FROM users WHERE id = ?`, target.id);
    ok(res, { ...updated, is_active: asBool(updated.is_active) });
  })
);

router.delete(
  '/users/:id',
  authRequired,
  requireRole('admin'),
  h((req, res) => {
    if (Number(req.params.id) === req.user.id) return fail(res, 409, 'You cannot delete your own account.');
    const { changes } = db.run('DELETE FROM users WHERE id = ?', req.params.id);
    if (!changes) return fail(res, 404, 'User not found');
    ok(res, { deleted: Number(req.params.id) });
  })
);

/* =====================================================================
 * Admin Module :: /api/reports
 * =================================================================== */
router.get(
  '/reports/summary',
  authRequired,
  requireRole('admin'),
  h((req, res) => {
    const days = Math.min(90, Math.max(1, Number(req.query.days || 14)));
    const since = `-${days - 1} days`;
    const valid = "o.status != 'Cancelled'";

    const totals = db.get(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue, COALESCE(AVG(total), 0) AS avg_order
         FROM orders o WHERE ${valid} AND date(placed_at) >= date('now', ?)`,
      since
    );
    const today = db.get(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue FROM orders o
        WHERE ${valid} AND date(placed_at) = date('now')`
    );
    const byStatus = db.all('SELECT status, COUNT(*) AS count FROM orders GROUP BY status');
    const byDay = db.all(
      `SELECT date(placed_at) AS day, COUNT(*) AS orders, ROUND(COALESCE(SUM(total), 0), 2) AS revenue
         FROM orders o WHERE ${valid} AND date(placed_at) >= date('now', ?)
        GROUP BY day ORDER BY day`,
      since
    );
    const topItems = db.all(
      `SELECT oi.item_name, SUM(oi.quantity) AS quantity, ROUND(SUM(oi.line_total), 2) AS revenue
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE ${valid} GROUP BY oi.item_name ORDER BY quantity DESC LIMIT 8`
    );
    const byCategory = db.all(
      `SELECT COALESCE(c.name, 'Uncategorised') AS category, SUM(oi.quantity) AS quantity, ROUND(SUM(oi.line_total), 2) AS revenue
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         LEFT JOIN menu_items m ON m.id = oi.menu_item_id
         LEFT JOIN categories c ON c.id = m.category_id
        WHERE ${valid} GROUP BY category ORDER BY revenue DESC`
    );
    const byPayment = db.all(
      `SELECT payment_method, COUNT(*) AS count, ROUND(COALESCE(SUM(total), 0), 2) AS revenue
         FROM orders o WHERE ${valid} GROUP BY payment_method`
    );
    const topCustomers = db.all(
      `SELECT u.name, u.email, COUNT(o.id) AS orders, ROUND(COALESCE(SUM(o.total), 0), 2) AS spent
         FROM orders o JOIN users u ON u.id = o.user_id
        WHERE ${valid} GROUP BY u.id ORDER BY spent DESC LIMIT 5`
    );

    ok(res, {
      range: { days, since },
      totals: { orders: Number(totals.orders), revenue: money(totals.revenue), avg_order: money(totals.avg_order) },
      today: { orders: Number(today.orders), revenue: money(today.revenue) },
      byStatus: byStatus.map((r) => ({ status: r.status, count: Number(r.count) })),
      byDay: byDay.map((r) => ({ day: r.day, orders: Number(r.orders), revenue: Number(r.revenue) })),
      topItems: topItems.map((r) => ({ name: r.item_name, quantity: Number(r.quantity), revenue: Number(r.revenue) })),
      byCategory: byCategory.map((r) => ({ category: r.category, quantity: Number(r.quantity), revenue: Number(r.revenue) })),
      byPayment: byPayment.map((r) => ({ method: r.payment_method, count: Number(r.count), revenue: Number(r.revenue) })),
      topCustomers: topCustomers.map((r) => ({ ...r, orders: Number(r.orders), spent: Number(r.spent) })),
    });
  })
);

module.exports = router;
