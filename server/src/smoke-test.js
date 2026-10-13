'use strict';
/**
 * End-to-end API smoke test.
 *
 *   1. start the API        ->  node src/index.js
 *   2. run this file        ->  node src/smoke-test.js
 *
 * Exercises every module in the specification: registration/login (User),
 * menu CRUD (Menu Management), the full order lifecycle including payment
 * and cancellation (Order + Payment), notifications (Notification) and the
 * admin user list + reports (Admin).
 */

const BASE = process.env.SMOKE_BASE || 'http://localhost:4000/api';

let pass = 0;
let fail = 0;

async function call(method, path, { body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch (_e) {
    /* ignore */
  }
  return { status: res.status, ok: res.ok, json };
}

function check(label, condition, extra) {
  if (condition) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    fail++;
    console.log(`  ❌ ${label}${extra ? ` → ${JSON.stringify(extra)}` : ''}`);
  }
}

(async () => {
  console.log(`\nAPI smoke test → ${BASE}\n`);

  /* ---------------------------------------------------- health + public */
  let r = await call('GET', '/health');
  check('GET /health returns ok', r.ok && r.json.data.status === 'ok', r.json);

  r = await call('GET', '/menu');
  check('GET /menu lists seeded dishes', r.ok && Array.isArray(r.json.data) && r.json.data.length > 0, r.status);
  const firstItem = r.ok ? r.json.data[0] : null;

  r = await call('GET', '/categories');
  check('GET /categories lists categories', r.ok && r.json.data.length >= 5, r.status);

  /* ------------------------------------------------- User Module (auth) */
  const unique = Date.now();
  const newUser = { name: 'Smoke Tester', email: `smoke${unique}@canteen.test`, password: 'Test@1234', department: 'QA' };
  r = await call('POST', '/auth/register', { body: newUser });
  check('POST /auth/register creates a student account', r.status === 201 && r.json.data.token, r.json);
  const studentToken = r.json.data && r.json.data.token;
  const studentId = r.json.data && r.json.data.user.id;

  r = await call('POST', '/auth/register', { body: newUser });
  check('duplicate email is rejected with 409', r.status === 409, r.status);

  r = await call('POST', '/auth/login', { body: { email: newUser.email, password: 'wrong-password' } });
  check('wrong password is rejected with 401', r.status === 401, r.status);

  r = await call('POST', '/auth/login', { body: { email: 'admin@canteen.test', password: 'Admin@123' } });
  check('admin login succeeds', r.ok && r.json.data.user.role === 'admin', r.json);
  const adminToken = r.json.data && r.json.data.token;

  r = await call('POST', '/auth/login', { body: { email: 'staff@canteen.test', password: 'Staff@123' } });
  check('staff login succeeds', r.ok && r.json.data.user.role === 'staff', r.json);
  const staffToken = r.json.data && r.json.data.token;

  r = await call('GET', '/auth/me', { token: studentToken });
  check('GET /auth/me returns the signed-in user', r.ok && r.json.data.id === studentId, r.status);

  r = await call('GET', '/auth/me');
  check('GET /auth/me without a token is 401', r.status === 401, r.status);

  r = await call('PATCH', '/auth/me', { token: studentToken, body: { phone: '+91 90000 00000' } });
  check('PATCH /auth/me updates the profile', r.ok && r.json.data.phone === '+91 90000 00000', r.json);

  /* ------------------------------------------- Menu Management (admin) */
  const catName = `Smoke Category ${unique}`;
  r = await call('POST', '/categories', { token: adminToken, body: { name: catName } });
  check('POST /categories creates a category', r.status === 201, r.json);
  const categoryId = r.json.data && r.json.data.id;

  r = await call('POST', '/categories', { token: studentToken, body: { name: 'Should fail' } });
  check('student cannot create a category (403)', r.status === 403, r.status);

  const itemName = `Smoke Dish ${unique}`;
  r = await call('POST', '/menu', {
    token: adminToken,
    body: { name: itemName, price: 99.5, category_id: categoryId, description: 'created by smoke test', prep_minutes: 7, stock_qty: 5 },
  });
  check('POST /menu creates a menu item', r.status === 201 && r.json.data.price === 99.5, r.json);
  const itemId = r.json.data && r.json.data.id;

  r = await call('PUT', `/menu/${itemId}`, { token: adminToken, body: { price: 120 } });
  check('PUT /menu/:id updates the price', r.ok && r.json.data.price === 120, r.json);

  r = await call('PATCH', `/menu/${itemId}/availability`, { token: staffToken, body: { is_available: false } });
  check('PATCH /menu/:id/availability hides the item', r.ok && r.json.data.is_available === false, r.json);
  await call('PATCH', `/menu/${itemId}/availability`, { token: staffToken, body: { is_available: true } });

  r = await call('GET', `/menu?q=${encodeURIComponent(itemName)}`);
  check('GET /menu?q= searches by name', r.ok && r.json.data.length === 1, r.json);

  /* -------------------------------- Order Management + Payment Module */
  r = await call('POST', '/orders', {
    token: studentToken,
    body: {
      items: [{ menu_item_id: firstItem.id, quantity: 2 }, { menu_item_id: itemId, quantity: 1 }],
      pickup_time: '13:30',
      notes: 'smoke test order',
      payment_method: 'Online',
    },
  });
  check('POST /orders places a pre-order', r.status === 201 && r.json.data.status === 'Pending', r.json);
  const orderId = r.json.data && r.json.data.id;
  const orderCode = r.json.data && r.json.data.code;
  check(
    'order total is calculated server-side',
    r.json.data && r.json.data.subtotal === Math.round((firstItem.price * 2 + 120) * 100) / 100,
    r.json.data && r.json.data.subtotal
  );

  r = await call('POST', '/orders', { token: studentToken, body: { items: [] } });
  check('empty cart is rejected with 400', r.status === 400, r.status);

  r = await call('POST', '/orders', { token: studentToken, body: { items: [{ menu_item_id: itemId, quantity: 40 }] } });
  check('quantity above stock is rejected with 409', r.status === 409, r.status);

  r = await call('GET', '/orders?mine=true', { token: studentToken });
  check('GET /orders returns the customer order list', r.ok && r.json.data.total >= 1, r.json);

  r = await call('GET', '/orders?status=Pending', { token: staffToken });
  check('GET /orders?status=Pending works for staff', r.ok && r.json.data.items.length >= 1, r.json);

  r = await call('GET', `/orders/${orderId}`, { token: staffToken });
  check('GET /orders/:id returns items + history', r.ok && r.json.data.items.length === 2 && r.json.data.history.length === 1, r.status);

  // full lifecycle: Pending -> Confirmed -> Preparing -> Ready -> Completed
  for (const status of ['Confirmed', 'Preparing', 'Ready', 'Completed']) {
    r = await call('PATCH', `/orders/${orderId}/status`, { token: staffToken, body: { status } });
    check(`PATCH /orders/:id/status → ${status}`, r.ok && r.json.data.status === status, r.json.error || r.status);
  }

  r = await call('PATCH', `/orders/${orderId}/status`, { token: staffToken, body: { status: 'Pending' } });
  check('invalid status transition is rejected (409)', r.status === 409, r.status);

  r = await call('PATCH', `/orders/${orderId}/status`, { token: studentToken, body: { status: 'Preparing' } });
  check('student cannot change order status (403)', r.status === 403, r.status);

  r = await call('GET', `/orders/${orderId}`, { token: staffToken });
  check('status timeline recorded every step', r.ok && r.json.data.history.length === 5, r.json.data && r.json.data.history.length);

  // payment
  r = await call('POST', '/orders', { token: studentToken, body: { items: [{ menu_item_id: itemId, quantity: 1 }], payment_method: 'Cash on Pickup' } });
  const order2 = r.json.data.id;
  r = await call('PATCH', `/orders/${order2}/payment`, { token: staffToken, body: { payment_status: 'Paid' } });
  check('PATCH /orders/:id/payment records payment', r.ok && r.json.data.payment_status === 'Paid', r.json);

  // cancellation restores stock
  const before = (await call('GET', `/menu/${itemId}`)).json.data.stock_qty;
  r = await call('POST', `/orders/${order2}/cancel`, { token: studentToken, body: {} });
  const after = (await call('GET', `/menu/${itemId}`)).json.data.stock_qty;
  check('POST /orders/:id/cancel cancels and restores stock', r.ok && r.json.data.status === 'Cancelled' && after === before + 1, { before, after });

  /* ------------------------------------------------- kitchen board */
  r = await call('GET', '/orders/board', { token: staffToken });
  check('GET /orders/board returns kanban columns', r.ok && r.json.data.Pending !== undefined && r.json.data.Ready !== undefined, r.status);

  r = await call('GET', '/orders/board', { token: studentToken });
  check('kitchen board is staff-only (403)', r.status === 403, r.status);

  /* --------------------------------------------- Notification Module */
  r = await call('GET', '/notifications', { token: studentToken });
  check('GET /notifications returns customer alerts', r.ok && r.json.data.items.length >= 1 && r.json.data.unread >= 1, r.json);

  const notifId = r.json.data.items[0].id;
  r = await call('PATCH', `/notifications/${notifId}/read`, { token: studentToken });
  check('PATCH /notifications/:id/read marks one read', r.ok && r.json.data.is_read === true, r.json);

  r = await call('POST', '/notifications/read-all', { token: studentToken });
  check('POST /notifications/read-all marks all read', r.ok, r.status);

  /* ----------------------------------------------------- Admin Module */
  r = await call('GET', '/users', { token: adminToken });
  check('GET /users lists users with stats', r.ok && r.json.data.length >= 5 && r.json.data[0].order_count !== undefined, r.status);

  r = await call('GET', '/users', { token: staffToken });
  check('staff cannot list users (403)', r.status === 403, r.status);

  r = await call('PATCH', `/users/${studentId}`, { token: adminToken, body: { role: 'staff' } });
  check('PATCH /users/:id promotes a user', r.ok && r.json.data.role === 'staff', r.json);
  await call('PATCH', `/users/${studentId}`, { token: adminToken, body: { role: 'student' } });

  r = await call('PATCH', `/users/${studentId}`, { token: adminToken, body: { is_active: false } });
  check('PATCH /users/:id can disable an account', r.ok && r.json.data.is_active === false, r.json);
  await call('PATCH', `/users/${studentId}`, { token: adminToken, body: { is_active: true } });

  /* ---------------------------------------------------------- reports */
  r = await call('GET', '/reports/summary?days=14', { token: adminToken });
  check(
    'GET /reports/summary returns totals, charts and top items',
    r.ok && r.json.data.totals.revenue > 0 && r.json.data.byDay.length > 0 && r.json.data.topItems.length > 0,
    r.status
  );

  r = await call('GET', '/reports/summary', { token: studentToken });
  check('reports are admin-only (403)', r.status === 403, r.status);

  /* ------------------------------------------------------------ cleanup */
  r = await call('DELETE', `/menu/${itemId}`, { token: adminToken });
  check('DELETE /menu/:id removes the item', r.ok, r.status);
  r = await call('DELETE', `/categories/${categoryId}`, { token: adminToken });
  check('DELETE /categories/:id removes the category', r.ok, r.status);
  r = await call('DELETE', `/users/${studentId}`, { token: adminToken });
  check('DELETE /users/:id removes the test user', r.ok, r.status);

  console.log(`\n${fail === 0 ? '✅ ALL PASSED' : '⚠️  SOME CHECKS FAILED'} — ${pass} passed, ${fail} failed`);
  console.log(`(order ${orderCode} was exercised through the whole lifecycle)\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  console.error('\nSmoke test crashed:', err.message);
  process.exit(1);
});
