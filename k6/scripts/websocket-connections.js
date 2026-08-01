import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 150,
  duration: '5m',
};

const WS_URL = __ENV.WS_URL || 'ws://localhost:3000';
const TOKEN = __ENV.ACCESS_TOKEN || '';

export default function () {
  // Placeholder: k6 websocket module would connect with auth.token
  const res = http.get(`${__ENV.BASE_URL || 'http://localhost:3000'}/api/v1/health`);
  check(res, { 'health ok': (r) => r.status === 200 });
  sleep(1);
}
