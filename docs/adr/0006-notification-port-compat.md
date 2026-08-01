# ADR 0006 — Notification Port Compatibility (Phase 8)

## Status

Accepted

## Context

Phases 0–7 emit domain events and call `NotificationPort.notify()` through the shared port abstraction. Phase 8 replaces the Phase 0 `InAppOnlyNotificationAdapter` with a multi-channel pipeline (WebSocket, email, SMS) while preserving the existing call sites.

## Decision

**Swap the port provider binding only. Do not modify phase 1–7 service call sites.**

1. The `NotificationPort` interface in `shared/ports/notification.port.ts` remains unchanged for W0–W1.
2. `PortsModule` (or `NotificationsModule` when the binding moves) binds `NotificationPort` to `MultiChannelNotificationAdapter` instead of `InAppOnlyNotificationAdapter`.
3. No edits under `modules/{school,therapy,hr,accounts,inventory,procurement,reports}/services` are required for the port swap.
4. The adapter persists the in-app row first, then enqueues channel dispatch — satisfying NT-01 and NT-02 from the phase plan.
5. Existing REST endpoints under `/notifications` keep backward-compatible behaviour; new columns on the `notifications` table are nullable or defaulted.

## Consequences

- Regression coverage for phases 1–7 notification triggers remains valid without touching those modules.
- Integration tests can assert the adapter swap by verifying delivery rows and queue jobs without changing upstream services.
- W1 must implement `MultiChannelNotificationAdapter` and rebind `PortsModule`; until then `InAppOnlyNotificationAdapter` continues to satisfy the port contract.
- Future notification fields (`notificationTypeCode`, `priority`, etc.) are populated by the new adapter; legacy rows remain readable.

## Alternatives considered

- **Inline multi-channel logic in each module** — Rejected; duplicates channel routing, preferences, and suppression handling.
- **Change `NotifyInput` in phase 1–7** — Rejected; violates the zero-touch regression guarantee for merged phases.
