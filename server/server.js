require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser'); // <-- Добавлено
const cors = require('cors');
const helmet = require('helmet'); // <-- Добавлено
const rateLimit = require('express-rate-limit'); // <-- Добавлено
const {createProxyMiddleware} = require('http-proxy-middleware');
const multer = require('multer');
const fs = require('node:fs');
const path = require("node:path");
const nodemailer = require('nodemailer');
const {simpleParser} = require('mailparser');


const app = express();
const port = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';


app.set('trust proxy', 1);

const transporter = nodemailer.createTransport({
    host: 'localhost',
    port: 25,
    secure: false,
    auth: {
        user: 'mailuser',
        pass: 'mailuser'
    },
    tls: {
        rejectUnauthorized: false
    }
});

const supportEmail = 'mailuser@mail.devsanya.ru';
//const supportEmail = 'devsanya.ru';
const siteSenderEmail = 'devsanya.ru';

async function sendEmail(to, subject, text, html, options = {}) {
    console.log(`\n--- sendEmail CALLED ---`);
    console.log(`Initial params: to=${to}, subject="${subject}"`);
    console.log(`Options:`, JSON.stringify(options, null, 2)); // Логируем все переданные опции

    try {
        let finalSubject = subject; // Начинаем с исходной темы

        // 1. Обработка идентификатора тикета
        if (options.ticketNumber) {
            const ticketIdNumber = options.ticketNumber;
            const mainTicketMarker = `#${ticketIdNumber}:`;
            const fullTicketPattern = `Заявка ${mainTicketMarker}`;

            console.log(`sendEmail DBG: Processing ticketNumber: ${ticketIdNumber}. Target pattern: "${fullTicketPattern}"`);

            // Удаляем любые предыдущие формы идентификаторов, чтобы избежать дублирования или конфликтов
            let tempSubject = finalSubject
                .replace(/\[Ticket#[a-zA-Z0-9\-]+\]/gi, '') // Удаляем [Ticket#...]
                .replace(/Заявка\s*#\d+:/gi, '')          // Удаляем "Заявка #ЧИСЛО:"
                .replace(/#\d+:/gi, '');                   // Удаляем одиночные #ЧИСЛО:

            // Убираем лишние "Re: " если они дублируются или стоят перед пустым местом
            tempSubject = tempSubject.replace(/^(Re:\s*)+/i, 'Re: ').trim();
            if (tempSubject.toLowerCase() === 're:') { // Если остался только "Re: "
                tempSubject = ''; // Сделаем тему пустой, чтобы корректно добавить наш паттерн
            } else if (tempSubject.toLowerCase().startsWith('re:')) {
                // Если есть "Re: ", оставляем его и работаем с остальной частью темы
                tempSubject = tempSubject.substring(3).trim();
            }

            tempSubject = tempSubject.trim(); // Убираем пробелы по краям после всех замен

            console.log(`sendEmail DBG: Subject after cleaning old markers: "${tempSubject}"`);

            // Теперь формируем новую тему с нашим главным идентификатором
            if (subject.toLowerCase().startsWith('re:')) { // Используем исходный subject для проверки Re:
                finalSubject = `Re: ${fullTicketPattern} ${tempSubject}`;
            } else {
                finalSubject = `${fullTicketPattern} ${tempSubject}`;
            }
            console.log(`sendEmail DBG: Subject after adding main ticket pattern: "${finalSubject}"`);

        } else {
            console.log(`sendEmail DBG: options.ticketNumber is NOT provided. Subject will not be modified for ticket ID, only thread ID if present.`);
        }

        // 2. Добавляем Thread ID, если он есть и еще не добавлен
        if (options.threadId && !finalSubject.includes(`[Thread#${options.threadId}]`)) {
            finalSubject = `${finalSubject.trim()} [Thread#${options.threadId}]`;
            console.log(`sendEmail DBG: Subject after adding threadId: "${finalSubject}"`);
        }

        // Финальная очистка от лишних пробелов
        finalSubject = finalSubject.replace(/\s\s+/g, ' ').trim();
        console.log(`sendEmail DBG: finalSubject before sending: "${finalSubject}"`);

        const mailOptions = {
            from: `"${options.fromName || 'Ваш Сайт ИНТ'}" <${siteSenderEmail}>`, // siteSenderEmail должен быть определен
            to: to,
            subject: finalSubject,
            text: text,
            html: html,
            replyTo: options.replyTo || undefined,
            attachments: options.attachments || [],
            headers: {}
        };

        if (options.threadId) {
            mailOptions.headers['X-Thread-ID'] = options.threadId;
            if (options.inReplyToMessageId) {
                mailOptions.inReplyTo = options.inReplyToMessageId;
                mailOptions.references = options.references ? `${options.references} ${options.inReplyToMessageId}` : options.inReplyToMessageId;
            }
        }

        const info = await transporter.sendMail(mailOptions); // transporter должен быть определен
        console.log(`Email sent successfully to ${to} (Actual Sent Subject: "${finalSubject}"). Message ID: ${info.messageId}`);

        // Логирование в БД (если нужно)
        if (options.saveToDb !== false && typeof pool !== 'undefined' && pool) { // pool должен быть определен
            let client;
            try {
                client = await pool.connect();
                await client.query(
                    `INSERT INTO emails (thread_id, subject, body, from_email, is_outgoing, created_at, user_id)
                     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6)`,
                    [
                        options.threadId || null,
                        finalSubject,
                        text,
                        siteSenderEmail,
                        true,
                        options.userIdForLog || null
                    ]
                );
                console.log(`Outgoing email (to: ${to}, subject: ${finalSubject}) logged to DB.`);
            } catch (dbError) {
                console.error('Error logging outgoing email to database:', dbError);
            } finally {
                if (client) client.release();
            }
        }
        console.log(`--- sendEmail END ---\n`);
        return {
            messageId: info.messageId,
            threadId: options.threadId
        };

    } catch (error) {
        // Попытка получить finalSubject для лога ошибки, если он был изменен
        const subjectForErrorLog = (typeof finalSubject !== 'undefined' && finalSubject !== subject) ? finalSubject : subject;
        console.error(`Error sending email to ${to} with initial subject "${subject}" (attempted final subject: "${subjectForErrorLog}"):`, error);
        console.log(`--- sendEmail ERROR END ---\n`);
        throw error;
    }
}


app.use(helmet()); // Устанавливает безопасные HTTP заголовки

app.use(cors({
    origin: 'http://127.0.0.1:5500', // Разрешаем запросы ТОЛЬКО с вашего фронтенда
    credentials: true // Разрешаем отправку cookies и заголовков авторизации
}));


const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 10, // Максимум 10 запросов на вход/регистрацию с одного IP за 15 минут
    message: { message: 'Слишком много попыток входа/регистрации. Попробуйте позже.' },
    standardHeaders: true, // Возвращать информацию о лимитах в заголовках `RateLimit-*`
    legacyHeaders: false, // Отключить заголовки `X-RateLimit-*`
});
// Применяем лимитер к эндпоинтам входа и регистрации
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);


// --- Middleware ---
app.use(cookieParser()); // Парсер для cookies <-- Добавлено
app.use(express.json()); // Парсер для JSON тел запросов
app.use(express.urlencoded({ extended: true })); // Парсер для URL-encoded тел запросов

// --- Database Connection Pool ---
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    // Опции для production (если нужно)
    // ssl: isProduction ? { rejectUnauthorized: false } : false, // Пример для Heroku/Render
});

pool.connect((err, client, release) => {
    if (err) {
        return console.error('!!! DATABASE CONNECTION ERROR:', err.stack);
    }
    console.log('Connected to PostgreSQL database!');
    client.release();
});

// --- Вспомогательная функция для установки cookie ---
const sendTokenCookie = (res, token) => {
    const cookieOptions = {
        httpOnly: true, // <-- Главное: Cookie недоступна через JS
        secure: true, // <-- В production - только через HTTPS
        sameSite: 'Lax', // <-- Защита от CSRF ('Strict' еще безопаснее, но может ломать переходы)
        maxAge: parseInt(process.env.COOKIE_MAX_AGE || '3600000', 10),
        path: '/'
    };
    res.cookie('accessToken', token, cookieOptions); // Имя cookie - accessToken
};

// --- Middleware для проверки JWT из заголовка Authorization ---
const verifyToken = (req, res, next) => {
    // Получаем токен из заголовка Authorization
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    console.log('Authorization header:', authHeader);

    if (!token) {
        // Если токена нет - пользователь не авторизован
        return res.status(401).json({ message: 'Доступ запрещен. Требуется авторизация.' });
    }

    const secretKey = process.env.JWT_SECRET;
    if (!secretKey) {
        console.error('!!! JWT_SECRET is not defined for verification !!!');
        return res.status(500).json({ message: 'Ошибка конфигурации сервера' });
    }

    try {
        const decoded = jwt.verify(token, secretKey);
        req.user = decoded; // Добавляем payload токена (userId, email) в объект запроса
        next(); // Переходим к защищенному маршруту
    } catch (err) {
        console.warn('JWT Verification failed:', err.message);
        return res.status(401).json({ message: 'Сессия недействительна или истекла. Пожалуйста, войдите снова.' });
    }
};

