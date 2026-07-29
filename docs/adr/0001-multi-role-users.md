# ADR 0001 — Multi-role users

## Status

Accepted

## Context

TDD section 6.6 models `users.role_id` as a single FK. Feature list 9.1 requires assigning multiple roles to one user (e.g. a coordinator who is also a therapist).

## Decision

Use a `user_roles` join table with composite PK `(user_id, role_id)`. JWT access tokens carry `roles: string[]` and a flattened `permissions: string[]` union across all assigned roles.

## Consequences

- Permission checks use the union of all roles' permissions.
- Deactivation and token revocation remain keyed by `user_id`.
- The TDD single-column design is superseded for this repository; this ADR is the authority.
