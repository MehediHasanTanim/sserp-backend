import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 15,
  duration: '5m',
  thresholds: {
    http_req_duration: ['p(95)<2000'],
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:3000/api/v1';
const TOKEN = __ENV.ACCESS_TOKEN || '';
const REPORT_CODE = __ENV.REPORT_CODE || 'school.enrollment-summary';

export default function () {
  const year = new Date().getUTCFullYear();
  const queueRes = http.post(
    `${BASE}/reports/${REPORT_CODE}/export`,
    JSON.stringify({
      format: 'xlsx',
      parameters: {
        fromDate: `${year}-01-01`,
        toDate: `${year}-12-31`,
      },
    }),
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
    },
  );

  const queued = check(queueRes, {
    'export queued': (r) => r.status === 201 || r.status === 200,
  });

  if (!queued) {
    sleep(1);
    return;
  }

  const jobId =
    queueRes.json('data.jobId') ||
    queueRes.json('jobId') ||
    queueRes.json('data.id');

  if (!jobId) {
    sleep(1);
    return;
  }

  const pollRes = http.get(`${BASE}/reports/export/${jobId}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });

  check(pollRes, {
    'poll responds': (r) =>
      r.status === 200 &&
      ['queued', 'running', 'completed', 'failed'].includes(
        r.json('data.status') || r.json('status') || '',
      ),
  });

  sleep(0.5);
}
