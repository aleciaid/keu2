/**
 * Helper HTTP bersama untuk Netlify Function: bentuk respons, CORS, dan
 * pembacaan body/token. Semua respons berbentuk JSON.
 */

export class ApiError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function corsHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  if (!origin) return {};

  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return {};
  }

  const allowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const requestHost = event.headers?.host || '';
  const isSameOrigin = !allowed.length && originHost === requestHost;
  if (!isSameOrigin && !allowed.includes(origin)) return {};

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

export function json(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
    body: JSON.stringify(body),
  };
}

export function parseBody(event) {
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : event.body || '';

  if (!raw.trim()) return {};

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('bukan objek');
    }
    return parsed;
  } catch {
    throw new ApiError(400, 'invalid_json', 'Body permintaan bukan JSON yang valid.');
  }
}

/** Token diambil dari header Authorization, dengan fallback ke body. */
export function readToken(event, body) {
  const header = event.headers?.authorization || event.headers?.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (match) return match[1].trim();

  const fromBody = body?.token;
  return typeof fromBody === 'string' ? fromBody.trim() : '';
}

export function clientIp(event) {
  const forwarded = event.headers?.['x-nf-client-connection-ip']
    || event.headers?.['x-forwarded-for']
    || '';
  return forwarded.split(',')[0].trim() || 'unknown';
}

export function userAgent(event) {
  return String(event.headers?.['user-agent'] || '').slice(0, 120);
}

/**
 * Pembungkus handler: menangani preflight, validasi metode, dan mengubah
 * ApiError maupun error tak terduga menjadi respons JSON.
 */
export function wrap(handler) {
  return async (event) => {
    const cors = corsHeaders(event);

    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: cors, body: '' };
    }
    if (event.httpMethod !== 'POST') {
      return json(405, { error: 'method_not_allowed', message: 'Gunakan POST.' }, cors);
    }

    try {
      return await handler(event, cors);
    } catch (error) {
      if (error instanceof ApiError) {
        return json(error.statusCode, { error: error.code, message: error.message }, cors);
      }
      if (error?.code === 'NOT_CONFIGURED' || error?.code === 'INVALID_PREFIX') {
        return json(500, { error: 'server_not_configured', message: error.message }, cors);
      }
      if (error?.code === 'ER_ACCESS_DENIED_ERROR' || error?.code === 'ECONNREFUSED' || error?.code === 'ETIMEDOUT') {
        return json(503, {
          error: 'database_unreachable',
          message: 'Tidak bisa terhubung ke database. Periksa DATABASE_URL dan akses jaringan.',
        }, cors);
      }
      console.error('[api] unhandled error:', error?.message);
      return json(500, { error: 'server_error', message: 'Terjadi kesalahan di server.' }, cors);
    }
  };
}
