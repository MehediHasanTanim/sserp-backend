import { INestApplication } from '@nestjs/common';
import {
  startTestApp,
  TestContext,
} from '../../src/shared/testing/container.harness';

/**
 * Shared bootstrap for pilot suites that opt into Testcontainers.
 * Falls back to startTestApp() which uses env DATABASE_URL when containers
 * were started by globalSetup or an external stack.
 */
export async function createHarnessApp(): Promise<TestContext> {
  return startTestApp();
}

export type { TestContext };
export type HarnessApp = INestApplication;
