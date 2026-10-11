// Lonca Panel waitlist: accepts sign-ups from lonca.zanaat.dev and stores them
// in Cloudflare D1. One row per email; a repeat sign-up updates needs/volume.
// No third-party services, no tracking.

const ALLOWED_ORIGINS = new Set([
  'https://lonca.zanaat.dev',
  'http://127.0.0.1:4410',
  'http://localhost:4321',
]);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NEEDS = 10;

function cors(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : 'https://lonca.zanaat.dev';
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

function json(status, body, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors(origin) },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') ?? '';
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' }, origin);
    if (!ALLOWED_ORIGINS.has(origin)) return json(403, { error: 'origin_not_allowed' }, origin);

    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: 'invalid_json' }, origin);
    }

    const email = String(body?.email ?? '')
      .trim()
      .toLowerCase();
    if (email.length > 254 || !EMAIL.test(email))
      return json(400, { error: 'invalid_email' }, origin);
    const lang = body?.lang === 'en' ? 'en' : 'tr';
    const source = String(body?.source ?? '').slice(0, 20);
    const needs = Array.isArray(body?.needs)
      ? body.needs.map((n) => String(n).slice(0, 40)).slice(0, MAX_NEEDS)
      : [];
    const volume = String(body?.volume ?? '').slice(0, 20);

    await env.DB.prepare(
      `INSERT INTO waitlist (email, lang, source, needs, volume, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), datetime('now'))
       ON CONFLICT(email) DO UPDATE SET
         needs = CASE WHEN excluded.needs = '[]' THEN waitlist.needs ELSE excluded.needs END,
         volume = CASE WHEN excluded.volume = '' THEN waitlist.volume ELSE excluded.volume END,
         updated_at = datetime('now')`,
    )
      .bind(email, lang, source, JSON.stringify(needs), volume)
      .run();

    return json(201, { ok: true }, origin);
  },
};
