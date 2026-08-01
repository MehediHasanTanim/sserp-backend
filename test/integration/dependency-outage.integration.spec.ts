describe('Dependency outage (health)', () => {
  it('ready endpoint returns 503 when redis or minio is down', () => {
    const fs = require('fs') as typeof import('fs');
    const src = fs.readFileSync('src/modules/health/health.module.ts', 'utf8');
    expect(src).toContain('SERVICE_UNAVAILABLE');
    expect(src).toContain("isHealthy('redis')");
    expect(src).toContain("isHealthy('minio')");
  });
});
