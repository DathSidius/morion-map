const { getStore } = require('@netlify/blobs');

const PIN = process.env.EDIT_PIN || '1488';
const STORE_NAME = 'morion-map';
const KEY = 'locations.json';

exports.handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    const store = getStore(STORE_NAME);

    // === GET: возвращает все локации ===
    if (event.httpMethod === 'GET') {
        try {
            const data = await store.get(KEY, { type: 'json' });
            if (!data) {
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ locations: [], version: 0 })
                };
            }
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(data)
            };
        } catch (err) {
            console.error('GET error:', err);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: err.message })
            };
        }
    }

    // === POST: сохраняет все локации ===
    if (event.httpMethod === 'POST') {
        try {
            const body = JSON.parse(event.body || '{}');
            
            // Проверка PIN
            if (body.pin !== PIN) {
                return {
                    statusCode: 401,
                    headers,
                    body: JSON.stringify({ error: 'Неверный PIN' })
                };
            }

            if (!Array.isArray(body.locations)) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'locations должен быть массивом' })
                };
            }

            const data = {
                locations: body.locations,
                updatedAt: new Date().toISOString(),
                version: (body.version || 0) + 1
            };

            await store.setJSON(KEY, data);

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ ok: true, version: data.version })
            };
        } catch (err) {
            console.error('POST error:', err);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: err.message })
            };
        }
    }

    return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: 'Method not allowed' })
    };
};