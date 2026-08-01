import http from 'k6/http';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';
const cache = {};

/**
 * Shared auth helper for k6 scripts.
 * Prefers pre-issued JWT via AUTH_TOKEN_* env; falls back to password login.
 */
export function getAuthToken(role = 'coordinator') {
  const envKey = `AUTH_TOKEN_${String(role).toUpperCase()}`;
  if (__ENV[envKey]) return __ENV[envKey];
  if (cache[role]) return cache[role];

  const identifier =
    __ENV[`USER_${String(role).toUpperCase()}`] ||
    __ENV.USER ||
    (role === 'super_admin' ? 'superadmin' : role);
  const password = __ENV.PASSWORD || 'ChangeMeNow1';

  const res = http.post(
    `${BASE}/api/v1/auth/login`,
    JSON.stringify({ identifier, password }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (res.status !== 201) {
    // Return empty — callers should tolerate 401 under load when seed users missing.
    return '';
  }
  const body = JSON.parse(res.body);
  const token = body?.data?.accessToken || '';
  cache[role] = token;
  return token;
}
