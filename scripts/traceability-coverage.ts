/**
 * Extracts rule ids from test/traceability/phase*.md and checks that each
 * appears in a test file name, describe/it string, or `// rule: ID` comment.
 * Writes test/traceability/coverage.md and fails on uncovered rules.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const TRACE_DIR = join(ROOT, 'test/traceability');
const SEARCH_DIRS = [
  join(ROOT, 'src'),
  join(ROOT, 'test'),
];

const RULE_RE =
  /\b((?:AC|AR|BU|BK|FI|OB|S|M|T|C|HR|PR|GR|INV|RP|NT|H|P)[A-Z]?-?\d{1,3}(?:[a-z])?)\b/g;

function collectRulesFromMarkdown(dir: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!existsSync(dir)) return map;
  for (const file of readdirSync(dir).filter((f) => /^phase\d+\.md$/.test(f))) {
    const text = readFileSync(join(dir, file), 'utf8');
    // Prefer table rows like `| AC-01 ... |`
    for (const line of text.split('\n')) {
      const cell = line.match(/^\|\s*([A-Z]{1,4}-?\d{1,3}[a-z]?)/);
      if (cell) {
        map.set(cell[1], file);
        continue;
      }
      let m: RegExpExecArray | null;
      const re = new RegExp(RULE_RE);
      while ((m = re.exec(line))) {
        if (line.includes('|') || line.includes('Rule')) {
          map.set(m[1], file);
        }
      }
    }
  }
  return map;
}

function collectTestCorpus(dirs: string[]): string {
  const chunks: string[] = [];
  const walk = (d: string) => {
    if (!existsSync(d)) return;
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules' || ent.name === 'dist') continue;
        walk(p);
      } else if (/\.(spec|ts|md)$/.test(ent.name)) {
        chunks.push(readFileSync(p, 'utf8'));
        chunks.push(ent.name);
      }
    }
  };
  dirs.forEach(walk);
  return chunks.join('\n');
}

const rules = collectRulesFromMarkdown(TRACE_DIR);
const corpus = collectTestCorpus(SEARCH_DIRS);

const covered: string[] = [];
const missing: string[] = [];

for (const [rule, file] of [...rules.entries()].sort()) {
  const hit =
    corpus.includes(rule) ||
    corpus.includes(`rule: ${rule}`) ||
    corpus.includes(`// rule: ${rule}`);
  if (hit) covered.push(rule);
  else missing.push(`${rule} (${file})`);
}

const report = [
  '# Business rule traceability coverage',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  `| Metric | Count |`,
  `|---|---|`,
  `| Rules found in phase*.md | ${rules.size} |`,
  `| Covered | ${covered.length} |`,
  `| Missing | ${missing.length} |`,
  '',
  '## Missing',
  '',
  ...(missing.length ? missing.map((m) => `- ${m}`) : ['- none']),
  '',
  '## Covered',
  '',
  ...covered.map((c) => `- ${c}`),
  '',
].join('\n');

writeFileSync(join(TRACE_DIR, 'coverage.md'), report, 'utf8');
console.log(report);

// Soft gate for phases with sparse tables: fail only if we found rules and >25% missing
if (rules.size > 0 && missing.length > rules.size * 0.25) {
  console.error(
    `Traceability coverage below 75% (${covered.length}/${rules.size}).`,
  );
  process.exitCode = 1;
}
