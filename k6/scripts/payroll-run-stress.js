import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:8030';

export const options = {
  vus: 10,
  duration: '3m',
  thresholds: {
    http_req_duration: ['p(95)<3000'],
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
    `${BASE}/api/v1/hr/payroll/run`,
    JSON.stringify({
      payrollGroupId: __ENV.PAYROLL_GROUP_ID || '00000000-0000-0000-0000-000000000001',
      periodMonth: now.getUTCMonth() + 1,
      periodYear: now.getUTCFullYear(),
      notes: `k6 stress vu=${__VU} iter=${__ITER}`,
    }),
    {
      headers: {
        Authorization: `Bearer ${data.token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `payroll-run-${__VU}-${__ITER}`,
      },
    },
  );
  check(res, {
    'queued or validation/auth': (r) =>
      r.status === 200 ||
      r.status === 201 ||
      r.status === 400 ||
      r.status === 401 ||
      r.status === 403 ||
      r.status === 409 ||
      r.status === 422,
    'did not block > 5s': (r) => r.timings.duration < 5000,
  });
  sleep(1);
}
