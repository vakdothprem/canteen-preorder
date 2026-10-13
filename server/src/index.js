'use strict';
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const db = require('./db');
const routes = require('./routes');

db.ensureSchema();

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));

app.use((req, _res, next) => {
  if (req.path !== '/api/health') {
    console.log(`${new Date().toISOString()}  ${req.method} ${req.originalUrl}`);
  }
  next();
});

app.use('/api', routes);

// ---- serve the built React frontend (web/dist) when it exists -------------
const distDir = path.join(__dirname, '..', '..', 'web', 'dist');
if (fs.existsSync(path.join(distDir, 'index.html'))) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
} else {
  app.get('/', (_res, res) =>
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
  app.listen(PORT, () => {
    console.log(`\n  Canteen Pre-Order API  ->  http://localhost:${PORT}`);
    console.log(`  SQLite driver: ${db.driver}   database: ${db.DB_PATH}\n`);
  });
}

module.exports = app;
