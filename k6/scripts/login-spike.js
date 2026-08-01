import http from 'k6/http';
import { check, sleep } from 'k6';
import { getAuthToken } from '../lib/auth.js';

export const options = {
  stages: [
    { duration: '30s', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.02'],
  },
};

export default function () {
  getAuthToken('super_admin');
  const res = http.post(
    `${__ENV.BASE_URL || 'http://localhost:3000'}/api/v1/auth/login`,
    JSON.stringify({
      identifier: __ENV.USER || 'superadmin',
      password: __ENV.PASSWORD || 'ChangeMeNow1',
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(res, { 'status is 201': (r) => r.status === 201 });
  sleep(0.5);
}
