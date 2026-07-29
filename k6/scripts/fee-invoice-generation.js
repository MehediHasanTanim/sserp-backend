import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:8030';

export const options = {
  vus: 5,
  duration: '2m',
  thresholds: {
    http_req_duration: ['p(95)<2000'],
  },
};

export function setup() {
  const login = http.post(
    `${BASE}/api/v1/auth/login`,
    JSON.stringify({
      identifier: __ENV.USER || 'superadmin',
      password: __ENV.PASSWORD || 'ChangeMeNow1',
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  const body = login.json();
  return { token: body.data?.accessToken };
}

export default function (data) {
  const now = new Date();
  const res = http.post(
    `${BASE}/api/v1/school/fee-invoices/generate-monthly`,
    JSON.stringify({
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
    }),
    {
      headers: {
        Authorization: `Bearer ${data.token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `fee-gen-${__VU}-${__ITER}`,
      },
    },
  );
  check(res, {
    'generation ok or auth/validation': (r) =>
      r.status === 200 ||
      r.status === 201 ||
      r.status === 400 ||
      r.status === 401 ||
      r.status === 403,
  });
  sleep(2);
}
