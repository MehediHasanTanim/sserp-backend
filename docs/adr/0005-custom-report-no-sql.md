# ADR 0005 — Custom Report Builder: Whitelist Only, No Free-Text SQL

## Status

Accepted

## Context

The custom report builder lets users compose ad-hoc reports from whitelisted datasets, columns, filters, group-bys, and aggregations. This is the single most likely SQL injection vector in the system: a compromised or malicious client could attempt to smuggle arbitrary SQL through column names, operators, filter values, sort directions, dataset keys, or nested JSON payloads.

Phase 7 business rule RP-12 requires that custom reports accept **no** free-text SQL. Every selection must be validated against a server-side dataset descriptor and compiled into parameterised queries via `SafeQueryBuilder`.

## Decision

**Custom reports are whitelist-only. Free-text SQL is never accepted.**

1. **Dataset keys** — Only keys registered in `report_datasets` (seeded and loaded at startup) are valid. Unknown keys are rejected with `INVALID_SELECTION` before any query compilation.
2. **Columns, filters, group-bys, aggregations, sort** — Each field is validated against the dataset descriptor: allowed names, types, filter operators, and aggregation functions. Anything unrecognised is rejected; there is no escape hatch or “advanced SQL” mode.
3. **Query compilation** — `SafeQueryBuilder` compiles validated selections into parameterised Prisma or SQL-builder queries. User-supplied strings are bound as parameters, never interpolated into SQL text.
4. **Permission filtering** — Available columns are filtered by the caller's permissions (RP-13) so a user cannot select a column they are not entitled to see, even if it exists in the descriptor.
5. **Injection test suite** — A dedicated unit and integration suite (`SafeQueryBuilder` injection suite, `custom-report-injection.integration.spec.ts`) attempts classic and obfuscated injection payloads (`'; DROP TABLE`, `1=1 --`, `pg_sleep`, UNION SELECT, unicode homoglyphs, nested-object attacks). **This suite is merge-blocking in CI.**

## Consequences

- The custom report builder cannot support arbitrary joins or expressions beyond what the dataset descriptor exposes. New analytical needs require extending the descriptor and builder, not user SQL.
- `ExpressionValidator` maintains the closed set of allowed aggregation functions.
- Startup assertions keep handler definitions, seeded `report_definitions`, and dataset descriptors in sync.
- Operational tuning of report performance happens through materialised views and registered handlers, not ad-hoc user queries.

## Alternatives considered

- **Allow raw SQL for super_admin** — Rejected; one compromised admin session becomes full database access.
- **Sanitise free-text SQL with regex** — Rejected; bypass-prone and unmaintainable compared to a whitelist compiler.
