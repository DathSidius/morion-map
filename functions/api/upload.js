export async function onRequest(context) {
    const { request, env } = context;
    const method = request.method;
    const url = new URL(request.url);

    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (method === 'OPTIONS') {
        return new Response('', { status: 200, headers });
    }

    const PIN = env.EDIT_PIN || '1488';

    if (method === 'GET') {
        const imgId = url.searchParams.get('img');
        if (!imgId) return new Response('Not found', { status: 404, headers });
        try {
            const data = await env.MORION_IMAGES.get(imgId, { type: 'arrayBuffer' });
            if (!data) return new Response('Not found', { status: 404, headers });
            const metaRaw = await env.MORION_IMAGES.get(imgId + '.meta');
            const meta = metaRaw ? JSON.parse(metaRaw) : {};

            return new Response(data, {
                status: 200,
                headers: {
                    ...headers,
                    'Content-Type': meta.mime || 'image/jpeg',
                    'Cache-Control': 'public, max-age=86400'
                }
            });
        } catch (err) {
            return new Response('Error: ' + err.message, { status: 500, headers });
        }
    }

    if (method === 'POST') {
        try {
            const body = await request.json();

            if (body.pin !== PIN) {
                return new Response(JSON.stringify({ error: 'Неверный PIN' }), {
                    status: 401,
                    headers: { ...headers, 'Content-Type': 'application/json' }
                });
            }

            if (!body.data || !body.mime) {
                return new Response(JSON.stringify({ error: 'Нужны поля data и mime' }), {
                    status: 400,
                    headers: { ...headers, 'Content-Type': 'application/json' }
                });
            }

            const sizeBytes = Math.round(body.data.length * 0.75);
            if (sizeBytes > 3 * 1024 * 1024) {
                return new Response(JSON.stringify({ error: 'Файл больше 3 МБ' }), {
                    status: 413,
                    headers: { ...headers, 'Content-Type': 'application/json' }
                });
            }

            const id = 'img-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
            const binary = atob(body.data);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

            await env.MORION_IMAGES.put(id, bytes);
            await env.MORION_IMAGES.put(id + '.meta', JSON.stringify({ mime: body.mime, uploadedAt: new Date().toISOString() }));

            return new Response(JSON.stringify({
                ok: true,
                id: id,
                url: '/api/upload?img=' + id
            }), {
                status: 200,
                headers: { ...headers, 'Content-Type': 'application/json' }
            });
        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), {
                status: 500,
                headers: { ...headers, 'Content-Type': 'application/json' }
            });
        }
    }

    return new Response('Method not allowed', { status: 405, headers });
}