app.post('/api/register', async (req, res) => {
    const { email, fio, password_hash, position, company, activity, city, phone } = req.body;

    if (!email || !fio || !password_hash || !position || !company || !activity || !city || !phone) {
        return res.status(400).json({ message: 'Все поля обязательны для заполнения' });
    }
    if (password_hash.length < 6) {
        return res.status(400).json({ message: 'Пароль должен содержать не менее 6 символов' });
    }

    let hashedPassword;
    try {
        const saltRounds = 12;
        hashedPassword = await bcrypt.hash(password_hash, saltRounds);
    } catch (hashError) {
        console.error('Error hashing password:', hashError);
        return res.status(500).json({ message: 'Ошибка сервера при обработке регистрации' });
    }

    const insertQuery = `
        INSERT INTO users (email, fio, password_hash, position, company, activity_sphere, city, phone)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, email, fio;
    `;
    const values = [email, fio, hashedPassword, position, company, activity, city, phone];

    let client;
    try {
        client = await pool.connect();
        const result = await client.query(insertQuery, values);
        const newUser = result.rows[0];
        console.log('User registered:', { id: newUser.id, email: newUser.email });

        // Важно: НЕ логиним пользователя автоматически после регистрации в этой схеме
        // Пусть он введет логин/пароль на странице входа
        res.status(201).json({
            message: 'Регистрация прошла успешно! Теперь вы можете войти.',
            user: { // Возвращаем минимум информации
                id: newUser.id,
                email: newUser.email,
                fio: newUser.fio
            }
        });

    } catch (dbError) {
        console.error('Database registration error:', dbError);
        if (dbError.code === '23505') { // Unique constraint violation
            return res.status(409).json({ message: 'Пользователь с таким email уже существует' });
        }
        res.status(500).json({ message: 'Ошибка сервера при регистрации' });
    } finally {
        if (client) client.release();
    }
});


// Обновление профиля пользователя
app.put('/api/user/profile', verifyToken, async (req, res) => {
    const userId = req.user.userId; // ID пользователя из JWT-токена
    const { fio, phone, password, company, position, city, activity_sphere } = req.body;
    console.log(req.body);
    // Проверяем, что пользователь не пытается изменить email (если это запрещено в вашей системе)
    if (req.body.email) {
        return res.status(400).json({ message: 'Изменение email не разрешено' });
    }

    let client;
    try {
        client = await pool.connect();

        // Начинаем транзакцию
        await client.query('BEGIN');

        // Проверяем, существует ли пользователь с таким ID
        const userCheckResult = await client.query(
            'SELECT id FROM users WHERE id = $1',
            [userId]
        );

        if (userCheckResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        // Формируем запрос на обновление данных
        let updateQuery = 'UPDATE users SET ';
        const updateValues = [];
        const updateFields = [];
        let paramIndex = 1;

        // Добавляем только те поля, которые были переданы в запросе
        if (fio !== undefined) {
            updateFields.push(`fio = $${paramIndex++}`);
            updateValues.push(fio);
        }

        if (phone !== undefined) {
            updateFields.push(`phone = $${paramIndex++}`);
            updateValues.push(phone);
        }

        if (company !== undefined) {
            updateFields.push(`company = $${paramIndex++}`);
            updateValues.push(company);
        }

        if (position !== undefined) {
            updateFields.push(`position = $${paramIndex++}`);
            updateValues.push(position);
        }

        if (city !== undefined) {
            updateFields.push(`city = $${paramIndex++}`);
            updateValues.push(city);
        }

        if (activity_sphere !== undefined) {
            updateFields.push(`activity_sphere = $${paramIndex++}`);
            updateValues.push(activity_sphere);
        }

        // Если передан пароль, хэшируем его
        if (password !== undefined && password.trim() !== '') {
            try {
                const saltRounds = 12;
                const hashedPassword = await bcrypt.hash(password, saltRounds);
                updateFields.push(`password_hash = $${paramIndex++}`);
                updateValues.push(hashedPassword);
            } catch (hashError) {
                await client.query('ROLLBACK');
                console.error('Error hashing password:', hashError);
                return res.status(500).json({ message: 'Ошибка при обработке пароля' });
            }
        }

        // Добавляем updated_at
        updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

        // Если нет полей для обновления, возвращаем успех
        if (updateFields.length === 0) {
            await client.query('ROLLBACK');
            return res.status(200).json({ message: 'Нет данных для обновления' });
        }

        // Формируем полный запрос
        updateQuery += updateFields.join(', ') + ` WHERE id = $${paramIndex}`;
        updateValues.push(userId);

        // Выполняем запрос
        await client.query(updateQuery, updateValues);

        // Получаем обновленные данные пользователя
        const updatedUserResult = await client.query(
            `SELECT id, email, fio, position, company, activity_sphere, city, phone, created_at, updated_at
             FROM users WHERE id = $1`,
            [userId]
        );

        // Завершаем транзакцию
        await client.query('COMMIT');

        // Отправляем обновленные данные клиенту
        res.status(200).json({
            message: 'Профиль успешно обновлен',
            userData: updatedUserResult.rows[0]
        });

    } catch (error) {
        // В случае ошибки откатываем транзакцию
        if (client) await client.query('ROLLBACK');
        console.error('Error updating user profile:', error);
        res.status(500).json({ message: 'Не удалось обновить профиль' });
    } finally {
        if (client) client.release();
    }
});

app.post('/api/admin/login', async (req, res) => {
    const { password } = req.body;

    // Проверяем пароль (хранится в .env)
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
        console.error('ADMIN_PASSWORD not set in .env file');
        return res.status(500).json({ message: 'Ошибка конфигурации сервера' });
    }

    if (password !== adminPassword) {
        // Для безопасности используем одинаковое сообщение об ошибке
        return res.status(401).json({ message: 'Неверный пароль' });
    }

    // Генерируем JWT токен для администратора
    const adminJwtSecret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;

    if (!adminJwtSecret) {
        console.error('ADMIN_JWT_SECRET not set in .env file');
        return res.status(500).json({ message: 'Ошибка конфигурации сервера' });
    }

    const token = jwt.sign(
        { role: 'admin' }, // Payload с ролью администратора
        adminJwtSecret,
        { expiresIn: '4h' } // Токен действителен 4 часа
    );

    // Отправляем токен клиенту
    res.status(200).json({
        message: 'Вход выполнен успешно',
        token: token
    });
});


app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Необходимо указать email и пароль' });
    }

    const findUserQuery = 'SELECT id, email, fio, password_hash FROM users WHERE email = $1';
    let client;

    try {
        client = await pool.connect();
        const result = await client.query(findUserQuery, [email]);

        if (result.rows.length === 0) {
            console.warn(`Login attempt failed (user not found): ${email}`);
            return res.status(401).json({ message: 'Неверный email или пароль' });
        }

        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            console.warn(`Login attempt failed (invalid password): ${email}`);
            return res.status(401).json({ message: 'Неверный email или пароль' });
        }

        // --- Успешный вход: Генерируем JWT ---
        const payload = { userId: user.id, email: user.email };
        const secretKey = process.env.JWT_SECRET;
        const expiresIn = process.env.JWT_EXPIRES_IN || '1h';

        if (!secretKey) {
            console.error('!!! JWT_SECRET is not defined in .env file !!!');
            return res.status(500).json({ message: 'Ошибка конфигурации сервера' });
        }

        const token = jwt.sign(payload, secretKey, { expiresIn });

        // Вместо установки cookie, отправляем токен в теле ответа
        console.log(`Login successful: ${email}`);
        res.status(200).json({
            message: 'Вход выполнен успешно!',
            token: token, // Отправляем токен в теле ответа
            user: {
                id: user.id,
                email: user.email,
                fio: user.fio
            }
        });

    } catch (error) {
        console.error('Login process error:', error);
        res.status(500).json({ message: 'Ошибка сервера при попытке входа' });
    } finally {
        if (client) client.release();
    }
});

// --- Logout Route ---
app.post('/api/logout', (req, res) => {
    // Очищаем cookie, указывая те же опции (кроме maxAge/expires)
    res.clearCookie('accessToken', {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'Lax',
        // path: '/' // Если устанавливали path при создании
    });
    console.log('User logged out');
    res.status(200).json({ message: 'Вы успешно вышли из системы' });
});


