const { getStore } = require('@netlify/blobs');

const PIN = process.env.EDIT_PIN || '1488';
const STORE_NAME = 'morion-images';

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    const store = getStore(STORE_NAME);
    const qs = event.queryStringParameters || {};

    // === GET ?img=ID — вернуть картинку ===
    if (event.httpMethod === 'GET' && qs.img) {
        try {
            const data = await store.get(qs.img, { type: 'arrayBuffer' });
            if (!data) {
                return { statusCode: 404, headers, body: 'Not found' };
            }
            const meta = await store.get(qs.img + '.meta', { type: 'json' }) || {};
            return {
                statusCode: 200,
                headers: {
                    ...headers,
                    'Content-Type': meta.mime || 'image/jpeg',
                    'Cache-Control': 'public, max-age=86400'
                },
                body: Buffer.from(data).toString('base64'),
                isBase64Encoded: true
            };
        } catch (err) {
            return { statusCode: 500, headers, body: err.message };
        }
    }

    // === POST — загрузить картинку ===
    if (event.httpMethod === 'POST') {
        try {
            const body = JSON.parse(event.body || '{}');

            if (body.pin !== PIN) {
                return {
                    statusCode: 401,
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ error: 'Неверный PIN' })
                };
            }

            if (!body.data || !body.mime) {
                return {
                    statusCode: 400,
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ error: 'Нужны поля data и mime' })
                };
            }

            // data — base64 без префикса "data:image/..."
            const id = 'img-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
            const buffer = Buffer.from(body.data, 'base64');

            await store.set(id, buffer);
            await store.setJSON(id + '.meta', { mime: body.mime });

            return {
                statusCode: 200,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ ok: true, id, url: '/api/image/' + id })
            };
        } catch (err) {
            console.error('Upload error:', err);
            return {
                statusCode: 500,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: err.message })
            };
        }
    }

    return { statusCode: 405, headers, body: 'Method not allowed' };
};