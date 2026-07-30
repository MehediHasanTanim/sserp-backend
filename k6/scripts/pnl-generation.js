import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<5000'],
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
  const year = new Date().getUTCFullYear();
  const res = http.get(
    `${BASE_URL}/accounts/reports/pnl?from=${year}-01-01&to=${year}-12-31`,
    { headers: { Authorization: `Bearer ${data.token}` } },
  );
  check(res, {
    'pnl responds': (r) => r.status === 200 || r.status === 400 || r.status === 404,
  });
  sleep(1);
}
