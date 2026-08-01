# ADR 0008 — Field Encryption Scope (Phase 9)

## Status

Accepted

## Context

Medical and financial fields must not rest in plaintext. Encrypted columns cannot be filtered/sorted in SQL.

## Decision

1. AES-256-GCM envelopes `{ v, iv, tag, ct }` via a Prisma client extension.
2. Master key in env (`FIELD_ENCRYPTION_MASTER_KEY`); data keys in `encryption_keys` wrapped by the master (H-04 rotation = re-wrap).
3. Blind index `students.disability_category_hash` (HMAC-SHA256 with `BLIND_INDEX_KEY`) for equality filters.
4. Aggregate payroll/gratuity reports continue to use `payroll_slips` / `gratuity_provisions` (unencrypted computed integers), not encrypted `employees.basic_salary`.
5. Encrypted fields are scrubbed from logs and omitted from list projections by default (H-03).

## Consequences

- Backfill script encrypts existing plaintext rows.
- Retired keys remain readable via envelope `v`.
