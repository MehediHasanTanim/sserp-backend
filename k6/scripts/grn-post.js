import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 15,
  duration: '1m',
  thresholds: {
    http_req_failed: ['rate<0.05'],
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:3000/api/v1';
const TOKEN = __ENV.ACCESS_TOKEN || '';

/**
 * Stress GRN post endpoint. Requires seeded PO id via GRN_ID env for dry runs,
 * or create draft GRNs before the test window.
 */
export default function () {
  const grnId = __ENV.GRN_ID;
  if (!grnId) {
    sleep(1);
    return;
  }
  const res = http.post(`${BASE}/procurement/grns/${grnId}/post`, null, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  check(res, {
    'posted or already posted': (r) =>
      r.status === 200 || r.status === 201 || r.status === 409,
  });
  sleep(1);
}
