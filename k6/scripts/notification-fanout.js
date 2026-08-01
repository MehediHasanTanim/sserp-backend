import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,
  duration: '1m',
};

export default function () {
  const base = __ENV.BASE_URL || 'http://localhost:3000';
  const res = http.post(
    `${base}/api/v1/admin/notifications/test-send`,
    JSON.stringify({
      typeCode: 'inventory.stock.low',
      channels: ['in_app', 'email'],
    }),
    { headers: { Authorization: `Bearer ${__ENV.ADMIN_TOKEN || ''}`, 'Content-Type': 'application/json' } },
  );
  check(res, { 'fanout accepted': (r) => r.status === 200 || r.status === 201 });
  sleep(0.5);
}
