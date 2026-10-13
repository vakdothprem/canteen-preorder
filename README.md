# 🍲 Canteen Pre-Order Management System

A complete, working full-stack web application built directly from the project
specification *“Canteen Pre-Order Management System — Abstract and System Flow”*.
Students and staff browse the canteen menu, pre-order food with a pickup time,
and track the order from **Pending → Confirmed → Preparing → Ready → Completed**,
while canteen staff run a live kitchen board and administrators manage the menu,
users, payments and reports.

```
React (Vite)  ──REST/JSON──►  Node.js + Express  ──SQL──►  SQLite
   frontend                       backend                    database
```

---

## 1. Specification coverage

| Spec requirement | Where it lives |
|---|---|
| **User Module** — registration, login, menu browsing, order placement | `server/src/routes.js` → `/api/auth/*`, `web/src/pages/Auth.jsx`, `web/src/pages/Menu.jsx` |
| **Menu Management** — add / update / remove items, prices, availability | `/api/menu`, `/api/categories`, `web/src/pages/Admin.jsx` (Menu + Categories tabs) |
| **Order Management** — receive orders, track each order's status | `/api/orders`, `/api/orders/board`, `web/src/pages/Orders.jsx`, `web/src/pages/Kitchen.jsx` |
| **Payment Module** — cash on pickup or online, payment status | `orders.payment_method` / `orders.payment_status`, `/api/orders/:id/payment` |
| **Notification Module** — notify customers on confirmation / ready | `notifications` table, `/api/notifications/*`, navbar 🔔 bell + Profile page |
| **Admin Module** — manage users, menu, orders and reports | `/api/users`, `/api/reports/summary`, `web/src/pages/Admin.jsx`, `web/src/pages/Reports.jsx` |
| **Workflow** — login → menu → pre-order → confirm → prepare → status update → pickup | Enforced server-side by the `NEXT_STATUS` state machine in `routes.js` |
| **Suggested tech** — HTML/CSS/JS frontend, JS/Python backend, MySQL database, web platform | React + hand-written CSS, Node/Express, SQLite (MySQL-compatible schema; see §7), runs in any browser |

### System flow implemented
```
START → open system → login/register → view menu & prices → select items + quantity
      → review cart → confirm order (total calculated & saved) → order sent to canteen
      → staff accepts & prepares → status updated to READY (customer notified)
      → customer collects food → order COMPLETED → END
```

---

## 2. Project structure

```
canteen/
├── server/                      # Node.js + Express + SQLite backend
│   ├── src/
│   │   ├── index.js             # HTTP server, static hosting of the built frontend
│   │   ├── routes.js            # every REST endpoint (all six modules)
│   │   ├── db.js                # SQLite access layer (better-sqlite3 or node:sqlite)
│   │   ├── schema.sql           # full relational schema + indexes + constraints
│   │   ├── auth.js              # scrypt password hashing + HMAC-signed tokens + RBAC
│   │   ├── seed.js              # demo users, 22-dish menu, ~2 weeks of order history
│   │   └── smoke-test.js        # 50-assertion end-to-end API test
│   ├── package.json
│   └── .env.example
└── web/                         # React (Vite) single-page frontend
    ├── src/
    │   ├── App.jsx              # routing + role-guarded routes
    │   ├── api.js               # fetch wrapper, token storage, formatters
    │   ├── state.jsx            # auth / cart / toast providers (context)
    │   ├── components.jsx       # navbar, notification bell, charts, modal, badges
    │   ├── styles.css           # complete responsive design system
    │   └── pages/               # Auth, Menu, Orders, Kitchen, Admin, Reports, Profile
    ├── index.html
    └── vite.config.js           # dev proxy /api → localhost:4000
```

---

## 3. Run it

### Backend (port 4000)
```bash
cd server
cp .env.example .env
npm install
npm run seed        # creates data/canteen.db with demo data (use `npm run reset` to wipe first)
npm start           # → http://localhost:4000
```

### Frontend (port 5173, development)
```bash
cd web
npm install
npm run dev         # → http://localhost:5173  (proxies /api to the backend)
```

### Single-port production build
```bash
cd web && npm run build      # emits web/dist
cd ../server && npm start    # Express now serves the built SPA at http://localhost:4000
```

### Verify the API
```bash
cd server && npm run smoke   # 50 assertions across every endpoint
```

### Demo logins

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@canteen.test` | `Admin@123` |
| Kitchen staff | `staff@canteen.test` | `Staff@123` |
| Student | `student@canteen.test` | `Student@123` |

---

## 4. Database schema

```
users ──┬──< orders ──< order_items >── menu_items >── categories
        │        └──< order_status_history
        └──< notifications >── orders