app.get('/api/user/profile', verifyToken, async (req, res) => {
    // req.user доступен благодаря middleware verifyToken
    const userId = req.user.userId;
    console.log(`Fetching profile for user ID: ${userId}`);

    const query = `
        SELECT id, email, fio, position, company, activity_sphere, city, phone, created_at
        FROM users
        WHERE id = $1;
    `;
    let client;
    try {
        client = await pool.connect();
        const result = await client.query(query, [userId]);

        if (result.rows.length === 0) {
            // Это странная ситуация, если токен валиден, а пользователя нет
            console.error(`User with ID ${userId} not found in DB despite valid token.`);
            return res.status(404).json({ message: 'Профиль пользователя не найден' });
        }

        // Не отправляем password_hash клиенту!
        const userProfile = result.rows[0];
        res.status(200).json({ userData: userProfile });

    } catch (dbError) {
        console.error('Error fetching user profile:', dbError);
        res.status(500).json({ message: 'Не удалось загрузить данные профиля' });
    } finally {
        if (client) client.release();
    }
});

// Настройка хранилища для загруженных файлов
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Определяем папку назначения в зависимости от типа файла
        let uploadPath = 'uploads/';

        if (file.fieldname === 'document') {
            uploadPath += 'documents/';
        } else if (file.fieldname === 'video') {
            uploadPath += 'videos/';
        } else if (file.fieldname === 'thumbnail') {
            uploadPath += 'thumbnails/';
        }

        // Создаем папку, если она не существует
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }

        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        // Генерируем уникальное имя файла
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

// Фильтр для проверки типов файлов
const fileFilter = (req, file, cb) => {
    if (file.fieldname === 'attachments') {
        // Разрешенные типы документов
        if (
            file.mimetype === 'application/pdf' ||
            file.mimetype === 'application/msword' ||
            file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            file.mimetype === 'application/vnd.ms-excel' ||
            file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            file.mimetype === 'image/png' ||
            file.mimetype === 'image/jpeg'
        ) {
            cb(null, true);
        } else {
            cb(new Error('Неподдерживаемый тип файла! Разрешены только PDF, DOC, DOCX, XLS, XLSX.'), false);
        }
    } else if (file.fieldname === 'video') {
        // Разрешенные типы видео
        if (
            file.mimetype === 'video/mp4' ||
            file.mimetype === 'video/webm'
        ) {
            cb(null, true);
        } else {
            cb(new Error('Неподдерживаемый тип файла! Разрешены только MP4, WEBM.'), false);
        }
    } else if (file.fieldname === 'thumbnail') {
        // Разрешенные типы изображений для миниатюр
        if (
            file.mimetype === 'image/jpeg' ||
            file.mimetype === 'image/png'
        ) {
            cb(null, true);
        } else {
            cb(new Error('Неподдерживаемый тип файла! Разрешены только JPG, PNG.'), false);
        }
    } else {
        cb(new Error('Неизвестное поле для файла!'), false);
    }
};

// Инициализация multer
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100 MB (максимальный размер файла)
    }
});

// Middleware для проверки прав администратора
const verifyAdminToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ message: 'Доступ запрещен. Требуется авторизация администратора.' });
    }

    const adminSecret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;

    if (!adminSecret) {
        console.error('ADMIN_JWT_SECRET not set in .env file');
        return res.status(500).json({ message: 'Ошибка конфигурации сервера' });
    }

    jwt.verify(token, adminSecret, (err, decoded) => {
        if (err) {
            console.warn('Admin JWT Verification failed:', err.message);
            return res.status(403).json({ message: 'Доступ запрещен. Недействительный токен администратора.' });
        }

        // Проверяем, что в токене есть роль admin
        if (decoded.role !== 'admin') {
            return res.status(403).json({ message: 'Доступ запрещен. Недостаточно прав.' });
        }

        req.admin = decoded; // Сохраняем данные из токена
        next(); // Переходим к следующему обработчику
    });
};

// Эндпоинт для входа администратора
app.post('/api/admin/login', async (req, res) => {
    const { password } = req.body;

    // Проверяем пароль (хранится в .env)
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
        console.error('ADMIN_PASSWORD not set in .env file');
        return res.status(500).json({ message: 'Ошибка конфигурации сервера' });
    }

    if (password !== adminPassword) {
        // Для безопасности используем одинаковое сообщение об ошибке
        return res.status(401).json({ message: 'Неверный пароль' });
    }

    // Генерируем JWT токен для администратора
    const adminJwtSecret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;

    if (!adminJwtSecret) {
        console.error('ADMIN_JWT_SECRET not set in .env file');
        return res.status(500).json({ message: 'Ошибка конфигурации сервера' });
    }

    const token = jwt.sign(
        { role: 'admin' }, // Payload с ролью администратора
        adminJwtSecret,
        { expiresIn: '4h' } // Токен действителен 4 часа
    );

    // Отправляем токен клиенту
    res.status(200).json({
        message: 'Вход выполнен успешно',
        token: token
    });
});

// --- CRUD для документов ---

// 1. Получение списка всех документов
app.get('/api/admin/documents', verifyAdminToken, async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const result = await client.query(
            'SELECT * FROM documents ORDER BY created_at DESC'
        );

        res.status(200).json({ documents: result.rows });
    } catch (error) {
        console.error('Error fetching documents:', error);
        res.status(500).json({ message: 'Не удалось загрузить список документов' });
    } finally {
        if (client) client.release();
    }
});

