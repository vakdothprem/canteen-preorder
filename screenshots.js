/* Renders the running application in a real browser and saves screenshots.
   Usage:  node screenshots.js   (API + built frontend must be on :4000) */
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://localhost:4000';
const API = `${BASE}/api`;
const OUT = __dirname;

async function token(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  return json.data.token;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  page error:', e.message));

  const shot = async (file, full = false) => {
    await page.screenshot({ path: `${OUT}/${file}`, fullPage: full });
    console.log(`  📸 ${file}`);
  };

  const asUser = async (tok, path, file, full = false) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('canteen.token', t), tok);
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await shot(file, full);
  };

  const student = await token('student@canteen.test', 'Student@123');
  const staff = await token('staff@canteen.test', 'Staff@123');
  const admin = await token('admin@canteen.test', 'Admin@123');

  console.log('capturing…');

  // 1. login screen (signed out)
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await shot('01-login.png');

  // 2. menu
  await asUser(student, '/', '02-menu.png', true);

  // 3. cart drawer with items
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  for (const label of ['Add to cart']) {
    const buttons = await page.locator(`button:has-text("${label}")`).all();
    for (let i = 0; i < Math.min(3, buttons.length); i++) {
      await buttons[i].click();
      await page.waitForTimeout(250);
    }
  }
  await page.locator('.cart-btn').click();
  await page.waitForTimeout(700);
  await shot('03-cart.png');

  // 4. student order history
  await asUser(student, '/orders', '04-my-orders.png', true);

  // 5. kitchen board
  await asUser(staff, '/kitchen', '05-kitchen-board.png');

  // 6. all orders (staff)
  await asUser(staff, '/queue', '06-all-orders.png', true);

  // 7. admin menu management
  await asUser(admin, '/admin', '07-admin-menu.png');

  // 8. reports
  await asUser(admin, '/reports', '08-reports.png', true);

  await browser.close();
  console.log('done');
})().catch((e) => {
  console.error('screenshot run failed:', e.message);
  process.exit(1);
});
