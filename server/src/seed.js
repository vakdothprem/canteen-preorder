'use strict';
/**
 * Seeds the database with demo users, a full canteen menu and ~2 weeks of
 * order history so every screen (menu, cart, kitchen board, reports) has
 * something real to show.
 *
 *   node src/seed.js           # add demo data (idempotent for users/menu)
 *   node src/seed.js --reset   # wipe everything first
 */

require('dotenv').config();
const db = require('./db');
const { hashPassword } = require('./auth');

db.ensureSchema();

const RESET = process.argv.includes('--reset');

if (RESET) {
  db.exec(`
    DELETE FROM notifications;
    DELETE FROM order_status_history;
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM menu_items;
    DELETE FROM categories;
    DELETE FROM users;
    DELETE FROM sqlite_sequence;
  `);
  console.log('· database cleared');
}

/* ---------------------------------------------------------------- users */
const users = [
  {
    name: 'Canteen Admin',
    email: process.env.SEED_ADMIN_EMAIL || 'admin@canteen.test',
    password: process.env.SEED_ADMIN_PASSWORD || 'Admin@123',
    role: 'admin',
    department: 'Canteen Administration',
    phone: '+91 98000 10001',
  },
  {
    name: 'Ravi Kumar',
    email: process.env.SEED_STAFF_EMAIL || 'staff@canteen.test',
    password: process.env.SEED_STAFF_PASSWORD || 'Staff@123',
    role: 'staff',
    department: 'Kitchen / Counter',
    phone: '+91 98000 10002',
  },
  {
    name: 'Ananya Sharma',
    email: process.env.SEED_STUDENT_EMAIL || 'student@canteen.test',
    password: process.env.SEED_STUDENT_PASSWORD || 'Student@123',
    role: 'student',
    department: 'Computer Science, Year 2',
    phone: '+91 98000 10003',
  },
  { name: 'Meera Nair', email: 'meera.nair@canteen.test', password: 'Student@123', role: 'student', department: 'Mechanical, Year 3' },
  { name: 'Arjun Patel', email: 'arjun.patel@canteen.test', password: 'Student@123', role: 'student', department: 'Electrical, Year 1' },
  { name: 'Prof. S. Iyer', email: 's.iyer@canteen.test', password: 'Staff@123', role: 'staff', department: 'Faculty — Physics' },
  { name: 'Fatima Sheikh', email: 'fatima.sheikh@canteen.test', password: 'Student@123', role: 'student', department: 'Civil, Year 4' },
];

const userIds = {};
for (const u of users) {
  const existing = db.get('SELECT id FROM users WHERE email = ?', u.email);
  if (existing) {
    userIds[u.email] = existing.id;
    continue;
  }
  const { lastInsertRowid } = db.run(
    'INSERT INTO users (name, email, password_hash, role, department, phone) VALUES (?, ?, ?, ?, ?, ?)',
    u.name,
    u.email,
    hashPassword(u.password),
    u.role,
    u.department || null,
    u.phone || null
  );
  userIds[u.email] = lastInsertRowid;
}
console.log(`· users ready (${Object.keys(userIds).length})`);

/* ----------------------------------------------------------- categories */
const categories = [
  ['Breakfast', 'Served 8:00 – 10:30 AM', 1],
  ['Main Course', 'Hot lunch plates and combos', 2],
  ['Snacks', 'Quick bites between lectures', 3],
  ['Beverages', 'Tea, coffee, juices and shakes', 4],
  ['Desserts', 'Something sweet to finish', 5],
];

const catIds = {};
for (const [name, description, sort_order] of categories) {
  let row = db.get('SELECT id FROM categories WHERE name = ?', name);
  if (!row) {
    const { lastInsertRowid } = db.run(
      'INSERT INTO categories (name, description, sort_order) VALUES (?, ?, ?)',
      name,
      description,
      sort_order
    );
    row = { id: lastInsertRowid };
  }
  catIds[name] = row.id;
}
console.log(`· categories ready (${Object.keys(catIds).length})`);

