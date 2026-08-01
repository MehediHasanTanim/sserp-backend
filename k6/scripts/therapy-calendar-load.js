import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,
  duration: '1m',
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.005'],
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:3000/api/v1';
const TOKEN = __ENV.ACCESS_TOKEN || '';

export default function () {
  const res = http.get(`${BASE}/therapy/sessions?from=2026-08-01&to=2026-08-31`, {
    headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
  });
  check(res, {
    'calendar status ok or auth': (r) => r.status === 200 || r.status === 401,
  });
  sleep(1);
}
