# Phase 8 traceability

| Rule | Test |
|---|---|
| NT-01 persist before dispatch | `notification.service.ts` + pipeline unit/integration |
| NT-02 transactional enqueue | `notification-transaction-rollback.integration.spec.ts` |
| NT-03 channel routing | `channel-router.service.spec.ts` |
| NT-04 critical ignores prefs | `channel-router.service.spec.ts` |
| NT-05 quiet hours defer | `channel-router.service.spec.ts` |
| NT-06 digest mode | `channel-router.service.spec.ts`, `digest.integration.spec.ts` |
| NT-07 template strict | `template-renderer.service.spec.ts` |
| NT-08 SMS truncate | `template-renderer.service.spec.ts` |
| NT-09 bounce → suppression | `email-dispatch.job.ts` / `delivery-log.integration.spec.ts` |
| NT-10 delivery log | `delivery-log.integration.spec.ts` |
| NT-11 recipient centralization | `recipient-resolver.service.spec.ts` |
| NT-12 guardians primary vs critical | `recipient-resolver.service.spec.ts` |
| NT-13 dedup | `notification.service.ts` (groupKey window) |
| NT-14 inactive skip | `notification.service.ts` |
| NT-16 TDD 10.3 matrix | `notification-matrix.integration.spec.ts` |
| Mapping completeness | `notification-mapping-completeness.integration.spec.ts` |
| MS-01 participant guard | `messaging.integration.spec.ts` |
| MS-05/MS-06 announcement | `announcement-audience.integration.spec.ts` |
| WF-01–05 approval chain | `approval-chain.service.spec.ts` |
| WF-06 regression gate | Phase 1–6 approval suites + `approval-chain-regression.integration.spec.ts` |
| WF-07 reminder schedules | `reminder-schedule.integration.spec.ts` |
| WS-01/WS-02 rooms | `ws-auth.integration.spec.ts` |
| WS-05 Redis multi-instance | `ws-auth.integration.spec.ts` (contract) + gateway Redis adapter |
| WS-06 deny-list | `realtime.gateway.spec.ts`, `ws-auth.integration.spec.ts` |
| WS-07 deactivate disconnect | `RealtimeGateway.onUserDeactivated` |
| SMS kill switch | `sms-kill-switch.integration.spec.ts` |
| Semgrep hardcoded recipients | `.semgrep/phase8-no-hardcoded-recipients.yml` |
| k6 fan-out / connections | `k6/scripts/notification-fanout.js`, `websocket-connections.js` |
| Stryker targets | `stryker.config.js` (ChannelRouter, TemplateRenderer, RecipientResolver, NotificationService, ApprovalChain, Digest) |

## Exit criteria proofs

| Criterion | Evidence |
|---|---|
| Port swap, zero Phase 1–7 notify call-site edits | `ports.module.ts` → `MultiChannelNotificationAdapter`; ADR 0006 |
| TDD 10.3 matrix | `notification-matrix.integration.spec.ts` |
| Critical ignores prefs | `channel-router.service.spec.ts` |
| Seeded approval chains match hardcoded | `approval-chain-regression.integration.spec.ts` + phase8 seed |
| Reminder defaults = prior constants | `reminder-schedule.integration.spec.ts` (3/7/15/30) |
| Email/SMS kill switches | `sms-kill-switch.integration.spec.ts` |

## Remaining gaps (pragmatic deferrals)

- Live `websocket.integration.spec.ts` / two-instance Redis proof in CI
- Full 25-type E2E provider assertions against real APIs
- k6 sustained load runs in CI
