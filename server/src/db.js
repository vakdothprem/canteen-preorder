'use strict';
/**
 * Tiny data-access layer over SQLite.
 *
 * Works with whichever driver is available:
 *   1. `better-sqlite3`  (native, fastest — preferred)
 *   2. `node:sqlite`     (built into Node >= 22.5, no install needed)
 *
 * Both expose the same positional-parameter API (`?`), so the rest of the
 * application never has to care which one is running.
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, '..', 'data', 'canteen.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

function tryRequire(id) {
  try {
    return require(id);
  } catch (_err) {
    return null;
  }
}

let driver;
let db;

const BetterSqlite = tryRequire('better-sqlite3');
if (BetterSqlite) {
  driver = 'better-sqlite3';
  db = new BetterSqlite(DB_PATH);
} else {
  const sqlite = tryRequire('node:sqlite');
  if (!sqlite) {
    throw new Error(
      'No SQLite driver found. Install better-sqlite3 (`npm i better-sqlite3`) ' +
        'or run on Node >= 22.5 which ships the built-in `node:sqlite` module.'
    );
  }
  driver = 'node:sqlite';
  db = new sqlite.DatabaseSync(DB_PATH);
}

// WAL keeps concurrent readers happy; foreign keys enforce the relations.
try { db.exec('PRAGMA journal_mode = WAL'); } catch (_e) { /* not fatal */ }
db.exec('PRAGMA foreign_keys = ON');

const normalize = (row) => (row === undefined ? undefined : row);

function all(sql, ...params) {
  return db.prepare(sql).all(...params);
}

function get(sql, ...params) {
  return normalize(db.prepare(sql).get(...params));
}

function run(sql, ...params) {
  const result = db.prepare(sql).run(...params);
  return {
    changes: Number(result.changes || 0),
    lastInsertRowid: Number(result.lastInsertRowid || 0),
  };
}

/** Run `fn` inside a transaction; rolls back if it throws. */
function transaction(fn) {
  return (...args) => {
    db.exec('BEGIN');
    try {
      const out = fn(...args);
      db.exec('COMMIT');
      return out;
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch (_e) { /* ignore */ }
      throw err;
    }
  };
}

/** Create every table / index if it does not exist yet. */
function ensureSchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(sql);
}

module.exports = { all, get, run, exec: (sql) => db.exec(sql), transaction, ensureSchema, driver, DB_PATH, raw: db };
