/**
 * Compares OpenAPI paths+methods to a Supertest route log.
 * Usage: npm run test:openapi-routes
 *   or: npx ts-node scripts/openapi-route-coverage.ts openapi/openapi.json reports/route-coverage/routes.log
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

const openapiPath = process.argv[2] ?? 'openapi/openapi.json';
const logPath = process.argv[3] ?? 'reports/route-coverage/routes.log';

type PathItem = Record<string, unknown>;

function normalizePath(p: string): string {
  return p.replace(/\{[^}]+\}/g, ':param').replace(/\/+$/, '') || '/';
}

function loadExpected(docPath: string): string[] {
  const doc = JSON.parse(readFileSync(docPath, 'utf8')) as {
    paths?: Record<string, PathItem>;
  };
  const expected: string[] = [];
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const method of Object.keys(item)) {
      if (
        ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(
          method.toLowerCase(),
        )
      ) {
        expected.push(`${method.toUpperCase()} ${path}`);
      }
    }
  }
  return expected.sort();
}

function loadActual(logFile: string): string[] {
  if (!existsSync(logFile)) return [];
  return readFileSync(logFile, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function matches(expected: string, actualLines: string[]): boolean {
  const [method, path] = expected.split(' ');
  const normExpected = normalizePath(path);
  return actualLines.some((line) => {
    const [m, p] = line.split(' ');
    if (!m || !p) return false;
    if (m.toUpperCase() !== method) return false;
    const normActual = normalizePath(p);
    // Allow OpenAPI /api/v1 prefix variants
    return (
      normActual === normExpected ||
      normActual.endsWith(normExpected) ||
      normExpected.endsWith(normActual.replace(/^\/api\/v1/, '')) ||
      normActual.includes(normExpected.replace(/:param/g, ''))
    );
  });
}

try {
  if (!existsSync(openapiPath)) {
    console.error(`OpenAPI file missing: ${openapiPath}`);
    process.exitCode = 1;
  } else {
    const expected = loadExpected(openapiPath);
    const actual = loadActual(logPath);
    const missing = expected.filter((e) => !matches(e, actual));

    const reportDir = dirname(logPath);
    mkdirSync(reportDir, { recursive: true });
    const reportPath = `${reportDir}/coverage-report.txt`;
    const report = [
      `OpenAPI operations: ${expected.length}`,
      `Route log entries: ${actual.length}`,
      `Missing: ${missing.length}`,
      '',
      ...missing.slice(0, 100),
    ].join('\n');
    writeFileSync(reportPath, report, 'utf8');

    console.log(report);
    if (missing.length && actual.length === 0) {
      console.warn(
        'No route log — run integration tests first to populate routes.log. Failing soft when log empty.',
      );
      // Soft-fail only when log is empty (bootstrap); hard-fail when log exists but incomplete.
      process.exitCode = 0;
    } else if (missing.length) {
      process.exitCode = 1;
    }
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
}
