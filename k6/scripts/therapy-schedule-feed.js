import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 20,
  duration: '60s',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8030';
const TOKEN = __ENV.TEST_TOKEN || '';

export function setup() {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ username: 'superadmin', password: 'ChangeMeNow1' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  return { token: res.json('data.accessToken') };
}

export default function (data) {
  const token = data.token || TOKEN;
  const now = new Date();
  const from = now.toISOString();
  const to = new Date(now.getTime() + 30 * 86400000).toISOString();

  // Month-view schedule feed — target p95 < 500ms per TDD 14.2
  const res = http.get(
    `${BASE_URL}/therapy/sessions/schedule/feed?from=${from}&to=${to}&therapistId=dummy`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(0.5);
}
