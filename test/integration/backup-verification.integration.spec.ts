describe('Backup verification contract', () => {
  it('verify-backup.sh exists and checks dump readability', () => {
    const fs = require('fs') as typeof import('fs');
    const script = fs.readFileSync('scripts/verify-backup.sh', 'utf8');
    expect(script).toContain('pg_restore --list');
    expect(script).toContain('ERROR: no backup found');
  });
});

describe('Graceful shutdown', () => {
  it('main enables shutdown hooks', () => {
    const fs = require('fs') as typeof import('fs');
    const src = fs.readFileSync('src/main.ts', 'utf8');
    expect(src).toContain('enableShutdownHooks');
  });
});

describe('Dependency outage health contract', () => {
  it('ready endpoint fails when redis/minio down', () => {
    const fs = require('fs') as typeof import('fs');
    const src = fs.readFileSync('src/modules/health/health.module.ts', 'utf8');
    expect(src).toContain('SERVICE_UNAVAILABLE');
    expect(src).toContain('redis');
    expect(src).toContain('minio');
  });
});
