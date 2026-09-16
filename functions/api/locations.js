export async function onRequest(context) {
    const { request, env } = context;
    const method = request.method;

    const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (method === 'OPTIONS') {
        return new Response('', { status: 200, headers });
    }

    const PIN = env.EDIT_PIN || '1488';

    if (method === 'GET') {
        try {
            const raw = await env.MORION_LOCATIONS.get('locations');
            const data = raw ? JSON.parse(raw) : { locations: [], version: 0 };
            return new Response(JSON.stringify(data), { status: 200, headers });
        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
        }
    }

    if (method === 'POST') {
        try {
            const body = await request.json();

            if (body.pin !== PIN) {
                return new Response(JSON.stringify({ error: 'Неверный PIN' }), { status: 401, headers });
            }

            if (body.locations === null || body.locations === undefined) {
                return new Response(JSON.stringify({ ok: true, message: 'PIN верный' }), { status: 200, headers });
            }

            if (!Array.isArray(body.locations)) {
                return new Response(JSON.stringify({ error: 'locations должен быть массивом' }), { status: 400, headers });
            }

            const data = {
                locations: body.locations,
                updatedAt: new Date().toISOString(),
                version: (body.version || 0) + 1
            };

            await env.MORION_LOCATIONS.put('locations', JSON.stringify(data));

            return new Response(JSON.stringify({ ok: true, version: data.version, count: body.locations.length }), { status: 200, headers });
        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
        }
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
}