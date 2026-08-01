import http from 'k6/http';
import { check, sleep } from 'k6';
import { getAuthToken } from '../lib/auth.js';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '1m', target: 10 },
    { duration: '3m', target: 20 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<600'],
    http_req_failed: ['rate<0.005'],
  },
};

export default function () {
  const token = getAuthToken('coordinator');
  const groupId = __ENV.GROUP_ID || '00000000-0000-0000-0000-000000000001';
  const res = http.post(
    `${BASE}/api/v1/therapy/groups/${groupId}/sessions`,
    JSON.stringify({
      startAt: '2026-09-01T09:00:00.000Z',
      durationMinutes: 45,
      recurring: true,
    }),
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    },
  );
  check(res, {
    'accepted or client error (seeded)': (r) =>
      r.status === 201 || r.status === 200 || r.status === 404 || r.status === 422,
  });
  sleep(1);
}
