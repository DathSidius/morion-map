const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

// Папка для данных и загруженных картинок
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, './')));

// --- API локаций и фракций ---
const LOCATIONS_FILE = path.join(DATA_DIR, 'locations.json');

app.get('/api/locations', (req, res) => {
    if (fs.existsSync(LOCATIONS_FILE)) {
        res.json(JSON.parse(fs.readFileSync(LOCATIONS_FILE, 'utf8')));
    } else {
        res.json({ locations: [], version: 0 });
    }
});

app.post('/api/locations', (req, res) => {
    const { pin, locations } = req.body;
    const EDIT_PIN = process.env.EDIT_PIN || '1488';
    if (pin !== EDIT_PIN) return res.status(401).json({ error: 'Неверный PIN' });
    if (!Array.isArray(locations)) return res.status(400).json({ error: 'locations должен быть массивом' });

    const data = { locations, updatedAt: new Date().toISOString(), version: Date.now() };
    fs.writeFileSync(LOCATIONS_FILE, JSON.stringify(data, null, 2));
    res.json({ ok: true, version: data.version, count: locations.length });
});

// --- API загрузки картинок ---
app.post('/api/upload', (req, res) => {
    const { pin, data, mime } = req.body;
    const EDIT_PIN = process.env.EDIT_PIN || '1488';
    if (pin !== EDIT_PIN) return res.status(401).json({ error: 'Неверный PIN' });
    if (!data || !mime) return res.status(400).json({ error: 'Нужны поля data и mime' });

    try {
        const id = 'img-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        const ext = mime.split('/')[1] || 'jpg';
        const filename = `${id}.${ext}`;
        fs.writeFileSync(path.join(UPLOAD_DIR, filename), Buffer.from(data, 'base64'));
        res.json({ ok: true, id: id, url: `/data/uploads/${filename}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.use('/data/uploads', express.static(UPLOAD_DIR));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));