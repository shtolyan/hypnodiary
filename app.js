// app.js
const express = require('express');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);
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

// Настройка express-session с хранилищем PostgreSQL
const sessionSecret = process.env.SESSION_SECRET || 'keyboard cat';
app.use(
  session({
    store: new PgStore({ pool: db }),
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

app.post('/register', async (req, res, next) => {
  const { username, password } = req.body;
  const passwordHash = bcrypt.hashSync(password, 10);
  try {
    const result = await db.query(
      `INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id`,
      [username, passwordHash]
    );
    req.session.userId = result.rows[0].id;
    res.redirect('/sessions');
  } catch (err) {
    console.error(err);
    return next(err);
  }
});

// Страница входа
app.get('/login', (req, res) => {
  res.render('auth/login');
});

app.post('/login', async (req, res, next) => {
  const { username, password } = req.body;
  try {
    const { rows } = await db.query(
      `SELECT * FROM users WHERE username = $1`,
      [username]
    );
    const user = rows[0];
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(400).send('Неверные учётные данные');
    }
    req.session.userId = user.id;
    res.redirect('/sessions');
  } catch (err) {
    console.error(err);
    return next(err);
  }
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
app.get('/sessions', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM sessions WHERE user_id = $1 ORDER BY id DESC`,
      [req.session.userId]
    );

    const total = rows.length;
    const iGave = rows.filter(r => r.sessionType === 'Я провёл').length;
    const iReceived = rows.filter(r => r.sessionType === 'Мне провели').length;

    res.render('sessions/list', { sessions: rows, total, iGave, iReceived });
  } catch (err) {
    console.error(err);
    return next(err);
  }
});

// 2) Форма для добавления нового сеанса
app.get('/sessions/new', (req, res) => {
  res.render('sessions/new');
});

// 3) Обработка формы создания сеанса
app.post('/sessions', async (req, res, next) => {
  let { date, surname, name, sessionType, therapyLink, feedbackLink, notes } = req.body;

  // Преобразуем ссылки, чтобы были в виде https://www.youtube.com/embed/VIDEO_ID
  therapyLink = transformYouTubeLink(therapyLink);
  feedbackLink = transformYouTubeLink(feedbackLink);

  try {
    await db.query(
      `INSERT INTO sessions (user_id, date, surname, name, sessionType, therapyLink, feedbackLink, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [req.session.userId, date, surname, name, sessionType, therapyLink, feedbackLink, notes]
    );
    res.redirect('/sessions');
  } catch (err) {
    console.error(err);
    return next(err);
  }
});

// 4) Отображение деталей конкретного сеанса
// (например, по id)
app.get('/sessions/:id', async (req, res, next) => {
  const sessionId = req.params.id;
  try {
    const { rows } = await db.query(
      `SELECT * FROM sessions WHERE id = $1 AND user_id = $2`,
      [sessionId, req.session.userId]
    );
    const row = rows[0];
    if (!row) {
      return res.status(404).send('Сеанс не найден');
    }
    res.render('sessions/show', { session: row });
  } catch (err) {
    console.error(err);
    return next(err);
  }
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
// Форма отправляет POST c _method=DELETE, method-override преобразует его в DELETE
app.delete('/sessions/:id/delete', async (req, res, next) => {
  const sessionId = req.params.id;

  try {
    await db.query(`DELETE FROM sessions WHERE id = $1 AND user_id = $2`, [sessionId, req.session.userId]);
    res.redirect('/sessions');
  } catch (err) {
    console.error(err);
    return next(err);
  }
});

// Форма редактирования
app.get('/sessions/:id/edit', async (req, res, next) => {
  const sessionId = req.params.id;
  try {
    const { rows } = await db.query(`SELECT * FROM sessions WHERE id = $1 AND user_id = $2`, [sessionId, req.session.userId]);
    const row = rows[0];
    if (!row) {
      return res.status(404).send('Сеанс не найден');
    }
    res.render('sessions/edit', { session: row });
  } catch (err) {
    console.error(err);
    return next(err);
  }
});

// Обработка формы редактирования
app.post('/sessions/:id/update', async (req, res, next) => {
  const sessionId = req.params.id;
  let { date, surname, name, sessionType, therapyLink, feedbackLink, notes } = req.body;

  // если у вас есть transformYouTubeLink, применяем
  therapyLink = transformYouTubeLink(therapyLink);
  feedbackLink = transformYouTubeLink(feedbackLink);

  try {
    await db.query(
      `UPDATE sessions
       SET date = $1,
           surname = $2,
           name = $3,
           sessionType = $4,
           therapyLink = $5,
           feedbackLink = $6,
           notes = $7
       WHERE id = $8 AND user_id = $9`,
      [date, surname, name, sessionType, therapyLink, feedbackLink, notes, sessionId, req.session.userId]
    );
    res.redirect('/sessions/' + sessionId);
  } catch (err) {
    console.error(err);
    return next(err);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send(err.message || 'Internal Server Error');
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