/* ------------------------------------------------------------ menu items */
const menu = [
  ['Breakfast', 'Masala Dosa', 45, 'Crisp rice crepe with spiced potato filling, sambar and chutney', '🥞', 1, 8, null],
  ['Breakfast', 'Idli Vada Combo', 40, 'Two steamed idlis + one medu vada with sambar and coconut chutney', '🍥', 1, 6, null],
  ['Breakfast', 'Poha Plate', 30, 'Flattened rice tossed with peanuts, curry leaves and lemon', '🍚', 1, 5, null],
  ['Breakfast', 'Aloo Paratha', 50, 'Two stuffed wheat parathas with curd and pickle', '🫓', 1, 10, null],
  ['Main Course', 'Veg Thali', 90, 'Rice, dal, two seasonal vegetables, roti, salad and papad', '🍛', 1, 12, 25],
  ['Main Course', 'Chicken Biryani', 140, 'Hyderabadi style dum biryani with raita and salan', '🍗', 0, 18, 15],
  ['Main Course', 'Paneer Butter Masala + Rice', 120, 'Creamy paneer curry with steamed basmati rice', '🧀', 1, 15, 20],
  ['Main Course', 'Rajma Chawal', 85, 'Kidney bean curry with jeera rice and onion salad', '🍲', 1, 12, null],
  ['Main Course', 'Egg Fried Rice', 95, 'Wok-tossed rice with egg, spring onion and soy', '🍳', 0, 12, null],
  ['Snacks', 'Veg Samosa (2 pcs)', 25, 'Crisp pastry filled with spiced potato and peas', '🥟', 1, 3, 60],
  ['Snacks', 'Paneer Wrap', 70, 'Whole-wheat wrap with grilled paneer, mint chutney and salad', '🌯', 1, 8, null],
  ['Snacks', 'Grilled Sandwich', 55, 'Triple-layer veg sandwich toasted with butter and cheese', '🥪', 1, 7, null],
  ['Snacks', 'French Fries', 60, 'Salted crispy fries with tomato ketchup', '🍟', 1, 6, 40],
  ['Snacks', 'Vada Pav', 30, 'Mumbai-style spicy potato fritter in a soft bun', '🍔', 1, 5, 35],
  ['Beverages', 'Filter Coffee', 20, 'Strong South-Indian filter coffee with milk', '☕', 1, 3, null],
  ['Beverages', 'Masala Chai', 15, 'Cardamom and ginger tea brewed fresh', '🫖', 1, 3, null],
  ['Beverages', 'Fresh Lime Soda', 35, 'Sweet or salted lime soda served chilled', '🥤', 1, 3, null],
  ['Beverages', 'Cold Coffee Shake', 60, 'Blended cold coffee with ice cream', '🧋', 1, 5, 20],
  ['Beverages', 'Mango Lassi', 55, 'Thick yoghurt smoothie with alphonso pulp', '🥛', 1, 5, 18],
  ['Desserts', 'Gulab Jamun (2 pcs)', 40, 'Warm milk dumplings soaked in cardamom syrup', '🍮', 1, 3, 30],
  ['Desserts', 'Gajar Halwa', 50, 'Slow-cooked carrot pudding with ghee and nuts', '🍰', 1, 4, 12],
  ['Desserts', 'Ice Cream Cup', 45, 'Vanilla / butterscotch / chocolate — ask at counter', '🍨', 1, 2, 24],
];

