// SOLO PARA PRUEBAS LOCALES. Sustituto mínimo de Supabase para la prueba de humo:
//   · /auth/v1/*  → autenticación ficticia (usuarios de e2e/seed.sql, JWT HS256 firmado localmente)
//   · /rest/v1/*  → proxy a PostgREST local, que aplica la RLS real de las migraciones.
// Sin dependencias. Nunca apuntar a un proyecto Supabase real.
import { createHmac, randomUUID } from 'node:crypto';
import http from 'node:http';

const PORT = Number(process.env.STACK_PORT ?? 54321);
const POSTGREST_URL = process.env.POSTGREST_URL ?? 'http://127.0.0.1:3000';
export const JWT_SECRET = process.env.JWT_SECRET ?? 'dermapex-e2e-local-secret-not-for-production-000';

// Cuentas ficticias (deben coincidir con e2e/seed.sql).
const USERS = {
  'cmo@e2e.test': { id: 'aaaaaaaa-e2e0-4000-8000-000000000001', password: 'e2e-password' },
  'estandar@e2e.test': { id: 'bbbbbbbb-e2e0-4000-8000-000000000001', password: 'e2e-password' },
  'coordinacion@e2e.test': { id: 'cccccccc-e2e0-4000-8000-000000000001', password: 'e2e-password' },
};

const b64url = (input) => Buffer.from(input).toString('base64url');
export function signJwt(payload) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const signature = createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}
function decodeJwt(token) {
  const [header, body, signature] = String(token ?? '').split('.');
  if (!signature) return null;
  const expected = createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return expected === signature ? JSON.parse(Buffer.from(body, 'base64url').toString()) : null;
}

export const ANON_KEY = signJwt({ role: 'anon', iss: 'dermapex-e2e', iat: 1767225600, exp: 4102444800 });

function userObject(email, id) {
  return { id, aud: 'authenticated', role: 'authenticated', email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-10-06T00:00:00Z' };
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Profile, Preference-Applied');
}

function json(res, status, payload) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/auth/v1/token') {
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    const email = Object.keys(USERS).find((e) => e === String(body.email ?? '').toLowerCase());
    if (!email || USERS[email].password !== body.password) {
      json(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', msg: 'Invalid login credentials' });
      return;
    }
    const now = Math.floor(Date.now() / 1000);
    const { id } = USERS[email];
    const accessToken = signJwt({ sub: id, role: 'authenticated', aud: 'authenticated', email, iat: now, exp: now + 3600 });
    json(res, 200, { access_token: accessToken, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: randomUUID(), user: userObject(email, id) });
    return;
  }
  if (url.pathname === '/auth/v1/user') {
    const claims = decodeJwt((req.headers.authorization ?? '').replace(/^Bearer /, ''));
    if (!claims?.sub) {
      json(res, 401, { msg: 'invalid JWT', code: 'bad_jwt' });
      return;
    }
    json(res, 200, userObject(claims.email, claims.sub));
    return;
  }
  if (url.pathname === '/auth/v1/logout') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname.startsWith('/rest/v1')) {
    const target = `${POSTGREST_URL}${url.pathname.replace(/^\/rest\/v1/, '') || '/'}${url.search}`;
    const headers = {};
    for (const name of ['authorization', 'content-type', 'prefer', 'accept', 'range', 'accept-profile', 'content-profile']) {
      if (req.headers[name]) headers[name] = req.headers[name];
    }
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);
    const upstream = await fetch(target, { method: req.method, headers, body });
    cors(res);
    const passHeaders = {};
    for (const name of ['content-type', 'content-range', 'preference-applied']) {
      const value = upstream.headers.get(name);
      if (value) passHeaders[name] = value;
    }
    res.writeHead(upstream.status, passHeaders);
    res.end(Buffer.from(await upstream.arrayBuffer()));
    return;
  }

  json(res, 404, { msg: `Ruta no simulada: ${url.pathname}` });
});

if (process.argv[2] === '--print-anon-key') {
  process.stdout.write(ANON_KEY);
} else {
  server.listen(PORT, '127.0.0.1', () => console.log(`local-stack escuchando en http://127.0.0.1:${PORT}`));
}
