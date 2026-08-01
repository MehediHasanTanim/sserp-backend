import http from 'k6/http';
import { check, sleep } from 'k6';
import { getAuthToken } from '../lib/auth.js';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '30s', target: 100 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.02'],
  },
};

export default function () {
  const login = http.post(
    `${BASE}/api/v1/auth/login`,
    JSON.stringify({
      identifier: __ENV.USER || 'superadmin',
      password: __ENV.PASSWORD || 'ChangeMeNow1',
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(login, { 'login status': (r) => r.status === 201 || r.status === 401 });

  const token = getAuthToken('coordinator');
  const me = http.get(`${BASE}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check(me, { 'me responds': (r) => r.status < 500 });
  sleep(0.3);
}
