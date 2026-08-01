import http from 'k6/http';
import { check, sleep } from 'k6';
import { getAuthToken } from '../lib/auth.js';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '2m', target: 20 },
    { duration: '8m', target: 50 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<800'],
    http_req_failed: ['rate<0.005'],
  },
};

export default function () {
  const token = getAuthToken('coordinator');
  const headers = { Authorization: `Bearer ${token}` };
  const students = http.get(`${BASE}/api/v1/school/students?page=1&pageSize=20`, {
    headers,
  });
  const dashboard = http.get(`${BASE}/api/v1/dashboard`, { headers });
  const schedule = http.get(
    `${BASE}/api/v1/therapy/schedule?view=month&date=2026-09-01`,
    { headers },
  );
  check(students, { 'students ok': (r) => r.status === 200 || r.status === 401 });
  check(dashboard, {
    'dashboard ok': (r) => r.status === 200 || r.status === 401 || r.status === 403,
  });
  check(schedule, {
    'schedule ok': (r) => r.status === 200 || r.status === 401 || r.status === 403,
  });
  sleep(1);
}
