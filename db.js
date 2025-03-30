// db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Создаём/открываем базу данных (файл hypnodiary.db в корне проекта)
const dbPath = path.join(__dirname, 'hypnodiary.db');
const db = new sqlite3.Database(dbPath);

// Создаём таблицу, если её нет
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      surname TEXT,
      name TEXT,
      sessionType TEXT,      -- "Я провёл" или "Мне провели"
      therapyLink TEXT,
      feedbackLink TEXT,
      notes TEXT
    );
  `);
});

module.exports = db;
