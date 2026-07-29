import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:8030';

export const options = {
  vus: 30,
  duration: '5m',
  thresholds: {
    http_req_duration: ['p(95)<600'],
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
  const payload = {
    attendanceDate: new Date().toISOString().slice(0, 10),
    shiftId: __ENV.SHIFT_ID || '00000000-0000-0000-0000-000000000001',
    marks: Array.from({ length: 40 }, (_, i) => ({
      studentId: `student-${i}`,
      status: 'present',
    })),
  };
  const res = http.post(
    `${BASE}/api/v1/school/attendance/bulk`,
    JSON.stringify(payload),
    {
      headers: {
        Authorization: `Bearer ${data.token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `k6-${__VU}-${__ITER}`,
      },
    },
  );
  check(res, {
    'bulk accepted or validation': (r) =>
      r.status === 200 || r.status === 201 || r.status === 400 || r.status === 422,
  });
  sleep(1);
}
