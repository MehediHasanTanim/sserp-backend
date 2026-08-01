import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 20,
  duration: '3m',
  thresholds: {
    http_req_failed: ['rate<0.1'],
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:3000/api/v1';
const TOKEN = __ENV.ACCESS_TOKEN || '';

const HEAVY_CODES = [
  'school.attendance-monthly-summary',
  'school.fee-collection',
  'therapy.therapist-utilization',
  'therapy.revenue',
  'finance.pnl',
  'finance.trial-balance',
  'executive.monthly-management-summary',
];

export default function () {
  const code = HEAVY_CODES[__VU % HEAVY_CODES.length];
  const year = new Date().getUTCFullYear();
  const res = http.get(
    `${BASE}/reports/${code}?fromDate=${year}-01-01&toDate=${year}-12-31`,
    { headers: { Authorization: `Bearer ${TOKEN}` } },
  );

  check(res, {
    'heavy report async or ok': (r) =>
      r.status === 202 || r.status === 200 || r.status === 422,
    'not server error': (r) => r.status < 500,
  });

  sleep(0.4);
}
