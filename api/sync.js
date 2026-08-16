// ============================================================
// api/sync.js — Vercel Serverless Function for Cloud Sync API
// ============================================================

// Global in-memory cache across serverless warm invocations
const memoryStore = globalThis.__syncStore || (globalThis.__syncStore = {});

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { key } = req.query;
  const syncKey = (key || '').trim();

  if (!syncKey) {
    return res.status(400).json({ error: 'Missing sync key' });
  }

  if (req.method === 'GET') {
    const data = memoryStore[syncKey] || null;
    if (!data) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    try {
      const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      memoryStore[syncKey] = {
        ...payload,
        updatedAt: payload.updatedAt || new Date().toISOString()
      };
      return res.status(200).json({ success: true, key: syncKey, updatedAt: memoryStore[syncKey].updatedAt });
    } catch (e) {
      return res.status(400).json({ error: 'Invalid body' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
