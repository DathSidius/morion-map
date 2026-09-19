require('dotenv').config();
const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const EDIT_PIN = process.env.EDIT_PIN || '1488';

// --- Подключение к PostgreSQL ---
// RelaxDev сам передаст строку подключения через переменную DATABASE_URL
if (!process.env.DATABASE_URL) {
    console.error('Нет DATABASE_URL. Включи базу данных в настройках проекта RelaxDev.');
    process.exit(1);
}

// На RelaxDev PostgreSQL находится внутри частной сети, SSL не нужен
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false
});

// --- Инициализация схемы ---
async function initDatabase() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS locations (
            id TEXT PRIMARY KEY,
            kind TEXT,
            name TEXT,
            data JSONB NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS images (
            id TEXT PRIMARY KEY,
            mime TEXT NOT NULL,
            data BYTEA NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    console.log('Таблицы locations и images готовы.');
}

app.use(express.json({ limit: '10mb' }));

// ============================================================
//  ЛОКАЦИИ
// ============================================================

app.get('/api/locations', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT data FROM locations ORDER BY updated_at DESC'
        );
        res.json({ locations: result.rows.map(r => r.data) });
    } catch (err) {
        console.error('GET /api/locations:', err);
        res.status(500).json({ error: 'Ошибка БД' });
    }
});

app.post('/api/locations', async (req, res) => {
    const { pin, locations } = req.body;
    if (pin !== EDIT_PIN) return res.status(401).json({ error: 'Неверный PIN' });
    if (!Array.isArray(locations)) {
        return res.status(400).json({ error: 'locations должен быть массивом' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM locations');

        const insertQuery = `
            INSERT INTO locations (id, kind, name, data)
            VALUES ($1, $2, $3, $4)
        `;
        for (const loc of locations) {
            await client.query(insertQuery, [
                loc.id,
                loc.kind || 'location',
                loc.name || '',
                JSON.stringify(loc)
            ]);
        }

        await client.query('COMMIT');
        res.json({ ok: true, count: locations.length });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('POST /api/locations:', err);
        res.status(500).json({ error: 'Ошибка БД: ' + err.message });
    } finally {
        client.release();
    }
});

// ============================================================
//  КАРТИНКИ
// ============================================================

app.post('/api/upload', async (req, res) => {
    const { pin, data, mime } = req.body;
    if (pin !== EDIT_PIN) return res.status(401).json({ error: 'Неверный PIN' });
    if (!data || !mime) {
        return res.status(400).json({ error: 'Нужны поля data и mime' });
    }

    try {
        const id = 'img-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        const buffer = Buffer.from(data, 'base64');

        if (buffer.length > 5 * 1024 * 1024) {
            return res.status(413).json({ error: 'Файл больше 5 МБ' });
        }

        await pool.query(
            'INSERT INTO images (id, mime, data) VALUES ($1, $2, $3)',
            [id, mime, buffer]
        );

        res.json({ ok: true, id, url: `/api/image/${id}` });
    } catch (err) {
        console.error('POST /api/upload:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/image/:id', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT mime, data FROM images WHERE id = $1',
            [req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).send('Не найдено');

        const { mime, data } = result.rows[0];
        res.set('Content-Type', mime);
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        res.send(data);
    } catch (err) {
        console.error('GET /api/image:', err);
        res.status(500).send('Ошибка сервера');
    }
});

// ============================================================
//  СТАТИКА И SPA FALLBACK
// ============================================================

app.use(express.static(path.join(__dirname, './')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================================
//  СТАРТ
// ============================================================

initDatabase()
    .then(() => {
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Server running on port ${PORT}`);
        });
    })
    .catch(err => {
        console.error('Не удалось запустить сервер:', err);
        process.exit(1);
    });
    //