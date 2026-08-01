/**
 * Starts Testcontainers when SSERP_USE_TESTCONTAINERS=1.
 * Otherwise relies on external docker-compose / CI service containers.
 */
export default async function globalSetup(): Promise<void> {
  if (process.env.SSERP_USE_TESTCONTAINERS !== '1') {
    if (!process.env.DATABASE_URL) {
      console.warn(
        '[integration globalSetup] DATABASE_URL unset and Testcontainers disabled. Set SSERP_USE_TESTCONTAINERS=1 or provide a running stack.',
      );
    }
    return;
  }

  const { startContainers } =
    await import('../../src/shared/testing/container.harness');
  await startContainers();
}
