export default async function globalTeardown(): Promise<void> {
  if (process.env.SSERP_USE_TESTCONTAINERS !== '1') return;
  const { stopContainers } =
    await import('../../src/shared/testing/container.harness');
  await stopContainers();
}
