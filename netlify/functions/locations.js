const { getStore } = require('@netlify/blobs');

const PIN = process.env.EDIT_PIN || '1488';
const STORE_NAME = 'morion-map';
const KEY = 'locations.json';

// Получаем хранилище с явными учётными данными
function getBlobStore() {
    const siteID = process.env.BLOBS_SITE_ID;
    const token = process.env.BLOBS_TOKEN;

    if (!siteID || !token) {
        throw new Error('Не заданы переменные BLOBS_SITE_ID и/или BLOBS_TOKEN в Netlify');
    }

    return getStore({
        name: STORE_NAME,
        siteID: siteID,
        token: token
    });
}

exports.handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };

    // CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // ============ GET: возвращает все локации ============
    if (event.httpMethod === 'GET') {
        try {
            const store = getBlobStore();
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
                body: JSON.stringify({
                    error: 'Не удалось прочитать данные',
                    message: err.message
                })
            };
        }
    }

    // ============ POST: сохраняет все локации ============
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

            // Если пришёл только PIN без locations — значит это проверка PIN
            if (body.locations === null || body.locations === undefined) {
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ ok: true, message: 'PIN верный' })
                };
            }

            // Проверка, что locations — массив
            if (!Array.isArray(body.locations)) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'locations должен быть массивом' })
                };
            }

            const store = getBlobStore();
            const data = {
                locations: body.locations,
                updatedAt: new Date().toISOString(),
                version: (body.version || 0) + 1
            };

            await store.setJSON(KEY, data);

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    ok: true,
                    version: data.version,
                    count: body.locations.length
                })
            };
        } catch (err) {
            console.error('POST error:', err);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    error: 'Не удалось сохранить данные',
                    message: err.message
                })
            };
        }
    }

    return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: 'Method not allowed' })
    };
};
