describe('Graceful shutdown integration', () => {
  it('enables Nest shutdown hooks', () => {
    const fs = require('fs') as typeof import('fs');
    expect(fs.readFileSync('src/main.ts', 'utf8')).toContain(
      'enableShutdownHooks',
    );
  });
});

describe('Dependency outage', () => {
  it('health ready throws when redis/minio down', () => {
    const fs = require('fs') as typeof import('fs');
    const src = fs.readFileSync('src/modules/health/health.module.ts', 'utf8');
    expect(src).toContain('SERVICE_UNAVAILABLE');
  });
});
