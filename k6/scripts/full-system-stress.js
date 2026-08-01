import http from 'k6/http';
import { check, sleep } from 'k6';
import { getAuthToken } from '../lib/auth.js';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '3m', target: 150 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<800'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const token = getAuthToken('accountant');
  const headers = { Authorization: `Bearer ${token}` };
  const ledger = http.get(`${BASE}/api/v1/accounts/ledger?page=1`, { headers });
  const stock = http.get(`${BASE}/api/v1/inventory/stock-levels`, { headers });
  check(ledger, {
    'ledger responds': (r) => r.status < 500,
  });
  check(stock, {
    'stock responds': (r) => r.status < 500,
  });
  sleep(0.5);
}
