import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 20,
  duration: '60s',
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8030';

export function setup() {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ username: 'superadmin', password: 'ChangeMeNow1' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  return { token: res.json('data.accessToken') };
}

export default function (data) {
  const from = '2025-07-01';
  const to = '2026-07-01';
  const accountId = __ENV.ACCOUNT_ID || '00000000-0000-0000-0000-000000000000';
  const res = http.get(
    `${BASE_URL}/accounts/ledger/${accountId}?from=${from}&to=${to}`,
    { headers: { Authorization: `Bearer ${data.token}` } },
  );
  check(res, {
    'status ok or not found': (r) => r.status === 200 || r.status === 404,
  });
  sleep(0.3);
}
