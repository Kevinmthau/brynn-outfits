const fs = require('node:fs/promises');
const path = require('node:path');
const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'brynn-outfits';
const STORE_KEY = 'collections.json';

function jsonResponse(statusCode, payload) {
    return {
        statusCode,
        headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store'
        },
        body: JSON.stringify(payload)
    };
}

function readHeader(event, name) {
    const headers = event?.headers || {};
    return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || '';
}

async function loadBundledDefaultData(event) {
    const candidates = [
        path.resolve(process.cwd(), 'data', 'collections.json'),
        path.resolve(__dirname, '..', '..', 'data', 'collections.json')
    ];

    for (const candidate of candidates) {
        try {
            const raw = await fs.readFile(candidate, 'utf-8');
            return JSON.parse(raw);
        } catch (error) {
            // Try next candidate path.
        }
    }

    const host = readHeader(event, 'x-forwarded-host') || readHeader(event, 'host');
    const proto = readHeader(event, 'x-forwarded-proto') || 'https';
    if (host) {
        const fallbackUrl = `${proto}://${host}/data/collections.json`;
        const response = await fetch(fallbackUrl);
        if (response.ok) {
            return response.json();
        }
    }

    throw new Error('Unable to load default collections data.');
}

async function loadStoredData(event) {
    const store = getStore({ name: STORE_NAME });

    try {
        const stored = await store.get(STORE_KEY, { type: 'text' });
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (error) {
        // Fallback to bundled data if the store is empty or unavailable.
    }

    return loadBundledDefaultData(event);
}

async function saveStoredData(payload) {
    const store = getStore({ name: STORE_NAME });
    await store.set(STORE_KEY, JSON.stringify(payload));
}

function hasValidEditKey(event) {
    const required = String(process.env.EDIT_API_KEY || '').trim();
    if (!required) return true;
    const provided = String(readHeader(event, 'x-edit-key') || '').trim();
    return provided === required;
}

exports.handler = async (event) => {
    const method = String(event?.httpMethod || 'GET').toUpperCase();

    if (method === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: {
                'access-control-allow-origin': '*',
                'access-control-allow-methods': 'GET,POST,OPTIONS',
                'access-control-allow-headers': 'content-type,x-edit-key'
            },
            body: ''
        };
    }

    if (method === 'GET') {
        try {
            const data = await loadStoredData(event);
            return jsonResponse(200, data);
        } catch (error) {
            return jsonResponse(500, { error: 'Failed to load collections data.' });
        }
    }

    if (method === 'POST') {
        if (!hasValidEditKey(event)) {
            return jsonResponse(401, { error: 'Unauthorized.' });
        }

        let payload;
        try {
            payload = JSON.parse(event.body || '{}');
        } catch (error) {
            return jsonResponse(400, { error: 'Request body must be valid JSON.' });
        }

        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            return jsonResponse(400, { error: 'Request body must be a JSON object.' });
        }
        if (!payload.all_index || typeof payload.all_index !== 'object') {
            return jsonResponse(400, { error: 'Missing or invalid all_index.' });
        }
        if (!payload.all_items || typeof payload.all_items !== 'object') {
            return jsonResponse(400, { error: 'Missing or invalid all_items.' });
        }

        try {
            await saveStoredData(payload);
            return jsonResponse(200, { ok: true, data: payload });
        } catch (error) {
            return jsonResponse(500, { error: 'Failed to persist collections data.' });
        }
    }

    return jsonResponse(405, { error: 'Method not allowed.' });
};
