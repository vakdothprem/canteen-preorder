'use strict';
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const db = require('./db');
const routes = require('./routes');

db.ensureSchema();

// Auto-seed demo data if database has no users (e.g. fresh Render deployment)
try {
  const userCount = db.get('SELECT COUNT(*) AS count FROM users');
  if (!userCount || Number(userCount.count) === 0) {
    console.log('Database has no users — auto-seeding demo accounts and menu...');
    require('./seed');
  }
} catch (seedErr) {
  console.error('[seed warning]', seedErr.message);
}

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));

app.use((req, _res, next) => {
  if (req.path !== '/api/health' && req.path !== '/health') {
    console.log(`${new Date().toISOString()}  ${req.method} ${req.originalUrl}`);
  }
  next();
});

// Health check endpoint aliases
app.get('/health', (_req, res) => res.redirect('/api/health'));

app.use('/api', routes);

// ---- serve the built React frontend when it exists -------------------------
const candidateDistDirs = [
  path.resolve(__dirname, '..', 'public'),
  path.resolve(__dirname, '..', '..', 'web', 'dist'),
  path.resolve(__dirname, '..', 'dist'),
  path.resolve(process.cwd(), 'web', 'dist'),
  path.resolve(process.cwd(), 'public'),
  path.resolve(process.cwd(), 'dist'),
];
const distDir = candidateDistDirs.find((dir) => fs.existsSync(path.join(dir, 'index.html')));

if (distDir) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
} else {
  app.get('/', (_req, res) =>
    res
      .status(200)
      .send(
        '<h1>Canteen Pre-Order API</h1><p>API is running on <code>/api</code>.</p>' +
          '<p>The React frontend has not been built yet — run <code>npm run build</code> in <code>web/</code>.</p>'
      )
  );
}

app.use((_req, res) => res.status(404).json({ success: false, error: 'Route not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  const status = err.status || 500;
  res.status(status).json({ success: false, error: err.message || 'Internal server error' });
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  Canteen Pre-Order API  ->  http://0.0.0.0:${PORT}`);
    console.log(`  SQLite driver: ${db.driver}   database: ${db.DB_PATH}\n`);
  });
}

module.exports = app;
