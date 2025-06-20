// db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Создаём/открываем базу данных (файл hypnodiary.db в корне проекта)
const dbPath = path.join(__dirname, 'hypnodiary.db');
const db = new sqlite3.Database(dbPath);

// Создаём таблицы, если их нет
db.serialize(() => {
  // Таблица пользователей
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password_hash TEXT
    );
  `);

  // Таблица сессий
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      date TEXT,
      surname TEXT,
      name TEXT,
      sessionType TEXT,      -- "Я провёл" или "Мне провели"
      therapyLink TEXT,
      feedbackLink TEXT,
      notes TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  // Если таблица sessions уже существовала, убедимся, что есть колонка user_id
  db.all('PRAGMA table_info(sessions);', (err, columns) => {
    if (err) return;
    const hasUserId = columns.some(col => col.name === 'user_id');
    if (!hasUserId) {
      db.run('ALTER TABLE sessions ADD COLUMN user_id INTEGER;');
    }
  });
});

module.exports = db;