// 2. Получение одного документа по ID
app.get('/api/admin/documents/:id', verifyAdminToken, async (req, res) => {
    const documentId = req.params.id;

    let client;
    try {
        client = await pool.connect();
        const result = await client.query(
            'SELECT * FROM documents WHERE id = $1',
            [documentId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Документ не найден' });
        }

        res.status(200).json({ document: result.rows[0] });
    } catch (error) {
        console.error('Error fetching document:', error);
        res.status(500).json({ message: 'Не удалось загрузить документ' });
    } finally {
        if (client) client.release();
    }
});

// 3. Создание нового документа
app.post('/api/admin/documents', verifyAdminToken, upload.single('document'), async (req, res) => {
    const { title } = req.body;

    if (!title || !req.file) {
        return res.status(400).json({ message: 'Необходимо указать название и загрузить файл' });
    }

    const filePath = req.file.path;
    const fileSize = req.file.size;
    const fileType = path.extname(req.file.originalname).substring(1); // Убираем точку из расширения

    let client;
    try {
        client = await pool.connect();
        const result = await client.query(
            `INSERT INTO documents (title, file_path, file_size, file_type)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [title, filePath, fileSize, fileType]
        );

        res.status(201).json({
            message: 'Документ успешно загружен',
            document: result.rows[0]
        });
    } catch (error) {
        console.error('Error creating document:', error);
        // Удаляем загруженный файл в случае ошибки
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        res.status(500).json({ message: 'Не удалось загрузить документ' });
    } finally {
        if (client) client.release();
    }
});

// 4. Обновление документа
app.put('/api/admin/documents/:id', verifyAdminToken, upload.single('document'), async (req, res) => {
    const documentId = req.params.id;
    const { title } = req.body;

    if (!title) {
        return res.status(400).json({ message: 'Необходимо указать название документа' });
    }

    let client;
    try {
        client = await pool.connect();

        // Начинаем транзакцию
        await client.query('BEGIN');

        // Получаем текущую информацию о документе
        const documentResult = await client.query(
            'SELECT * FROM documents WHERE id = $1',
            [documentId]
        );

        if (documentResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Документ не найден' });
        }

        const oldDocument = documentResult.rows[0];
        let filePath = oldDocument.file_path;
        let fileSize = oldDocument.file_size;
        let fileType = oldDocument.file_type;

        // Если загружен новый файл, обновляем информацию
        if (req.file) {
            // Удаляем старый файл
            if (fs.existsSync(oldDocument.file_path)) {
                fs.unlinkSync(oldDocument.file_path);
            }

            // Обновляем информацию о файле
            filePath = req.file.path;
            fileSize = req.file.size;
            fileType = path.extname(req.file.originalname).substring(1);
        }

        // Обновляем запись в базе данных
        const updateResult = await client.query(
            `UPDATE documents
             SET title = $1, file_path = $2, file_size = $3, file_type = $4, updated_at = CURRENT_TIMESTAMP
             WHERE id = $5
             RETURNING *`,
            [title, filePath, fileSize, fileType, documentId]
        );

        // Завершаем транзакцию
        await client.query('COMMIT');

        res.status(200).json({
            message: 'Документ успешно обновлен',
            document: updateResult.rows[0]
        });
    } catch (error) {
        // В случае ошибки откатываем транзакцию
        if (client) await client.query('ROLLBACK');
        console.error('Error updating document:', error);

        // Удаляем новый загруженный файл в случае ошибки
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({ message: 'Не удалось обновить документ' });
    } finally {
        if (client) client.release();
    }
});

// 5. Удаление документа
app.delete('/api/admin/documents/:id', verifyAdminToken, async (req, res) => {
    const documentId = req.params.id;

    let client;
    try {
        client = await pool.connect();

        // Начинаем транзакцию
        await client.query('BEGIN');

        // Получаем информацию о документе
        const documentResult = await client.query(
            'SELECT * FROM documents WHERE id = $1',
            [documentId]
        );

        if (documentResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Документ не найден' });
        }

        const document = documentResult.rows[0];

        // Удаляем запись из базы данных
        await client.query(
            'DELETE FROM documents WHERE id = $1',
            [documentId]
        );

        // Завершаем транзакцию
        await client.query('COMMIT');

        // Удаляем файл с диска
        if (fs.existsSync(document.file_path)) {
            fs.unlinkSync(document.file_path);
        }

        res.status(200).json({
            message: 'Документ успешно удален',
            id: documentId
        });
    } catch (error) {
        // В случае ошибки откатываем транзакцию
        if (client) await client.query('ROLLBACK');
        console.error('Error deleting document:', error);
        res.status(500).json({ message: 'Не удалось удалить документ' });
    } finally {
        if (client) client.release();
    }
});

//EMAIL_BLOCK
// Эндпоинт для отправки email
// Эндпоинт для создания новой заявки (письма в техподдержку)
app.post('/api/tickets', verifyToken, upload.array('attachments', 5), async (req, res) => {
    const userId = req.user.userId;
    const userEmailFromToken = req.user.email;

    // 'subject' и 'message' извлекаются из req.body, которое приходит от FormData
    const { subject, message } = req.body;

    if (!subject || !message) {
        return res.status(400).json({ message: 'Необходимо указать тему и текст заявки' });
    }

    let client;
    try {
        client = await pool.connect(); // pool должен быть определен глобально
        await client.query('BEGIN');

        const statusResult = await client.query('SELECT id FROM ticket_statuses WHERE name = $1', ['open']);
        if (statusResult.rows.length === 0) {
            await client.query('ROLLBACK');
            console.error('Ticket status "open" not found in database.');
            return res.status(500).json({ message: 'Ошибка конфигурации сервера: статус заявки не найден.' });
        }
        const statusId = statusResult.rows[0].id;

        // Генерируем номер заявки
        const ticketNumberResult = await client.query('SELECT generate_ticket_number() as generated_ticket_number');
        const newTicketNumber = ticketNumberResult.rows[0].generated_ticket_number;

        // Генерируем thread_id для email
        const threadId = `ticket-${newTicketNumber}-${Date.now()}`;

        // Получаем полное имя пользователя из БД
        const userDetailsResult = await client.query('SELECT fio FROM users WHERE id = $1', [userId]);
        const senderName = userDetailsResult.rows.length > 0 ? userDetailsResult.rows[0].fio : userEmailFromToken;

        // 1. Создаем запись о заявке в таблице 'tickets'
        const ticketInsertResult = await client.query(
            `INSERT INTO tickets (ticket_number, user_id, subject, status_id, email_thread_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, created_at`, // ticket_number уже есть в newTicketNumber
            [newTicketNumber, userId, subject, statusId, threadId]
        );
        // Собираем данные о новой заявке
        const newTicketData = {
            id: ticketInsertResult.rows[0].id,
            created_at: ticketInsertResult.rows[0].created_at,
            ticket_number: newTicketNumber // Используем сгенерированный номер
        };

        // 2. Сохраняем исходное сообщение
        const messageInsertResult = await client.query(
            `INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, sender_email, message)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [newTicketData.id, 'user', userId, userEmailFromToken, message]
        );
        const firstMessageId = messageInsertResult.rows[0].id;

        // 3. Обрабатываем вложения
        const emailAttachments = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                await client.query(
                    `INSERT INTO ticket_attachments (message_id, file_name, file_path, file_size, mime_type)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [firstMessageId, file.originalname, file.path, file.size, file.mimetype]
                );
                emailAttachments.push({ filename: file.originalname, path: file.path });
            }
        }

        // --- Определение переменных для тела письма ---
        const emailSubjectForSupport = `Новая заявка #${newTicketData.ticket_number}: ${subject}`;

        const emailTextForSupport = // `textBody` для функции sendEmail
`Пользователь: ${senderName} (${userEmailFromToken})
Тема: ${subject}
Сообщение:
${message}
---
Идентификатор заявки: ${newTicketData.ticket_number}
Идентификатор треда (для ответов): ${threadId}`;

        const emailHtmlForSupport = // `htmlBody` для функции sendEmail
`<p><strong>Пользователь:</strong> ${senderName} (${userEmailFromToken})</p>
<p><strong>Тема:</strong> ${subject}</p>
<p><strong>Сообщение:</strong></p>
<p>${message.replace(/\n/g, '<br>')}</p>
<hr>
<p>Идентификатор заявки: <code>${newTicketData.ticket_number}</code></p>
<p>Идентификатор треда (для ответов): <code>${threadId}</code></p>`;
        // --- Конец определения переменных для тела письма ---

        // Коммитим транзакцию ДО отправки email, чтобы данные точно были в БД
        await client.query('COMMIT');

        // 4. Отправляем email в техподдержку
        try {
            await sendEmail(
                supportEmail,             // `to`
                emailSubjectForSupport,   // `subject`
                emailTextForSupport,      // `textBody`
                emailHtmlForSupport,      // `htmlBody`
                {                         // `options`
                    replyTo: userEmailFromToken,
                    ticketNumber: newTicketData.ticket_number,
                    threadId: threadId,
                    attachments: emailAttachments,
                    userIdForLog: userId,
                    fromName: `${senderName} (через сайт)`
                    // saveToDb: true, // По умолчанию true, если pool определен и вы хотите логировать это
                }
            );
            console.log(`Email for new ticket #${newTicketData.ticket_number} sent to support.`);
        } catch (emailError) {
            // Логируем ошибку отправки email, но не откатываем транзакцию, так как заявка уже создана
            console.error(`Failed to send email notification for new ticket #${newTicketData.ticket_number}:`, emailError);
            // Здесь можно добавить логику для пометки заявки как "email не отправлен"
        }

        res.status(201).json({
            message: 'Заявка успешно создана.',
            ticket: {
                id: newTicketData.id,
                ticket_number: newTicketData.ticket_number,
                subject: subject,
                status: 'open',
                created_at: newTicketData.created_at,
                thread_id: threadId
            }
        });

    } catch (error) {
        // Если ошибка произошла ДО client.query('COMMIT'), откатываем транзакцию
        if (client && client.active) { // Проверяем, активна ли транзакция
             try { await client.query('ROLLBACK'); } catch (rbError) { console.error('Error rolling back transaction', rbError); }
        }
        console.error('Error creating ticket:', error);
        if (error.code === '23505' && error.constraint && error.constraint.includes('ticket_number')) {
            return res.status(409).json({ message: 'Ошибка: Конфликт номера заявки. Пожалуйста, попробуйте еще раз.' });
        }
        res.status(500).json({ message: 'Ошибка при создании заявки.' });
    } finally {
        if (client) client.release();
    }
});


// 1. Получение списка заявок пользователя
app.get('/api/tickets', verifyToken, async (req, res) => {
    const userId = req.user.userId;
    const statusFilter = req.query.status; // 'open', 'closed', 'all'

    let query = `
        SELECT t.id, t.ticket_number, t.subject, ts.name as status,
               t.created_at, t.updated_at, t.closed_at,
               (SELECT tm.message FROM ticket_messages tm
                WHERE tm.ticket_id = t.id
                ORDER BY tm.created_at ASC LIMIT 1) as first_message
        FROM tickets t
        JOIN ticket_statuses ts ON t.status_id = ts.id
        WHERE t.user_id = $1
    `;

    const queryParams = [userId];

    if (statusFilter === 'open') {
        query += ` AND ts.name != 'closed'`;
    } else if (statusFilter === 'closed') {
        query += ` AND ts.name = 'closed'`;
    }

    query += ` ORDER BY t.updated_at DESC`;

    let client;
    try {
        client = await pool.connect();
        const result = await client.query(query, queryParams);
        res.status(200).json({ tickets: result.rows });
    } catch (error) {
        console.error('Error fetching tickets:', error);
        res.status(500).json({ message: 'Не удалось загрузить список заявок' });
    } finally {
        if (client) client.release();
    }
});

// 2. Создание новой заявки
app.post('/api/tickets', verifyToken, upload.array('attachments', 5), async (req, res) => {
    const userId = req.user.userId;
    const { subject, message } = req.body;

    if (!subject || !message) {
        return res.status(400).json({ message: 'Необходимо указать тему и текст заявки' });
    }

    let client;
    try {
        client = await pool.connect();

        // Начинаем транзакцию
        await client.query('BEGIN');

        // Получаем ID статуса "open"
        const statusResult = await client.query(
            'SELECT id FROM ticket_statuses WHERE name = $1',
            ['open']
        );
        const statusId = statusResult.rows[0].id;

        // Генерируем номер заявки
        const ticketNumberResult = await client.query('SELECT generate_ticket_number() as number');
        const ticketNumber = ticketNumberResult.rows[0].number;

        // Генерируем thread_id для email
        const threadId = `thread_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

        // Получаем информацию о пользователе
        const userResult = await client.query(
            'SELECT email, fio as fio FROM users WHERE id = $1',
            [userId]
        );
        const user = userResult.rows[0];

        // Создаем заявку
        const ticketResult = await client.query(
            `INSERT INTO tickets (ticket_number, user_id, subject, status_id, email_thread_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, ticket_number, created_at`,
            [ticketNumber, userId, subject, statusId, threadId]
        );
        const newTicket = ticketResult.rows[0];

        // Сохраняем исходящее письмо в базу данных
        const emailResult = await client.query(
            `INSERT INTO emails (thread_id, subject, body, from_email, is_outgoing, created_at, user_id)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6)
             RETURNING id`,
            [threadId, `${subject} [${threadId}]`, message, user.email, false, userId]
        );
        const emailId = emailResult.rows[0].id;

        // Добавляем первое сообщение от пользователя
        const messageResult = await client.query(
            `INSERT INTO ticket_messages (ticket_id, message_number, sender_type, sender_id, sender_email, message, email_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [newTicket.id, 1, 'user', userId, user.email, message, emailId]
        );
        const messageId = messageResult.rows[0].id;

        // Обрабатываем вложения, если они есть
        const attachments = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
		console.log(`fileOriginalName: ${file.originalname}`);
                // Сохраняем информацию о вложении в базу данных
                await client.query(
                    `INSERT INTO ticket_attachments (message_id, file_name, file_path, file_size, mime_type)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [messageId, file.originalname, file.path, file.size, file.mimetype]
                );

                // Добавляем вложение для отправки по email
                attachments.push({
                    filename: file.originalname,
                    path: file.path
                });
            }
        }

        // Завершаем транзакцию
        await client.query('COMMIT');

        // Отправляем уведомление на email техподдержки
        try {
            const emailInfo = await sendEmail(
                supportEmail,
                `Новая заявка #${ticketNumber}: ${subject}`,
                `Пользователь ${user.fio} (${user.email}) создал новую заявку:\n\n${message}\n\nДля ответа на эту заявку, пожалуйста, сохраните тему письма и ID цепочки: ${threadId}`,
                `<p>Пользователь <strong>${user.fio}</strong> (${user.email}) создал новую заявку:</p>
                 <p><strong>Номер заявки:</strong> ${ticketNumber}</p>
                 <p><strong>Тема:</strong> ${subject}</p>
                 <p><strong>Сообщение:</strong></p>
                 <p>${message.replace(/\n/g, '<br>')}</p>
                 <p>Для ответа на эту заявку, пожалуйста, сохраните тему письма и ID цепочки: ${threadId}</p>`,
                {
                    threadId: threadId,
                    userId: userId,
                    saveToDb: true,
                    attachments: attachments
                }
            );
        } catch (emailError) {
            console.error('Failed to send email notification:', emailError);
            // Продолжаем выполнение, даже если email не отправился
        }

        res.status(201).json({
            message: 'Заявка успешно создана',
            ticket: {
                id: newTicket.id,
                ticket_number: newTicket.ticket_number,
                subject,
                status: 'open',
                created_at: newTicket.created_at,
                thread_id: threadId
            }
        });

    } catch (error) {
        // В случае ошибки откатываем транзакцию
        if (client) await client.query('ROLLBACK');
        console.error('Error creating ticket:', error);
        res.status(500).json({ message: 'Не удалось создать заявку' });
    } finally {
        if (client) client.release();
    }
});

// 3. Добавление сообщения в заявку
app.post('/api/tickets/:ticketNumber/messages', verifyToken, upload.array('attachments', 5), async (req, res) => {
    const userId = req.user.userId;
    const { ticketNumber } = req.params;
    const { message } = req.body;

    if (!message) {
        return res.status(400).json({ message: 'Текст сообщения не может быть пустым' });
    }

    let client;
    try {
        client = await pool.connect();

        // Начинаем транзакцию
        await client.query('BEGIN');

        // Получаем информацию о заявке
        const ticketResult = await client.query(
            `SELECT t.id, t.subject, ts.name as status, t.user_id, t.email_thread_id
             FROM tickets t
             JOIN ticket_statuses ts ON t.status_id = ts.id
             WHERE t.ticket_number = $1`,
            [ticketNumber]
        );

        if (ticketResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Заявка не найдена' });
        }

        const ticket = ticketResult.rows[0];

        // Проверяем, принадлежит ли заявка текущему пользователю
        if (ticket.user_id !== userId) {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: 'У вас нет доступа к этой заявке' });
        }

        // Проверяем, не закрыта ли заявка
        if (ticket.status === 'closed') {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Невозможно добавить сообщение в закрытую заявку' });
        }

        // Получаем информацию о пользователе
        const userResult = await client.query(
            'SELECT email, fio as fio FROM users WHERE id = $1',
            [userId]
        );
        const user = userResult.rows[0];

        // Получаем последний номер сообщения в заявке
        const lastMessageResult = await client.query(
            `SELECT MAX(message_number) as last_number FROM ticket_messages WHERE ticket_id = $1`,
            [ticket.id]
        );

        const messageNumber = (lastMessageResult.rows[0].last_number || 0) + 1;

        // Сохраняем исходящее письмо в базу данных
        const emailResult = await client.query(
            `INSERT INTO emails (thread_id, subject, body, from_email, is_outgoing, created_at, user_id)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6)
             RETURNING id`,
            [ticket.email_thread_id, `Re: ${ticket.subject} [${ticket.email_thread_id}]`, message, user.email, false, userId]
        );
        const emailId = emailResult.rows[0].id;

        // Добавляем сообщение
        const messageResult = await client.query(
            `INSERT INTO ticket_messages (ticket_id, message_number, sender_type, sender_id, sender_email, message, email_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, created_at`,
            [ticket.id, messageNumber, 'user', userId, user.email, message, emailId]
        );
        const messageId = messageResult.rows[0].id;

        // Обрабатываем вложения, если они есть
        const attachments = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                // Сохраняем информацию о вложении в базу данных
                await client.query(
                    `INSERT INTO ticket_attachments (message_id, file_name, file_path, file_size, mime_type)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [messageId, file.originalname, file.path, file.size, file.mimetype]
                );

                // Добавляем вложение для отправки по email
                attachments.push({
                    filename: file.originalname,
                    path: file.path
                });
            }
        }

        // Обновляем статус заявки на "ожидает ответа от техподдержки", если она была в статусе "ожидает ответа от пользователя"
        if (ticket.status === 'waiting_for_user') {
            const openStatusResult = await client.query(
                'SELECT id FROM ticket_statuses WHERE name = $1',
                ['open']
            );
            const openStatusId = openStatusResult.rows[0].id;

            await client.query(
                `UPDATE tickets
                 SET status_id = $1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2`,
                [openStatusId, ticket.id]
            );
        } else {
            // Просто обновляем время последнего обновления
            await client.query(
                `UPDATE tickets
                 SET updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [ticket.id]
            );
        }

        // Завершаем транзакцию
        await client.query('COMMIT');

        // Отправляем уведомление на email техподдержки
        try {
            await sendEmail(
                supportEmail,
                `Re: ${ticket.subject}`,
                `Пользователь ${user.fio} (${user.email}) добавил новое сообщение в заявку #${ticketNumber}:\n\n${message}`,
                `<p>Пользователь <strong>${user.fio}</strong> (${user.email}) добавил новое сообщение в заявку:</p>
                 <p><strong>Номер заявки:</strong> ${ticketNumber}</p>
                 <p><strong>Тема:</strong> ${ticket.subject}</p>
                 <p><strong>Сообщение:</strong></p>
                 <p>${message.replace(/\n/g, '<br>')}</p>`,
                {
                    threadId: ticket.email_thread_id,
                    userId: userId,
                    saveToDb: true,
                    attachments: attachments,
                    ticketNumber: ticketNumber
                }
            );
        } catch (emailError) {
            console.error('Failed to send email notification:', emailError);
            // Продолжаем выполнение, даже если email не отправился
        }

        res.status(201).json({
            message: 'Сообщение успешно добавлено',
            ticketMessage: {
                sender_type: 'user',
                sender_name: user.fio,
                sender_email: user.email,
                message: message,
                created_at: messageResult.rows[0].created_at,
                is_read: false
            }
        });

    } catch (error) {
        // В случае ошибки откатываем транзакцию
        if (client) await client.query('ROLLBACK');
        console.error('Error adding message to ticket:', error);
        res.status(500).json({ message: 'Не удалось добавить сообщение в заявку' });
    } finally {
        if (client) client.release();
    }
});