```

| Table | Purpose | Key columns |
|---|---|---|
| `users` | User Module | `name, email UNIQUE, password_hash, role (student\|staff\|admin), department, is_active` |
| `categories` | Menu grouping | `name UNIQUE, description, sort_order, is_active` |
| `menu_items` | Menu Management | `name, price, category_id, is_veg, prep_minutes, stock_qty (NULL = unlimited), is_available` |
| `orders` | Order Management | `code UNIQUE, user_id, status, payment_method, payment_status, pickup_time, notes, subtotal, service_fee, total` |
| `order_items` | Order lines (price snapshot) | `order_id, menu_item_id, item_name, unit_price, quantity, line_total` |
| `order_status_history` | Audit trail of every transition | `order_id, status, changed_by, note, created_at` |
| `notifications` | Notification Module | `user_id, order_id, title, message, is_read` |

Integrity is enforced in the database itself: `CHECK` constraints on every enum
and non-negative money column, `FOREIGN KEY` cascades, and indexes on
`orders(user_id)`, `orders(status)`, `orders(placed_at)`, `menu_items(category_id)`
and `notifications(user_id, is_read)`.

---

## 5. REST API reference

| Method | Endpoint | Role | Description |
|---|---|---|---|
| GET | `/api/health` | public | Liveness + active SQLite driver |
| POST | `/api/auth/register` | public | Create a student/staff account, returns token |
| POST | `/api/auth/login` | public | Email + password login |
| GET | `/api/auth/me` | any | Current profile |
| PATCH | `/api/auth/me` | any | Update name / department / phone |
| GET | `/api/categories` | public | List categories |
| POST/PUT/DELETE | `/api/categories[/:id]` | admin | Manage categories |
| GET | `/api/menu` | public | List/filter items (`category, q, veg, maxPrice, includeUnavailable`) |
| GET | `/api/menu/:id` | public | Single item |
| POST/PUT/DELETE | `/api/menu[/:id]` | admin | Create / update / delete an item |
| PATCH | `/api/menu/:id/availability` | admin, staff | Mark sold out / back on |
| POST | `/api/orders` | any signed-in | Place a pre-order (server recalculates every price) |
| GET | `/api/orders` | any | Own orders; staff/admin see all (`status, q, from, to, page, limit`) |
| GET | `/api/orders/board` | admin, staff | Live kanban grouped by status |
| GET | `/api/orders/:id` | owner or staff | Order + items + status timeline |
| PATCH | `/api/orders/:id/status` | admin, staff | Advance status (validated state machine) |
| PATCH | `/api/orders/:id/payment` | admin, staff | Set payment status / method |
| POST | `/api/orders/:id/cancel` | owner or staff | Cancel + restore stock + refund flag |
| GET | `/api/notifications` | any | Own notifications + unread count |
| PATCH | `/api/notifications/:id/read` | any | Mark one read |
| POST | `/api/notifications/read-all` | any | Mark all read |
| GET | `/api/users` | admin | Users with order count + lifetime value |
| PATCH/DELETE | `/api/users/:id` | admin | Change role / enable-disable / delete |
| GET | `/api/reports/summary?days=14` | admin | Revenue, daily series, top items, categories, payment mix, top customers |

**Security:** passwords are hashed with `scrypt` (per-user salt), sessions use
HMAC-SHA256 signed tokens verified in constant time, and every route is guarded by
`authRequired` / `requireRole(...)`. Students cannot read other customers' orders,
staff cannot touch users or reports, and admins cannot strip their own admin rights.

---

## 6. Frontend screens

| Route | Screen | Highlights |
|---|---|---|
| `/login`, `/register` | Sign in / create account | One-click demo-account chips, spec workflow shown alongside |
| `/` | **Menu** | Search, category chips, veg filter, sorting, live stock badges, slide-out cart with pickup time + payment method + notes |
| `/orders` | **My orders** | Status tabs, search, pagination, per-order detail modal with itemised bill and status timeline |
| `/kitchen` | **Kitchen board** | 4-column kanban (New → Accepted → Preparing → Ready) with one-tap advance, 15 s auto-refresh, ticket view |
| `/queue` | **All orders** | Every customer order for staff, filterable by status |
| `/admin` | **Admin** | Menu items CRUD, categories, user role management and account enable/disable |
| `/reports` | **Reports** | Revenue KPIs, daily revenue bar chart, best-selling items, revenue by category, status and payment breakdowns, top customers |
| `/profile` | **Profile** | Edit details, full notification inbox |

---

## 7. Notes & extension points

* **SQLite by default, MySQL-ready.** The schema in `server/src/schema.sql` uses
  portable SQL. To move to MySQL: swap `db.js` for a `mysql2` pool, replace
  `INTEGER PRIMARY KEY AUTOINCREMENT` with `INT AUTO_INCREMENT PRIMARY KEY`, and
  `datetime('now')` with `NOW()`.
* **Driver auto-detection.** `db.js` prefers `better-sqlite3` and falls back to
  Node's built-in `node:sqlite` (Node ≥ 22.5), so the project runs with zero native
  compilation if you prefer.
* **Online payment** is modelled as a payment method + status on the order; wire
  a gateway (Razorpay/Stripe) into `POST /api/orders` and flip
  `payment_status` to `Paid` from the webhook to complete the flow.
* **Notifications** are stored in-app and surfaced through the bell + Profile
  page. Swap `notify()` in `routes.js` for an SMTP/SMS/WhatsApp sender to add
  real delivery — every notification is already funnelled through that one helper.
* **Service fee** is configurable with `SERVICE_FEE_PERCENT` in `.env` (0 by default).

---

## 8. Deployment on Render

This project includes a `render.yaml` blueprint ready for deployment on [Render](https://render.com).

### Option A — Separate Services (Current Setup)
1. **Backend Web Service (`canteen-preorder-api`)**:
   - **Environment**: Node
   - **Build Command**: `npm run build`
   - **Start Command**: `npm run start`
   - **Health Check Path**: `/api/health`
   - **Environment Variables**:
     - `NODE_VERSION`: `22`
     - `PORT`: `10000`
     - `CORS_ORIGIN`: `*`
     - `JWT_SECRET`: (Generate random string)
2. **Frontend Static Site (`canteen-preorder-frontend`)**:
   - **Build Command**: `cd web && npm install && npm run build`
   - **Publish Directory**: `./web/dist`
   - **Environment Variables**:
     - `VITE_API_URL`: `https://canteen-preorder-api.onrender.com`
   - **Routes (Rewrite rule for client routing)**:
     - Type: `Rewrite`
     - Source: `/*`
     - Destination: `/index.html`

### Option B — Single Fullstack Service
Deploy as a single Node Web Service using the root `npm run build` and `npm run start`. The Express server automatically serves the built frontend (`web/dist`) and proxies all client routes to `index.html`.
