/**
 * Fails if report-coverage.md codes drift from ALL_REPORT_CODES,
 * or if any domain handler still calls emptyHandler(.
 *
 * Usage: npm run test:report-coverage
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { ALL_REPORT_CODES } from '../src/modules/reports/handlers/report-seed-meta';

const ROOT = join(__dirname, '..');
const DOC = join(ROOT, 'docs/plan/backend/report-coverage.md');
const HANDLERS_DIR = join(ROOT, 'src/modules/reports/handlers');

function codesFromMarkdown(path: string): string[] {
  const text = readFileSync(path, 'utf8');
  const codes = new Set<string>();
  const re = /`(school|therapy|hr|finance|inventory|executive)\.[a-z0-9-]+`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    codes.add(m[0].slice(1, -1));
  }
  return [...codes].sort();
}

function listHandlerTsFiles(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listHandlerTsFiles(p));
    else if (ent.name.endsWith('.ts') && !ent.name.endsWith('.spec.ts')) {
      out.push(p);
    }
  }
  return out;
}

function findEmptyHandlerCalls(): string[] {
  const hits: string[] = [];
  for (const file of listHandlerTsFiles(HANDLERS_DIR)) {
    if (file.endsWith('create-prisma-handler.ts')) continue;
    const text = readFileSync(file, 'utf8');
    if (/\bemptyHandler\s*\(/.test(text)) {
      hits.push(file.replace(ROOT + '/', ''));
    }
  }
  return hits;
}

const docCodes = codesFromMarkdown(DOC);
const seedCodes = [...ALL_REPORT_CODES].sort();

const missingInSeed = docCodes.filter((c) => !seedCodes.includes(c));
const missingInDoc = seedCodes.filter((c) => !docCodes.includes(c));
const stubs = findEmptyHandlerCalls();

const errors: string[] = [];

if (docCodes.length !== seedCodes.length) {
  errors.push(
    `Count mismatch: report-coverage.md=${docCodes.length} ALL_REPORT_CODES=${seedCodes.length}`,
  );
}
if (missingInSeed.length) {
  errors.push(`In doc but not seed: ${missingInSeed.join(', ')}`);
}
if (missingInDoc.length) {
  errors.push(`In seed but not doc: ${missingInDoc.join(', ')}`);
}
if (stubs.length) {
  errors.push(`emptyHandler( still used in: ${stubs.join(', ')}`);
}

console.log(`Doc codes: ${docCodes.length}`);
console.log(`Seed codes: ${seedCodes.length}`);
console.log(`emptyHandler stubs outside helper: ${stubs.length}`);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    'OK: report-coverage.md ↔ ALL_REPORT_CODES parity; no emptyHandler stubs',
  );
}