// 4. Закрытие заявки
app.post('/api/tickets/:ticketNumber/close', verifyToken, async (req, res) => {
    const userId = req.user.userId;
    const { ticketNumber } = req.params;

    let client;
    try {
        client = await pool.connect();

        // Получаем информацию о заявке
        const ticketResult = await client.query(
            `SELECT t.id, t.subject, ts.name as status, t.user_id, t.email_thread_id
             FROM tickets t
             JOIN ticket_statuses ts ON t.status_id = ts.id
             WHERE t.ticket_number = $1`,
            [ticketNumber]
        );

        if (ticketResult.rows.length === 0) {
            return res.status(404).json({ message: 'Заявка не найдена' });
        }

        const ticket = ticketResult.rows[0];

        // Проверяем, принадлежит ли заявка текущему пользователю
        if (ticket.user_id !== userId) {
            return res.status(403).json({ message: 'У вас нет доступа к этой заявке' });
        }

        // Проверяем, не закрыта ли уже заявка
        if (ticket.status === 'closed') {
            return res.status(400).json({ message: 'Заявка уже закрыта' });
        }

        // Получаем ID статуса "closed"
        const closedStatusResult = await client.query(
            'SELECT id FROM ticket_statuses WHERE name = $1',
            ['closed']
        );
        const closedStatusId = closedStatusResult.rows[0].id;

        // Закрываем заявку
        await client.query(
            `UPDATE tickets
             SET status_id = $1, updated_at = CURRENT_TIMESTAMP, closed_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [closedStatusId, ticket.id]
        );

        // Получаем информацию о пользователе
        const userResult = await client.query(
            'SELECT email, fio as fio FROM users WHERE id = $1',
            [userId]
        );
        const user = userResult.rows[0];

        // Отправляем уведомление на email техподдержки
        try {
            await sendEmail(
                supportEmail,
                `Заявка #${ticketNumber} закрыта пользователем: ${ticket.subject}`,
                `Пользователь ${user.fio} (${user.email}) закрыл заявку #${ticketNumber}.`,
                `<p>Пользователь <strong>${user.fio}</strong> (${user.email}) закрыл заявку:</p>
                 <p><strong>Номер заявки:</strong> ${ticketNumber}</p>
                 <p><strong>Тема:</strong> ${ticket.subject}</p>`,
                {
                    threadId: ticket.email_thread_id,
                    userId: userId,
                    saveToDb: true
                }
            );
        } catch (emailError) {
            console.error('Failed to send email notification:', emailError);
            // Продолжаем выполнение, даже если email не отправился
        }

        res.status(200).json({
            message: 'Заявка успешно закрыта',
            ticket_number: ticketNumber,
            status: 'closed',
            closed_at: new Date()
        });

    } catch (error) {
        console.error('Error closing ticket:', error);
        res.status(500).json({ message: 'Не удалось закрыть заявку' });
    } finally {
        if (client) client.release();
    }
});

