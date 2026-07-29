import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:8030';

export const options = {
  vus: 50,
  duration: '10m',
  thresholds: {
    http_req_duration: ['p(95)<300'],
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
  const res = http.get(`${BASE}/api/v1/school/students?page=1&pageSize=20`, {
    headers: { Authorization: `Bearer ${data.token}` },
  });
  check(res, { 'students 200': (r) => r.status === 200 });
  sleep(1);
}
