/**
 * Testcontainers harness placeholder.
 * Integration tests in Phase 0 use the docker-compose.dev stack by default.
 * Full container-per-suite harness (Postgres + Redis + MinIO) can replace
 * startTestApp() when CI service containers are unavailable.
 */
export async function startTestApp(): Promise<never> {
  throw new Error(
    'Use docker compose -f docker/docker-compose.dev.yml and Nest TestingModule; full Testcontainers harness lands with expanded CI.',
  );
}

export async function stopTestApp(): Promise<void> {
  return;
}