// 5. Повторное открытие заявки
app.post('/api/tickets/:ticketNumber/reopen', verifyToken, async (req, res) => {
    const userId = req.user.userId;
    const { ticketNumber } = req.params;

    let client;
    try {
        client = await pool.connect();

        // Получаем информацию о заявке
        const ticketResult = await client.query(
            `SELECT t.id, t.subject, ts.name as status, t.user_id, t.email_thread_id
             FROM tickets t
             JOIN ticket_statuses ts ON t.status_id = ts.id
             WHERE t.ticket_number = $1`,
            [ticketNumber]
        );

        if (ticketResult.rows.length === 0) {
            return res.status(404).json({ message: 'Заявка не найдена' });
        }

        const ticket = ticketResult.rows[0];

        // Проверяем, принадлежит ли заявка текущему пользователю
        if (ticket.user_id !== userId) {
            return res.status(403).json({ message: 'У вас нет доступа к этой заявке' });
        }

        // Проверяем, закрыта ли заявка
        if (ticket.status !== 'closed') {
            return res.status(400).json({ message: 'Заявка уже открыта' });
        }

        // Получаем ID статуса "open"
        const openStatusResult = await client.query(
            'SELECT id FROM ticket_statuses WHERE name = $1',
            ['open']
        );
        const openStatusId = openStatusResult.rows[0].id;

        // Открываем заявку заново
        await client.query(
            `UPDATE tickets
             SET status_id = $1, updated_at = CURRENT_TIMESTAMP, closed_at = NULL
             WHERE id = $2`,
            [openStatusId, ticket.id]
        );

        // Получаем информацию о пользователе
        const userResult = await client.query(
            'SELECT email, fio as fio FROM users WHERE id = $1',
            [userId]
        );
        const user = userResult.rows[0];

        // Отправляем уведомление на email техподдержки
        try {
            await sendEmail(
                supportEmail,
                `Заявка #${ticketNumber} открыта повторно: ${ticket.subject}`,
                `Пользователь ${user.fio} (${user.email}) повторно открыл заявку #${ticketNumber}.`,
                `<p>Пользователь <strong>${user.fio}</strong> (${user.email}) повторно открыл заявку:</p>
                 <p><strong>Номер заявки:</strong> ${ticketNumber}</p>
                 <p><strong>Тема:</strong> ${ticket.subject}</p>`,
                {
                    threadId: ticket.email_thread_id,
                    userId: userId,
                    saveToDb: true
                }
            );
        } catch (emailError) {
            console.error('Failed to send email notification:', emailError);
            // Продолжаем выполнение, даже если email не отправился
        }

        res.status(200).json({
            message: 'Заявка успешно открыта повторно',
            ticket_number: ticketNumber,
            status: 'open',
            updated_at: new Date()
        });

    } catch (error) {
        console.error('Error reopening ticket:', error);
        res.status(500).json({ message: 'Не удалось повторно открыть заявку' });
    } finally {
        if (client) client.release();
    }
});

async function decodeMimeEncodedString(mimeString) {
    if (!mimeString || typeof mimeString !== 'string' || !mimeString.startsWith('=?') || !mimeString.endsWith('?=')) {
        return mimeString; // Возвращаем как есть, если не похоже на MIME
    }
    try {
        const emailSource = `Subject: ${mimeString}\n\n`;
        const parsedEmail = await simpleParser(emailSource);
        return parsedEmail.subject || mimeString;
    } catch (error) {
        console.error("Error decoding MIME string with mailparser:", error);
        return mimeString; // В случае ошибки возвращаем исходную строку, чтобы не прерывать поток
    }
}

