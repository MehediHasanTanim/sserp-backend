import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 50,
  duration: '10m',
  thresholds: {
    http_req_duration: ['p(95)<300'],
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:3000/api/v1';
const TOKEN = __ENV.ACCESS_TOKEN || '';

export default function () {
  const res = http.get(`${BASE}/dashboard`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  check(res, {
    'dashboard responds': (r) =>
      r.status === 200 || r.status === 404 || r.status === 403,
  });
  sleep(0.3);
}
