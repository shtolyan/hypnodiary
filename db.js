const { Pool } = require('pg');

// Подключение к PostgreSQL
const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/hypnodiary';

const pool = new Pool({
  connectionString,
  ssl: process.env.PGSSL ? { rejectUnauthorized: false } : false
});

// Создаём таблицы, если их нет
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE,
      password_hash TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      date TEXT,
      surname TEXT,
      name TEXT,
      sessionType TEXT,
      therapyLink TEXT,
      feedbackLink TEXT,
      notes TEXT
    );
  `);

  // Table used by connect-pg-simple for storing express sessions
  await pool.query(`
    CREATE TABLE IF NOT EXISTS session (
      sid varchar PRIMARY KEY,
      sess json NOT NULL,
      expire timestamp(6) NOT NULL
    );
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON session("expire")'
  );
}

init().catch(err => console.error('DB init error:', err));

module.exports = pool;