const menuIds = [];
for (const [cat, name, price, description, emoji, is_veg, prep, stock] of menu) {
  let row = db.get('SELECT id FROM menu_items WHERE name = ?', name);
  if (!row) {
    const { lastInsertRowid } = db.run(
      `INSERT INTO menu_items (name, category_id, price, description, image_emoji, is_veg, prep_minutes, stock_qty, is_available)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      name,
      catIds[cat],
      price,
      description,
      emoji,
      is_veg,
      prep,
      stock
    );
    row = { id: lastInsertRowid };
  }
  menuIds.push({ id: row.id, name, price, prep });
}
console.log(`· menu items ready (${menuIds.length})`);

/* ------------------------------------------------------------ demo orders */
const existingOrders = db.get('SELECT COUNT(*) AS n FROM orders').n;
if (existingOrders > 0 && !RESET) {
  console.log(`· ${existingOrders} orders already present — skipping order history`);
} else {
  // deterministic pseudo-random so the demo looks the same every time
  let seed = 20261013;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  const customerEmails = [
    'student@canteen.test',
    'meera.nair@canteen.test',
    'arjun.patel@canteen.test',
    'fatima.sheikh@canteen.test',
    's.iyer@canteen.test',
  ];
  const staffId = userIds['staff@canteen.test'];

  const historyFor = (orderId, from, to, byId) => {
    const chain = ['Pending', 'Confirmed', 'Preparing', 'Ready', 'Completed'];
    const upto = chain.indexOf(to);
    for (let i = 0; i <= upto; i++) {
      db.run(
        'INSERT INTO order_status_history (order_id, status, changed_by, note) VALUES (?, ?, ?, ?)',
        orderId,
        i === 0 ? 'Pending' : chain[i],
        i === 0 ? byId : staffId,
        i === 0 ? 'Order placed by customer' : `Status changed to ${chain[i]} by kitchen`
      );
    }
    void from;
  };

  let created = 0;
  for (let dayOffset = 13; dayOffset >= 0; dayOffset--) {
    const ordersToday = 2 + Math.floor(rnd() * 5);
    for (let k = 0; k < ordersToday; k++) {
      const email = pick(customerEmails);
      const userId = userIds[email];
      const lines = [];
      const lineCount = 1 + Math.floor(rnd() * 3);
      const used = new Set();
      for (let l = 0; l < lineCount; l++) {
        const item = pick(menuIds);
        if (used.has(item.id)) continue;
        used.add(item.id);
        lines.push({ item, qty: 1 + Math.floor(rnd() * 3) });
      }
      const subtotal = Math.round(lines.reduce((s, l) => s + l.item.price * l.qty, 0) * 100) / 100;
      const total = subtotal;
      const method = rnd() > 0.55 ? 'Online' : 'Cash on Pickup';

      // Older days are finished; today keeps a live kitchen board.
      let status = 'Completed';
      if (dayOffset === 0) status = pick(['Pending', 'Pending', 'Confirmed', 'Preparing', 'Ready', 'Completed']);
      else if (dayOffset === 1) status = rnd() > 0.75 ? 'Cancelled' : 'Completed';

      const hh = 8 + Math.floor(rnd() * 9);
      const mm = Math.floor(rnd() * 60);
      const placedAt = `datetime('now', '-${dayOffset} days', '-${Math.floor(rnd() * 120)} minutes')`;

      const { lastInsertRowid: orderId } = db.run(
        `INSERT INTO orders (code, user_id, status, payment_method, payment_status, pickup_time, notes, subtotal, service_fee, total, placed_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ${placedAt}, ${placedAt})`,
        `ORD-${String(26)}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${String(1000 + created).slice(-4)}`,
        userId,
        status,
        method,
        status === 'Cancelled' ? 'Refunded' : status === 'Completed' && method === 'Cash on Pickup' ? 'Paid' : method === 'Online' ? 'Paid' : 'Unpaid',
        `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
        rnd() > 0.7 ? 'Less spicy please' : null,
        subtotal,
        total
      );

      for (const l of lines) {
        db.run(
          'INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price, quantity, line_total) VALUES (?, ?, ?, ?, ?, ?)',
          orderId,
          l.item.id,
          l.item.name,
          l.item.price,
          l.qty,
          Math.round(l.item.price * l.qty * 100) / 100
        );
      }
      historyFor(orderId, 'Pending', status, userId);
      if (status === 'Ready') {
        db.run(
          'INSERT INTO notifications (user_id, order_id, title, message) VALUES (?, ?, ?, ?)',
          userId,
          orderId,
          'Ready for pickup!',
          'Your pre-order is ready at the canteen counter.'
        );
      }
      created++;
    }
  }
  console.log(`· demo orders created (${created})`);
}

/* ------------------------------------------------------------ welcome note */
for (const email of Object.keys(userIds)) {
  const u = db.get('SELECT id, name FROM users WHERE email = ?', email);
  const has = db.get('SELECT id FROM notifications WHERE user_id = ? LIMIT 1', u.id);
  if (!has) {
    db.run(
      'INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)',
      u.id,
      'Welcome to the canteen!',
      `Hi ${u.name}, browse today's menu and pre-order to skip the queue.`
    );
  }
}

const summary = {
  driver: db.driver,
  users: db.get('SELECT COUNT(*) AS n FROM users').n,
  categories: db.get('SELECT COUNT(*) AS n FROM categories').n,
  menu_items: db.get('SELECT COUNT(*) AS n FROM menu_items').n,
  orders: db.get('SELECT COUNT(*) AS n FROM orders').n,
  revenue: db.get("SELECT ROUND(COALESCE(SUM(total),0),2) AS n FROM orders WHERE status != 'Cancelled'").n,
};

console.log('\n✅ Seed complete');
console.table(summary);
console.log('\nDemo logins');
console.log('  admin   admin@canteen.test    / Admin@123');
console.log('  staff   staff@canteen.test    / Staff@123');
console.log('  student student@canteen.test  / Student@123\n');
