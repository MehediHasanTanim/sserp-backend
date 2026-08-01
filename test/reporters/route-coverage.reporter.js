const { mkdirSync, appendFileSync, writeFileSync } = require('fs');
const { dirname, join } = require('path');

/**
 * Records HTTP method+path pairs exercised via Supertest during integration runs.
 * Paired with scripts/openapi-route-coverage.ts.
 */
class RouteCoverageReporter {
  constructor(globalConfig, options = {}) {
    this.outFile =
      options.outputPath ||
      join(process.cwd(), 'reports/route-coverage/routes.log');
    this.routes = new Set();
  }

  onRunStart() {
    mkdirSync(dirname(this.outFile), { recursive: true });
    writeFileSync(this.outFile, '', 'utf8');
    const g = globalThis;
    g.__SSERP_ROUTE_COVERAGE__ = this.routes;
    g.recordTestRoute = (method, path) => {
      if (!method || !path) return;
      const line = `${String(method).toUpperCase()} ${path}`;
      this.routes.add(line);
    };
  }

  onRunComplete() {
    mkdirSync(dirname(this.outFile), { recursive: true });
    const body = [...this.routes].sort().join('\n') + (this.routes.size ? '\n' : '');
    writeFileSync(this.outFile, body, 'utf8');
  }
}

module.exports = RouteCoverageReporter;
