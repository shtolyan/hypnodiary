// app.js
const express = require('express');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcryptjs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Указываем, что будем рендерить с помощью ejs
app.set('view engine', 'ejs');

// Middleware для чтения данных формы (urlencoded)
app.use(bodyParser.urlencoded({ extended: true }));

// Поддержка методов PUT и DELETE через параметр _method
app.use(methodOverride('_method'));

// Папка, в которой лежат статические файлы (css, картинки)
app.use(express.static('public'));

// Настройка express-session с хранилищем SQLite
const sessionSecret = process.env.SESSION_SECRET || 'keyboard cat';
app.use(
  session({
    store: new SQLiteStore({ db: 'sessions.sqlite' }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false
  })
);

// Делаем информацию об авторизации доступной во всех шаблонах
app.use((req, res, next) => {
  res.locals.isAuthenticated = !!req.session.userId;
  next();
});

// Middleware проверки авторизации
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
}

// Применяем ко всем маршрутам /sessions*
app.use('/sessions', requireAuth);

// Страница регистрации
app.get('/register', (req, res) => {
  res.render('auth/register');
});

app.post('/register', (req, res) => {
  const { username, password } = req.body;
  const passwordHash = bcrypt.hashSync(password, 10);
  db.run(
    `INSERT INTO users (username, password_hash) VALUES (?, ?)`,
    [username, passwordHash],
    function (err) {
      if (err) {
        return res.send('Ошибка регистрации');
      }
      req.session.userId = this.lastID;
      res.redirect('/sessions');
    }
  );
});

// Страница входа
app.get('/login', (req, res) => {
  res.render('auth/login');
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get(
    `SELECT * FROM users WHERE username = ?`,
    [username],
    (err, user) => {
      if (err || !user) {
        return res.send('Неверные учётные данные');
      }
      if (!bcrypt.compareSync(password, user.password_hash)) {
        return res.send('Неверные учётные данные');
      }
      req.session.userId = user.id;
      res.redirect('/sessions');
    }
  );
});

// Выход
app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// --- Маршруты ---

// Главная (можно сделать какую-то приветственную страницу или 
// сразу редирект на /sessions)
app.get('/', (req, res) => {
  res.redirect('/sessions');
});

// 1) Список всех сеансов
app.get('/sessions', (req, res) => {
  db.all(
    `SELECT * FROM sessions WHERE user_id = ? ORDER BY id DESC`,
    [req.session.userId],
    (err, rows) => {
      if (err) {
        return res.send('Ошибка запроса к базе данных');
      }

    // Подсчитаем статистику
    const total = rows.length;
    const iGave = rows.filter(r => r.sessionType === 'Я провёл').length;
    const iReceived = rows.filter(r => r.sessionType === 'Мне провели').length;

    res.render('sessions/list', { sessions: rows, total, iGave, iReceived });
  });
});

// 2) Форма для добавления нового сеанса
app.get('/sessions/new', (req, res) => {
  res.render('sessions/new');
});

// 3) Обработка формы создания сеанса
app.post('/sessions', (req, res) => {
  let { date, surname, name, sessionType, therapyLink, feedbackLink, notes } = req.body;

  // Преобразуем ссылки, чтобы были в виде https://www.youtube.com/embed/VIDEO_ID
  therapyLink = transformYouTubeLink(therapyLink);
  feedbackLink = transformYouTubeLink(feedbackLink);

  db.run(
    `INSERT INTO sessions (user_id, date, surname, name, sessionType, therapyLink, feedbackLink, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.session.userId, date, surname, name, sessionType, therapyLink, feedbackLink, notes],
    function(err) {
      if (err) {
        return res.send('Ошибка при добавлении сеанса в базу');
      }
      // После вставки — редирект на список
      res.redirect('/sessions');
    }
  );
});

// 4) Отображение деталей конкретного сеанса
// (например, по id)
app.get('/sessions/:id', (req, res) => {
  const sessionId = req.params.id;
  db.get(
    `SELECT * FROM sessions WHERE id = ? AND user_id = ?`,
    [sessionId, req.session.userId],
    (err, row) => {
      if (err) {
        return res.send('Ошибка при получении данных');
      }
    if (!row) {
      return res.send('Сеанс не найден');
    }
    res.render('sessions/show', { session: row });
  });
});

function transformYouTubeLink(link) {
  if (!link) return '';

  // Пробуем учесть короткий формат "https://youtu.be/VIDEO_ID"
  if (link.includes('youtu.be/')) {
    try {
      const url = new URL(link);
      // из url.pathname достанем /VIDEO_ID
      // например, для https://youtu.be/4L5Ckz6KndE -> pathname будет "/4L5Ckz6KndE"
      const videoId = url.pathname.replace('/', '');
      return `https://www.youtube.com/embed/${videoId}`;
    } catch (e) {
      // если не получилось распарсить, вернём исходную
      return link;
    }
  }

  // Проверяем классический формат "youtube.com/watch?v=VIDEO_ID"
  if (link.includes('youtube.com/watch')) {
    try {
      const url = new URL(link);
      const videoId = url.searchParams.get('v');
      if (videoId) {
        return `https://www.youtube.com/embed/${videoId}`;
      }
    } catch (e) {
      return link;
    }
  }

  // Если ничего не подходит (вдруг уже embed или вообще не YouTube)
  return link;
}
// Удаление конкретного сеанса
// Используем POST, так как HTML формы не поддерживают DELETE
app.post('/sessions/:id/delete', (req, res) => {
  const sessionId = req.params.id;

  db.run(`DELETE FROM sessions WHERE id = ? AND user_id = ?`, [sessionId, req.session.userId], function(err) {
    if (err) {
      return res.send('Ошибка при удалении из базы данных');
    }
    // По завершении — перенаправляем на список
    res.redirect('/sessions');
  });
});

// Форма редактирования
app.get('/sessions/:id/edit', (req, res) => {
  const sessionId = req.params.id;
  db.get(`SELECT * FROM sessions WHERE id = ? AND user_id = ?`, [sessionId, req.session.userId], (err, row) => {
    if (err) {
      return res.send('Ошибка при получении данных из базы');
    }
    if (!row) {
      return res.send('Сеанс не найден');
    }
    // Отрисовываем страницу edit.ejs и передаём запись
    res.render('sessions/edit', { session: row });
  });
});

// Обработка формы редактирования
app.post('/sessions/:id/update', (req, res) => {
  const sessionId = req.params.id;
  let { date, surname, name, sessionType, therapyLink, feedbackLink, notes } = req.body;

  // если у вас есть transformYouTubeLink, применяем
  therapyLink = transformYouTubeLink(therapyLink);
  feedbackLink = transformYouTubeLink(feedbackLink);

  // Выполняем UPDATE в базе
  db.run(`
    UPDATE sessions
    SET date = ?,
        surname = ?,
        name = ?,
        sessionType = ?,
        therapyLink = ?,
        feedbackLink = ?,
    notes = ?
    WHERE id = ? AND user_id = ?
  `, [date, surname, name, sessionType, therapyLink, feedbackLink, notes, sessionId, req.session.userId],
    function(err) {
      if (err) {
        return res.send('Ошибка при обновлении записи в базе');
      }
      // редирект на список или на детальную страницу
      res.redirect('/sessions/' + sessionId);
    }
  );
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