function extractTicketInfo(decodedSubject) {
    // decodedSubject - это уже РАСКОДИРОВАННАЯ строка темы
    if (!decodedSubject || typeof decodedSubject !== 'string') {
        return { ticketNumber: null, message: "Decoded subject is invalid or empty." };
    }

    let ticketNumber = null;
    let message = "Ticket number not found with known patterns in decoded subject.";

    let match = decodedSubject.match(/#([0-9]+):/i);
    if (match && match[1]) {
        ticketNumber = match[1];
        message = `Ticket number '${ticketNumber}' found using pattern '#...:'.`;
        return { ticketNumber, message };
    }


    match = decodedSubject.match(/\[Ticket#([a-zA-Z0-9\-]+)\]/i);
    if (match && match[1]) {
        ticketNumber = match[1];
        message = `Ticket number '${ticketNumber}' found using pattern '[Ticket#...]'.`;
        return { ticketNumber, message };
    }

    match = decodedSubject.match(/Ticket#([a-zA-Z0-9\-]+)/i);
    if (match && match[1]) {
        ticketNumber = match[1];
        message = `Ticket number '${ticketNumber}' found using pattern 'Ticket#...'.`;
        return { ticketNumber, message };
    }

    match = decodedSubject.match(/_#([0-9]+):/i);
    if (match && match[1]) {
        ticketNumber = match[1];
        message = `Ticket number '${ticketNumber}' found using pattern '_#...:'.`;
        return { ticketNumber, message };
    }

    return { ticketNumber, message }; // ticketNumber будет null, если ни один паттерн не сработал
}



// 6. Эндпоинт для обработки входящих писем от почтового сервера
app.post('/api/receive-email', async (req, res) => {
    // 1. Защита Webhook'а
    const apiKey = req.headers['x-api-key'];
    if (!process.env.EMAIL_WEBHOOK_API_KEY || apiKey !== process.env.EMAIL_WEBHOOK_API_KEY) {
        console.warn('Unauthorized webhook access attempt to /api/receive-email.');
        return res.status(401).json({ message: 'Unauthorized webhook access.' });
    }

    const { subject, body, from } = req.body;

    // Проверяем наличие обязательных полей
    if (!subject || !body || !from) { // Используем 'subject' и 'from'
        console.warn('Webhook /api/receive-email: Missing required fields:', req.body);
        // Сообщение об ошибке тоже должно соответствовать:
        return res.status(400).json({ message: 'Missing required fields: subject, body, from are required.' });
    }

    console.log(`Webhook /api/receive-email: Received raw subject: "${subject}"`); // Используем 'subject'

    // 2.1. Декодируем тему письма (передаем 'subject' как исходную MIME-строку)
    const decodedSubject = await decodeMimeEncodedString(subject);
    console.log(`Webhook /api/receive-email: Decoded subject: "${decodedSubject}"`);

    // 2.2. Извлекаем номер тикета из ДЕКОДИРОВАННОЙ темы
    const ticketInfo = extractTicketInfo(decodedSubject);
    const ticketNumber = ticketInfo.ticketNumber;

    console.log(`Webhook /api/receive-email: Ticket extraction - ${ticketInfo.message}`);

    if (!ticketNumber) {
        console.warn(`Webhook /api/receive-email: Could not extract ticket_number. Raw subject: "${subject}", Decoded: "${decodedSubject}". Email will be ignored.`);
        return res.status(200).json({ message: 'Ticket number not found in subject. Email ignored.' });
    }
    console.log(`Webhook /api/receive-email: Successfully extracted ticket_number '${ticketNumber}'.`);

    // Используем ДЕКОДИРОВАННУЮ тему для записи в БД и дальнейшей логики
    const subjectForDb = decodedSubject;

    let client;
    try {
        client = await pool.connect(); // pool должен быть определен выше
        await client.query('BEGIN');

        // 4. Находим заявку в БД по извлеченному ticket_number
        const ticketQueryResult = await client.query(
            `SELECT t.id, t.ticket_number, t.user_id, t.subject as ticket_subject, ts.name as status,
                    u.email as user_email, u.fio as user_name, t.email_thread_id
             FROM tickets t
             JOIN ticket_statuses ts ON t.status_id = ts.id
             JOIN users u ON t.user_id = u.id
             WHERE t.ticket_number = $1`,
            [ticketNumber]
        );

        if (ticketQueryResult.rows.length === 0) {
            await client.query('ROLLBACK');
            console.warn(`Webhook /api/receive-email: Ticket not found for ticket_number: ${ticketNumber}.`);
            return res.status(200).json({ message: `Ticket not found for ticket_number: ${ticketNumber}. Email ignored.` });
        }
        const ticket = ticketQueryResult.rows[0];

        // 5. Определяем, кто отправитель: пользователь или техподдержка
        let senderType = 'user';
        let senderIdForDb = ticket.user_id;

        const supportEmailEnv = process.env.SUPPORT_MAIN_EMAIL || 'default_support@example.com';
        const supportEmailsEnv = (process.env.SUPPORT_EMAILS || supportEmailEnv).split(',').map(email => email.trim().toLowerCase());

        // Используем 'from' для определения отправителя
        if (supportEmailsEnv.includes(from.toLowerCase())) {
            senderType = 'support';
            const supportStaffResult = await client.query('SELECT id FROM users WHERE email = $1 AND is_support = TRUE', [from]); // Используем 'from'
            senderIdForDb = supportStaffResult.rows.length > 0 ? supportStaffResult.rows[0].id : null;
        } else if (from.toLowerCase() !== ticket.user_email.toLowerCase()) { // Используем 'from'
            console.warn(`Webhook /api/receive-email: Email from '${from}' for ticket #${ticket.ticket_number}, but original user is '${ticket.user_email}'. Processing as user reply.`);
        }

        // 6. Сохраняем входящее письмо в таблицу emails
        const emailInsertResult = await client.query(
            `INSERT INTO emails (thread_id, subject, body, from_email, is_outgoing, created_at, user_id)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6)
             RETURNING id`,
            // Для поля from_email в БД используем переменную 'from'
            [ticket.email_thread_id, subjectForDb, body, from, false, (senderType === 'user' ? ticket.user_id : senderIdForDb)]
        );
        const emailId = emailInsertResult.rows[0].id;

        // 7. Добавляем сообщение в таблицу ticket_messages
        const messageInsertResult = await client.query(
            `INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, sender_email, message, email_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, created_at, message_number`,
            // Для поля sender_email в БД используем переменную 'from'
            [ticket.id, senderType, senderIdForDb, from, body, emailId]
        );
        const newMessage = messageInsertResult.rows[0];

        // 8. Обновляем статус заявки (логика остается прежней)
        let newStatusName = ticket.status;
        if (senderType === 'support' && ['open', 'in_progress', 'reopened'].includes(ticket.status)) {
            newStatusName = 'waiting_for_user';
        } else if (senderType === 'user' && ['waiting_for_user', 'closed'].includes(ticket.status)) {
            newStatusName = (ticket.status === 'closed') ? 'reopened' : 'open';
            if (ticket.status === 'closed') {
                console.log(`Webhook /api/receive-email: Ticket #${ticket.ticket_number} re-opened due to user reply.`);
            }
        }

        if (newStatusName !== ticket.status) {
            const newStatusResult = await client.query('SELECT id FROM ticket_statuses WHERE name = $1', [newStatusName]);
            if (newStatusResult.rows.length > 0) {
                await client.query(
                    `UPDATE tickets SET status_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
                    [newStatusResult.rows[0].id, ticket.id]
                );
                console.log(`Webhook /api/receive-email: Ticket #${ticket.ticket_number} status updated from '${ticket.status}' to '${newStatusName}'.`);
            } else {
                console.warn(`Webhook /api/receive-email: Status_id for '${newStatusName}' not found. Ticket status not changed.`);
                await client.query(`UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [ticket.id]);
            }
        } else {
             await client.query(`UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [ticket.id]);
        }

        await client.query('COMMIT');

        // 9. Отправляем email-уведомление (если нужно)
        if (typeof sendEmail === 'function') {
            if (senderType === 'support') {
                try {
                    await sendEmail(
                        ticket.user_email,
                        `Ответ по вашей заявке #${ticket.ticket_number}: ${ticket.ticket_subject}`,
                        `Здравствуйте, ${ticket.user_name || 'Пользователь'}!\n\nСотрудник техподдержки (${from}) ответил на вашу заявку:\n\n${body}\n\nС уважением,\nТехподдержка ИНТ`, // Используем 'from'
                        `<p>Здравствуйте, ${ticket.user_name || 'Пользователь'}!</p><p>Сотрудник техподдержки (${from}) ответил на вашу заявку #${ticket.ticket_number} (${ticket.ticket_subject}):</p><blockquote>${body.replace(/\n/g, '<br>')}</blockquote><p>С уважением,<br>Техподдержка ИНТ</p>`,
                        { replyTo: supportEmailEnv, threadId: ticket.email_thread_id, ticketNumber: ticket.ticket_number }
                    );
                } catch (emailError) { console.error(`Webhook: Failed to send notification to user for ticket #${ticket.ticket_number}:`, emailError); }
            } else if (senderType === 'user' && !supportEmailsEnv.includes(from.toLowerCase())) { // Используем 'from'
                 try {
                    await sendEmail(
                        supportEmailEnv,
                        `Новый ответ от пользователя по заявке #${ticket.ticket_number}: ${ticket.ticket_subject}`,
                        `Пользователь ${ticket.user_name} (${from}) ответил на заявку #${ticket.ticket_number}:\n\n${body}`, // Используем 'from'
                        `<p>Пользователь <strong>${ticket.user_name}</strong> (${from}) ответил на заявку #${ticket.ticket_number} (${ticket.ticket_subject}):</p><blockquote>${body.replace(/\n/g, '<br>')}</blockquote>`,
                        { replyTo: from, threadId: ticket.email_thread_id, ticketNumber: ticket.ticket_number } // Используем 'from'
                    );
                } catch (emailError) { console.error(`Webhook: Failed to send notification to support for ticket #${ticket.ticket_number}:`, emailError); }
            }
        } else {
            console.warn("Webhook /api/receive-email: sendEmail function is not defined. Notifications skipped.");
        }


        console.log(`Webhook /api/receive-email: Message from ${from} successfully processed for ticket #${ticket.ticket_number}`); // Используем 'from'
        res.status(200).json({
            message: 'Email successfully processed and added to ticket.',
            ticket_number: ticket.ticket_number,
            message_id: newMessage.id
        });

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Error processing incoming email via webhook /api/receive-email:', error);
        res.status(500).json({ message: 'Internal server error while processing email.' });
    } finally {
        if (client) client.release();
    }
});

// 7. Получение детальной информации о заявке
app.get('/api/tickets/:ticketNumber', verifyToken, async (req, res) => {
    const userId = req.user.userId;
    const { ticketNumber } = req.params;

    let client;
    try {
        client = await pool.connect();

        // Получаем информацию о заявке
        const ticketResult = await client.query(
            `SELECT t.id, t.ticket_number, t.subject, ts.name as status,
                    t.created_at, t.updated_at, t.closed_at, t.user_id, t.email_thread_id
             FROM tickets t
             JOIN ticket_statuses ts ON t.status_id = ts.id
             WHERE t.ticket_number = $1`,
            [ticketNumber]
        );

        if (ticketResult.rows.length === 0) {
            return res.status(404).json({ message: 'Заявка не найдена' });
        }

        const ticket = ticketResult.rows[0];

        // Проверяем, принадлежит ли заявка текущему пользователю
        if (ticket.user_id !== userId) {
            return res.status(403).json({ message: 'У вас нет доступа к этой заявке' });
        }

        // Получаем все сообщения в заявке
        const messagesResult = await client.query(
            `SELECT tm.id, tm.sender_type, tm.sender_id, tm.sender_email, tm.message,
                    tm.created_at, tm.is_read, tm.email_id,
                    CASE WHEN tm.sender_type = 'user' THEN u.fio ELSE 'Техподдержка' END as sender_name
             FROM ticket_messages tm
             LEFT JOIN users u ON tm.sender_id = u.id AND tm.sender_type = 'user'
             WHERE tm.ticket_id = $1
             ORDER BY tm.created_at ASC`,
            [ticket.id]
        );

        // Получаем вложения для каждого сообщения
        const messageIds = messagesResult.rows.map(m => m.id);
        let attachmentsResult = { rows: [] };

        if (messageIds.length > 0) {
            attachmentsResult = await client.query(
                `SELECT * FROM ticket_attachments WHERE message_id = ANY($1)`,
                [messageIds]
            );
        }

        // Группируем вложения по ID сообщения
        const attachmentsByMessageId = {};
        attachmentsResult.rows.forEach(attachment => {
            if (!attachmentsByMessageId[attachment.message_id]) {
                attachmentsByMessageId[attachment.message_id] = [];
            }
            attachmentsByMessageId[attachment.message_id].push(attachment);
        });

        // Добавляем вложения к сообщениям
        const messagesWithAttachments = messagesResult.rows.map(message => {
            return {
                ...message,
                attachments: attachmentsByMessageId[message.id] || []
            };
        });

        // Отмечаем сообщения от техподдержки как прочитанные
        if (messagesResult.rows.some(m => m.sender_type === 'support' && !m.is_read)) {
            await client.query(
                `UPDATE ticket_messages
                 SET is_read = TRUE
                 WHERE ticket_id = $1 AND sender_type = 'support' AND is_read = FALSE`,
                [ticket.id]
            );
        }

        res.status(200).json({
            ticket: {
                id: ticket.id,
                ticket_number: ticket.ticket_number,
                subject: ticket.subject,
                status: ticket.status,
                created_at: ticket.created_at,
                updated_at: ticket.updated_at,
                closed_at: ticket.closed_at,
                thread_id: ticket.email_thread_id
            },
            messages: messagesWithAttachments
        });

    } catch (error) {
        console.error('Error fetching ticket details:', error);
        res.status(500).json({ message: 'Не удалось загрузить информацию о заявке' });
    } finally {
        if (client) client.release();
    }
});

const superAdminAuthLimiter = rateLimit({ // Переименовал для ясности
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 5,                   // Максимум 5 попыток входа с одного IP за 15 минут
    message: { message: 'Слишком много попыток входа. Попробуйте позже.' },
    standardHeaders: true,
    legacyHeaders: false,
});

app.post('/auth-tech', superAdminAuthLimiter, async (req, res) => {
    const { password } = req.body;

    if (!password) {
        return res.status(400).json({ message: "Введите пароль" });
    }

    const superAdminPasswordFromEnv = process.env.TECH_PASSWORD; // Пароль из .env
    const adminJwtSecret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;

    if (!superAdminPasswordFromEnv) {
        console.error('!!! TECH_PASSWORD is not defined in .env file !!!');
        return res.status(500).json({ message: 'Ошибка конфигурации сервера (пароль суперадмина)' });
    }
    if (!adminJwtSecret) {
        console.error('!!! ADMIN_JWT_SECRET (or JWT_SECRET) is not defined in .env file !!!');
        return res.status(500).json({ message: 'Ошибка конфигурации сервера (секрет токена)' });
    }

    try {
        if (password === superAdminPasswordFromEnv) {
            const payload = {
                role: 'admin',
            };
            const token = jwt.sign(
                payload,
                adminJwtSecret, // Используем тот же секрет, что и в verifyAdminToken
                { expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '4h' } // Время жизни токена
            );

            res.status(200).json({
                message: 'Вход выполнен успешно',
                token: token // Отправляем токен клиенту
            });
        } else {
            res.status(401).json({ message: 'Пароль не верный' });
        }
    } catch (error) {
        console.error('Error in /auth-tech:', error);
        res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
});

app.get('/api/admin/tickets', verifyAdminToken, async (req, res) => {
    // const adminInfo = req.admin; // Информация из токена, если нужна

    const statusFilter = req.query.status; // 'open', 'closed', 'all', 'waiting_for_user', 'in_progress', 'reopened'
    const sortBy = req.query.sortBy || 'updated_at';
    const sortOrder = req.query.sortOrder || 'DESC';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Базовые части запросов
    const selectClause = `
        SELECT
            t.id,
            t.ticket_number,
            t.subject,
            ts.name as status,
            u.fio as user_fio,
            u.email as user_email,
            u.company as user_company,
            t.created_at,
            t.updated_at,
            t.closed_at,
            (SELECT tm.message FROM ticket_messages tm
             WHERE tm.ticket_id = t.id
             ORDER BY tm.created_at ASC LIMIT 1) as first_message_snippet,
            (SELECT tm.created_at FROM ticket_messages tm
             WHERE tm.ticket_id = t.id
             ORDER BY tm.created_at DESC LIMIT 1) as last_message_at
    `;
    const fromClause = `
        FROM tickets t
        JOIN ticket_statuses ts ON t.status_id = ts.id
        JOIN users u ON t.user_id = u.id
    `;
    const countSelectClause = `SELECT COUNT(t.id)`; // Считаем по t.id для корректности с JOIN

    let whereClause = '';
    const queryParams = []; // Параметры для основного запроса (лимит, оффсет и, возможно, статус)
    const countQueryParams = []; // Параметры для запроса подсчета (только статус, если есть)


    if (statusFilter && statusFilter !== 'all') {
        if (statusFilter === 'open') {
            whereClause = `WHERE ts.name != 'closed'`;
        } else {
            // Для конкретных статусов (closed, waiting_for_user, in_progress, reopened, etc.)
            queryParams.push(statusFilter);
            countQueryParams.push(statusFilter); // Добавляем и для count запроса
            whereClause = `WHERE ts.name = $${queryParams.length}`; // Параметр будет $1
        }
    }

    let query = `${selectClause} ${fromClause} ${whereClause}`;
    let countQuery = `${countSelectClause} ${fromClause} ${whereClause}`; // countQuery использует тот же whereClause

    const allowedSortByFields = ['ticket_number', 'subject', 'status', 'user_fio', 'created_at', 'updated_at', 'last_message_at'];
    let safeSortByDbField = sortBy;
    if (sortBy === 'status') safeSortByDbField = 'ts.name';
    else if (sortBy === 'user_fio') safeSortByDbField = 'u.fio';
    else if (!allowedSortByFields.includes(sortBy)) safeSortByDbField = 'updated_at'; // Поле из t по умолчанию

    const safeSortBy = allowedSortByFields.includes(sortBy) ? safeSortByDbField : 't.updated_at';
    const safeSortOrder = (sortOrder.toUpperCase() === 'ASC' || sortOrder.toUpperCase() === 'DESC') ? sortOrder.toUpperCase() : 'DESC';

    query += ` ORDER BY ${safeSortBy} ${safeSortOrder}, t.id ${safeSortOrder}`;

    // Добавляем параметры для LIMIT и OFFSET после всех возможных параметров фильтрации
    queryParams.push(limit);
    query += ` LIMIT $${queryParams.length}`;
    queryParams.push(offset);
    query += ` OFFSET $${queryParams.length}`;

    let client;
    try {
        client = await pool.connect();
        const ticketsResult = await client.query(query, queryParams);
        const totalTicketsResult = await client.query(countQuery, countQueryParams); // Передаем параметры для count

        const totalTickets = parseInt(totalTicketsResult.rows[0].count, 10);

        res.status(200).json({
            tickets: ticketsResult.rows,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalTickets / limit),
                totalItems: totalTickets,
                itemsPerPage: limit
            }
        });
    } catch (error) {
        console.error('Error fetching all tickets for admin:', error);
        res.status(500).json({ message: 'Не удалось загрузить список заявок' });
    } finally {
        if (client) client.release();
    }
});


// --- Basic Root Route ---
app.get('/', (req, res) => {
    res.send('API is running!');
});


app.use((err, req, res, next) => {
    console.error('!!! UNHANDLED ERROR:', err.stack);
    res.status(500).json({ message: 'Непредвиденная ошибка сервера' });
});


// --- Start Server ---
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
    if (isProduction) {
        console.log('Running in production mode');
    } else {
        console.log('Running in development mode');
    }
    console.log(`Client URL configured for CORS: ${process.env.CLIENT_URL}`);
});
