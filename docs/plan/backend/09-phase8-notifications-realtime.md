# Backend Phase 8 — Notifications, Real-Time & Workflow Configuration

| Field | Value |
|---|---|
| Duration | 3 weeks |
| Prerequisites | Phases 0–7 merged |
| Feature list coverage | 9.3 Workflow Configuration, 11.1 Internal Messaging, 11.2 Automated Notifications, 11.3 Notification Channels, 11.4 Communication Log |
| TDD sections | 10.1–10.3, 4.5 (SMS/SMTP integrations) |

---

## 1. Objective and scope

Replace the Phase 0 in-app-only `NotificationPort` with the full multi-channel pipeline, add the Socket.io real-time layer, and make notification triggers and approval chains configurable rather than hardcoded.

Every phase from 1 through 7 has been emitting domain events and calling `NotificationPort.notify()`. This phase makes those calls actually reach people. Because the port interface does not change, **no code in phases 1–7 is modified** — only the provider binding and the adapter implementation.

**In scope**

- Socket.io gateway with JWT handshake authentication, per-user and per-role rooms, Redis adapter for multi-instance readiness
- `MultiChannelNotificationAdapter`: DB record, WebSocket push, email job, SMS job
- Notification templates with variable substitution, per-channel bodies, and localisation hooks
- Notification preferences per user and per notification type
- Email delivery via Nodemailer with retry, bounce handling, and a suppression list
- SMS delivery via a pluggable provider interface with an SSL Wireless implementation and a console implementation for development
- Delivery log with per-channel status tracking
- Internal messaging: direct, group, announcements, notice board
- Workflow configuration: approval chains, notification trigger toggles, reminder schedules
- Digest notifications to prevent alert fatigue

**Out of scope**

- WhatsApp (feature 11.3 marks it optional/future) — the provider interface accommodates it, no implementation
- Push notifications to mobile apps (no mobile app in scope)

---

## 2. Prerequisites

Phases 0–7. Every event in the catalogue must already be emitted.

---

## 3. Prisma schema additions

#### `notification_types`
Registry of every notification, seeded from code. `id`, `code` (e.g. `student.absent`), `name`, `description`, `module`, `category`, `default_channels TEXT[]`, `allowed_channels TEXT[]`, `is_user_configurable BOOLEAN`, `priority` (`low`|`normal`|`high`|`critical`), `supports_digest BOOLEAN`, `is_active`.

Seeded with all 15 notification events from TDD 10.3 plus every trigger in feature list 11.2 — the union is 25 types.

#### `notification_templates`
`id`, `notification_type_code`, `channel` (`in_app`|`email`|`sms`), `locale`, `subject`, `body`, `variables JSONB` (documented variable list for the editor), `is_active`, `version`, `updated_by`. Unique `(notification_type_code, channel, locale, is_active)` where active.

#### `notifications`
Extends the Phase 0 table: adds `notification_type_code`, `priority`, `action_url`, `data JSONB`, `group_key` (for collapsing), `expires_at`, `delivered_via TEXT[]`, `archived_at`.

#### `notification_deliveries`
Per-channel delivery record — the communication log required by feature 11.4. `id`, `notification_id`, `channel`, `recipient_address` (email or phone, stored hashed-partial for privacy in logs), `provider`, `provider_message_id`, `status` (`queued`|`sending`|`sent`|`delivered`|`failed`|`bounced`|`suppressed`), `attempt_count`, `last_attempt_at`, `delivered_at`, `error_code`, `error_message`, `content_snapshot TEXT`, `cost_units`.

#### `notification_preferences`
`id`, `user_id`, `notification_type_code`, `in_app_enabled`, `email_enabled`, `sms_enabled`, `digest_mode` (`immediate`|`daily`|`weekly`), `quiet_hours_start TIME`, `quiet_hours_end TIME`. Unique `(user_id, notification_type_code)`.

#### `suppression_list`
`id`, `channel`, `address`, `reason` (`hard_bounce`|`complaint`|`invalid`|`manual`|`unsubscribed`), `suppressed_at`, `suppressed_by`, `notes`. Unique `(channel, address)`.

#### `digest_queue`
`id`, `user_id`, `notification_id`, `digest_mode`, `scheduled_for`, `included_in_digest_id`. Holds notifications awaiting a digest send.

#### `digests`
`id`, `user_id`, `digest_mode`, `period_start`, `period_end`, `notification_count`, `sent_at`, `delivery_id`.

#### `message_threads`
Internal staff messaging. `id`, `thread_type` (`direct`|`group`|`announcement`), `subject`, `created_by`, `department` (for department groups), `target_roles TEXT[]` (for announcements), `is_closed`, `last_message_at`.

#### `thread_participants`
`id`, `thread_id`, `user_id`, `role` (`owner`|`member`), `joined_at`, `left_at`, `last_read_message_id`, `is_muted`.

#### `messages`
`id`, `thread_id`, `sender_user_id`, `body`, `attachment_ids UUID[]`, `reply_to_message_id`, `edited_at`, `deleted_at`, `created_at`.

#### `announcements`
`id`, `title`, `body`, `audience_type` (`all_staff`|`departments`|`roles`|`specific_users`), `audience JSONB`, `publish_at`, `expires_at`, `is_pinned`, `attachment_ids UUID[]`, `created_by`, `status` (`draft`|`published`|`expired`|`withdrawn`).

#### `announcement_reads`
`id`, `announcement_id`, `user_id`, `read_at`.

#### `notice_board_items`
`id`, `title`, `body`, `category`, `attachment_ids UUID[]`, `valid_from`, `valid_until`, `is_pinned`, `created_by`, `is_active`.

#### `approval_chains`
Workflow configuration (feature 9.3). `id`, `workflow_code` (e.g. `purchase_request`, `hr_leave`, `student_leave`, `iep_publish`, `fee_waiver`, `payroll_run`, `journal_entry`, `encashment`, `discount`), `name`, `description`, `is_active`, `version`.

#### `approval_chain_steps`
`id`, `approval_chain_id`, `level`, `approver_type` (`role`|`specific_user`|`reporting_manager`|`department_head`), `approver_role`, `approver_user_id`, `condition JSONB` (e.g. amount thresholds — `{ "field": "amount", "op": "gte", "value": 5000000 }`), `is_mandatory`, `escalation_after_hours`, `escalate_to_role`.

#### `reminder_schedules`
`id`, `reminder_code`, `name`, `target_event`, `offset_days INTEGER` (negative = before), `repeat_interval_days`, `max_repeats`, `channels TEXT[]`, `is_active`. Backs "automated reminder schedules" (9.3). Replaces the hardcoded reminder day arrays from earlier phases, which read from here with the previous constants as seeded defaults.

#### `socket_sessions`
`id`, `user_id`, `socket_id`, `connected_at`, `disconnected_at`, `user_agent`, `ip_address`, `rooms TEXT[]`. Useful for debugging and for the "who is online" indicator on the coordinator dashboard.

### Indexes added

```
notifications (user_id, read_at), (user_id, created_at), (notification_type_code), (group_key)
notification_deliveries (notification_id), (status, last_attempt_at), (channel, status)
notification_preferences (user_id, notification_type_code)
suppression_list (channel, address)
digest_queue (user_id, scheduled_for)
messages (thread_id, created_at)
thread_participants (user_id, thread_id)
announcements (status, publish_at), (expires_at)
approval_chain_steps (approval_chain_id, level)
```

---

## 4. Module and file structure

```
src/modules/notifications/
├── notifications.module.ts
├── gateway/
│   ├── realtime.gateway.ts              # Socket.io server
│   ├── ws-jwt.guard.ts                  # handshake authentication
│   ├── room-resolver.service.ts         # user + role + scope rooms
│   └── presence.service.ts
├── adapters/
│   └── multi-channel-notification.adapter.ts   # replaces InAppOnlyNotificationAdapter
├── controllers/
│   ├── notification.controller.ts
│   ├── notification-preference.controller.ts
│   ├── notification-template.controller.ts
│   ├── notification-type.controller.ts
│   ├── delivery-log.controller.ts
│   ├── message.controller.ts
│   ├── announcement.controller.ts
│   ├── notice-board.controller.ts
│   ├── approval-chain.controller.ts
│   └── reminder-schedule.controller.ts
├── services/
│   ├── notification.service.ts          # orchestrator
│   ├── recipient-resolver.service.ts    # event → recipients
│   ├── template-renderer.service.ts     # Handlebars with strict variable checking
│   ├── channel-router.service.ts        # preferences, quiet hours, suppression, digest
│   ├── delivery-log.service.ts
│   ├── digest.service.ts
│   ├── message.service.ts
│   ├── announcement.service.ts
│   ├── approval-chain.service.ts        # resolves the chain for a workflow instance
│   └── reminder-schedule.service.ts
├── providers/
│   ├── email/{nodemailer.provider.ts,email.provider.interface.ts}
│   └── sms/{ssl-wireless.provider.ts,console.provider.ts,sms.provider.interface.ts}
├── listeners/
│   └── domain-event.listener.ts          # single subscriber mapping every event → notification
└── jobs/
    ├── email-dispatch.job.ts
    ├── sms-dispatch.job.ts
    ├── digest-dispatch.job.ts
    ├── delivery-status-poll.job.ts
    ├── reminder-dispatch.job.ts
    └── notification-cleanup.job.ts
```

### The event-to-notification mapping

`domain-event.listener.ts` holds a single declarative table:

```typescript
export const NOTIFICATION_MAP: NotificationMapping[] = [
  {
    event: 'student.attendance.unauthorized_absence',
    typeCode: 'student.absent',
    recipients: (payload) => resolveGuardiansOfStudent(payload.studentId),
    variables: (payload) => ({ studentName: ..., date: ... }),
  },
  // ... one entry per event
];
```

A startup assertion verifies that every event constant in `shared/events/event-names.ts` that is marked `notifiable` has a mapping entry, and that every mapping's `typeCode` exists in `notification_types`. This makes it impossible to add a notifiable event and forget the notification.

---

## 5. API endpoints

### Notifications

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET | `/notifications` | authenticated | Own, paginated, filter by read state, type, priority |
| GET | `/notifications/unread-count` | authenticated | Grouped by priority |
| POST | `/notifications/:id/read` | authenticated |
| POST | `/notifications/read-all` | authenticated |
| POST | `/notifications/:id/archive` | authenticated |
| GET | `/notifications/preferences` | authenticated | Own preferences with type metadata |
| PUT | `/notifications/preferences` | authenticated | Bulk update |

### Administration

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET | `/admin/notification-types` | super_admin |
| PATCH | `/admin/notification-types/:code` | super_admin | Enable/disable, default channels |
| GET/POST/PATCH | `/admin/notification-templates` | super_admin | With variable validation and preview |
| POST | `/admin/notification-templates/:id/preview` | super_admin | Render with sample data |
| POST | `/admin/notifications/test-send` | super_admin | Send a test notification to self on chosen channels |
| GET | `/admin/delivery-log` | super_admin, principal | Filter by channel, status, date, recipient, type |
| GET | `/admin/delivery-log/stats` | super_admin, principal | Sent, delivered, failed, bounced by channel and period |
| POST | `/admin/delivery-log/:id/retry` | super_admin | Manual retry |
| GET/POST/DELETE | `/admin/suppression-list` | super_admin |
| GET/POST/PATCH | `/admin/approval-chains` | super_admin, principal |
| GET/POST/PATCH | `/admin/reminder-schedules` | super_admin |
| GET | `/admin/socket-sessions` | super_admin | Active connections |

### Internal messaging

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET | `/messages/threads` | authenticated staff | Own threads with unread counts |
| POST | `/messages/threads` | authenticated staff | Direct or group thread |
| GET | `/messages/threads/:id` | participants | Messages, paginated |
| POST | `/messages/threads/:id/messages` | participants |
| PATCH | `/messages/:id` | sender | Edit within an edit window |
| DELETE | `/messages/:id` | sender, super_admin | Soft delete |
| POST | `/messages/threads/:id/read` | participants | Mark up to a message id |
| POST | `/messages/threads/:id/participants` | thread owner |
| POST | `/messages/threads/:id/mute` | participants |
| POST | `/messages/threads/:id/close` | thread owner |

### Announcements and notice board

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| GET | `/announcements` | authenticated | Visible to the caller's role/department, unexpired |
| POST | `/announcements` | principal, coordinator, hr_officer, super_admin |
| PATCH | `/announcements/:id` | author, super_admin | Draft only |
| POST | `/announcements/:id/publish` | author, principal |
| POST | `/announcements/:id/withdraw` | author, principal |
| POST | `/announcements/:id/read` | authenticated |
| GET | `/announcements/:id/read-stats` | author, principal | Read count and non-readers |
| GET/POST/PATCH/DELETE | `/notice-board` | coordinator, hr_officer, principal, super_admin (write); all authenticated (read) |

### WebSocket

| Namespace | Description |
|---|---|
| `/` (default) | Authenticated connection. Handshake carries the access JWT in `auth.token`. |

**Server → client events**

| Event | Payload | Room |
|---|---|---|
| `notification:new` | The notification record | `user:{userId}` |
| `notification:count` | `{ unread, byPriority }` | `user:{userId}` |
| `message:new` | Message with thread context | `thread:{threadId}` |
| `announcement:published` | Announcement summary | `role:{role}` / `dept:{department}` |
| `dashboard:invalidate` | `{ widgets: string[] }` | `role:{role}` |
| `entity:changed` | `{ entityType, entityId, action }` | Scoped rooms — drives TanStack Query cache invalidation |
| `export:ready` | `{ jobId, downloadUrl }` | `user:{userId}` |
| `presence:update` | `{ userId, status }` | `role:coordinator` |

**Client → server events**

| Event | Purpose |
|---|---|
| `thread:subscribe` / `thread:unsubscribe` | Join or leave a thread room after an authorization check |
| `presence:heartbeat` | Keep the presence record fresh |

---

## 6. Business rules and invariants

### Real-time

| # | Rule | Error |
|---|---|---|
| WS-01 | A connection without a valid access JWT in the handshake is rejected before joining any room. | Disconnect with `unauthorized` |
| WS-02 | On connect, the socket joins `user:{userId}` plus one `role:{role}` room per held role. A parent additionally joins `student:{id}` rooms for their scoped students only. | — |
| WS-03 | `thread:subscribe` verifies participation before joining the room. A non-participant receives an error and does not join. | `forbidden` |
| WS-04 | An expired access token causes disconnection at the next heartbeat; the client must reconnect with a refreshed token. Tokens are re-verified every 60 seconds, not only at handshake. | Disconnect with `token_expired` |
| WS-05 | Socket.io uses the Redis adapter so broadcasts reach clients on any instance. Verified by a two-instance integration test. | — |
| WS-06 | No sensitive payload is broadcast. `entity:changed` carries identifiers and an action only; the client refetches through the authorised REST endpoint. Medical, financial, and salary values never travel over a socket event. | — |
| WS-07 | A user deactivated mid-session is disconnected immediately on the `user.deactivated` event. | — |

### Notification pipeline

| # | Rule | Error |
|---|---|---|
| NT-01 | Every notification is persisted **before** any channel dispatch. If a channel fails, the in-app record still exists. | — |
| NT-02 | Persistence and dispatch enqueueing happen in the caller's transaction context via the transactional event publisher — a rolled-back business operation never notifies anyone. This is asserted by a test that fails a fee payment after the notify call and verifies no notification exists. | — |
| NT-03 | Channel selection = `notification_types.default_channels` ∩ `allowed_channels`, then narrowed by the user's `notification_preferences`, then filtered by the suppression list. | — |
| NT-04 | `priority = critical` notifications ignore user preferences and quiet hours and are always delivered on all allowed channels. Critical is reserved for: student absence, session cancellation, and account security events. | — |
| NT-05 | Quiet hours defer non-critical email and SMS to the end of the quiet window; in-app is never deferred. | — |
| NT-06 | Digest mode collects notifications into `digest_queue` and sends one combined message per period. Notification types with `supports_digest = false` are always immediate. | — |
| NT-07 | Template rendering is strict: a missing variable is an error, not an empty string. A template referencing an undeclared variable fails validation at save time. | `TEMPLATE_VARIABLE_MISSING` 422 |
| NT-08 | SMS bodies are validated against a 320-character limit at save time and the rendered length is checked at send time; over-length messages are truncated at a word boundary with an ellipsis and the truncation is logged. | — |
| NT-09 | Email and SMS jobs retry 3 times with exponential backoff (1 min, 5 min, 15 min). A hard bounce or invalid-number error does not retry and adds the address to the suppression list. | — |
| NT-10 | Every attempt writes or updates a `notification_deliveries` row with a content snapshot, satisfying feature 11.4. | — |
| NT-11 | Recipient resolution is centralised in `RecipientResolverService`. Notification code never contains a hardcoded email or phone number. | — |
| NT-12 | Guardian notifications go to guardians marked `is_primary` by default, and to all guardians for `critical` priority. | — |
| NT-13 | Notifications are deduplicated on `(user_id, notification_type_code, group_key)` within a 5-minute window, so a bulk operation touching 40 students does not send 40 identical coordinator alerts — it sends one collapsed alert. | — |
| NT-14 | A notification for a user who is inactive or deleted is skipped and logged, not failed. | — |
| NT-15 | Read-state changes push `notification:count` to the user's other open sessions so badge counts stay consistent across tabs. | — |
| NT-16 | The complete set of notification types and their channels must match TDD 10.3 exactly. A test transcribes that table and asserts the seeded configuration matches it. | — |

### Messaging

| # | Rule | Error |
|---|---|---|
| MS-01 | Only thread participants may read or post. | `FORBIDDEN` 403 |
| MS-02 | Parents use the Phase 2 `portal_message_threads`, which remain separate from staff `message_threads`. A parent can never appear in a staff thread. | `FORBIDDEN` 403 |
| MS-03 | Editing is allowed within `message_edit_window_minutes` (default 15) and records `edited_at`. | `EDIT_WINDOW_EXPIRED` 409 |
| MS-04 | Deletion is soft; the body is replaced with a tombstone marker for other participants and retained in the audit log. | — |
| MS-05 | An announcement is visible only to its audience. Publishing pushes to the matching role and department rooms and creates in-app notifications for the audience. | — |
| MS-06 | Announcement read stats are visible only to the author and the principal. | `FORBIDDEN` 403 |
| MS-07 | Attachments in messages go through the Phase 0 file service with the same mime and size validation. | — |

### Workflow configuration

| # | Rule | Error |
|---|---|---|
| WF-01 | Approval chains are resolved at workflow-instance creation time and snapshotted onto the instance, so changing a chain does not alter in-flight approvals. | — |
| WF-02 | A chain must have at least one mandatory step. | `VALIDATION_ERROR` 400 |
| WF-03 | Conditional steps evaluate against the instance payload; a step whose condition is false is skipped and recorded as skipped, not pending. | — |
| WF-04 | `approver_type = reporting_manager` resolves through the employee hierarchy at instance creation; an employee with no manager falls through to the configured fallback role. | `NO_APPROVER_RESOLVED` 422 |
| WF-05 | A step unactioned beyond `escalation_after_hours` notifies `escalate_to_role`, and the escalated role may then approve. Escalation never auto-approves. | — |
| WF-06 | Replacing the hardcoded approval logic in phases 1–6 with `ApprovalChainService` must not change default behaviour. The seeded chains reproduce the existing hardcoded flows exactly, and the phases' existing approval tests must pass unmodified. This is the phase's key regression guarantee. | — |
| WF-07 | Reminder schedules replace hardcoded reminder day arrays. Seeded values equal the previous constants, so behaviour is unchanged until an admin edits them. | — |

---

## 7. Domain events

**Emitted:** `notification.created`, `notification.delivered`, `notification.failed`, `notification.bounced`, `message.posted`, `announcement.published`, `approval.escalated`, `socket.connected`, `socket.disconnected`.

**Consumed:** every `notifiable` event in the catalogue from phases 0–7, via `domain-event.listener.ts`. The complete list is the union of TDD 10.3 and feature list 11.2:

| Notification type | Trigger event | In-app | Email | SMS |
|---|---|---|---|---|
| `student.activated` | `student.activated` | ✓ | ✓ | ✓ |
| `student.absent` | `student.attendance.unauthorized_absence` | ✓ | — | ✓ |
| `admission_fee.pending` | reminder schedule | ✓ | ✓ | ✓ |
| `fee.overdue` | `fee.overdue` | ✓ | ✓ | ✓ |
| `student_leave.decided` | `student_leave.approved` / `.rejected` | ✓ | ✓ | ✓ |
| `student_leave.submitted` | `student_leave.submitted` | ✓ | ✓ | — |
| `iep.updated` | `iep.published` / `iep.revised` | ✓ | ✓ | — |
| `iep.review_due` | reminder schedule | ✓ | ✓ | — |
| `progress_report.available` | `progress_report.published` | ✓ | ✓ | — |
| `activity.optin_invite` | `activity.optin.invited` | ✓ | ✓ | ✓ |
| `activity.optin_reminder` | reminder schedule | ✓ | ✓ | ✓ |
| `activity.cancelled` | `activity.cancelled` | ✓ | ✓ | ✓ |
| `activity.fee_unpaid` | reminder schedule | ✓ | ✓ | ✓ |
| `therapy_session.cancelled` | `therapy_session.cancelled` / `group_session.cancelled` | ✓ | ✓ | ✓ |
| `therapy_session.reminder` | reminder schedule | ✓ | — | ✓ |
| `substitute.unassigned` | `substitute.unassigned` | ✓ | ✓ | — |
| `hr.leave.decided` | `hr.leave.approved` / `.rejected` | ✓ | ✓ | — |
| `payroll.processed` | `payroll.run.completed` | ✓ | ✓ | — |
| `gratuity.eligibility` | `gratuity.eligibility.reached` | ✓ | ✓ | — |
| `encashment.decided` | `encashment.approved` / rejected | ✓ | ✓ | — |
| `therapist.license.expiring` | `therapist.license.expiring` | ✓ | ✓ | — |
| `employee.contract.expiring` | `employee.contract.expiring` | ✓ | ✓ | — |
| `inventory.stock.low` | `inventory.stock.low` | ✓ | ✓ | — |
| `procurement.pr.status` | `procurement.pr.status_changed` | ✓ | ✓ | — |
| `report.export.ready` | `report.export.ready` | ✓ | — | — |

---

## 8. Background jobs and cron

| Job | Schedule | Purpose |
|---|---|---|
| `email-dispatch` | Queue-driven | Send email with retry and bounce classification |
| `sms-dispatch` | Queue-driven | Send SMS with retry and provider error mapping |
| `digest-dispatch` | Daily 08:00 and Monday 08:00 | Build and send daily and weekly digests |
| `delivery-status-poll` | Every 10 minutes | Poll the SMS provider for delivery receipts where supported |
| `reminder-dispatch` | Every 30 minutes | Evaluate `reminder_schedules` and emit due reminders |
| `approval-escalation` | Hourly | Escalate overdue approval steps |
| `notification-cleanup` | Daily 03:15 | Archive read notifications older than 90 days; delete archived older than 1 year; retain `notification_deliveries` for 2 years |
| `socket-session-prune` | Daily | Close orphaned session records |

Queues added: `email`, `sms`, `notifications`.

---

## 9. Configuration and secrets

New env:

| Variable | Notes |
|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Already introduced in Phase 0; now actively used |
| `SMS_PROVIDER` | `console` \| `ssl_wireless` |
| `SMS_API_URL`, `SMS_API_KEY`, `SMS_SENDER_ID` | Provider credentials |
| `WS_CORS_ORIGINS` | Socket.io allowed origins |
| `REDIS_PUBSUB_URL` | Defaults to `REDIS_URL`; separable for load isolation |

New settings:

- `organization_settings.notification_quiet_hours_default_start` / `_end`
- `organization_settings.message_edit_window_minutes` (default 15)
- `organization_settings.notification_dedup_window_seconds` (default 300)
- `organization_settings.sms_enabled` (global kill switch — critical for controlling spend during UAT)
- `organization_settings.email_enabled` (global kill switch)

---

## 10. Tests owed by this phase

### Unit tests — `NotificationService` and `ChannelRouterService`

- Persistence happens before dispatch.
- Channel selection: default ∩ allowed, then preferences, then suppression — asserted across a table of 12 combinations.
- Critical priority ignores preferences, quiet hours, and digest mode.
- Quiet hours defer email and SMS but not in-app; the deferred send time is the end of the window.
- Digest mode queues rather than sends; `supports_digest = false` types send immediately.
- Suppressed address is skipped and recorded as `suppressed`, not `failed`.
- Inactive or deleted user skipped with a log entry.
- Deduplication collapses 40 identical notifications within the window into 1.
- Primary-guardian-only for normal priority; all guardians for critical.

### Unit tests — `TemplateRendererService`

- All variables present renders correctly.
- A missing variable throws rather than rendering an empty string.
- A template with an undeclared variable fails validation at save.
- HTML in email is sanitised; SMS strips HTML entirely.
- SMS over-length truncates at a word boundary and logs.
- Handlebars helpers for date and currency render in the organisation timezone and currency.

### Unit tests — `RecipientResolverService`

One test per notification type in the section 7 table, asserting the resolved recipient set. Specifically:

- Student absence → the student's guardians, not the teacher.
- Substitute unassigned → coordinators and the principal, not the absent teacher.
- Group session cancelled → one notification per enrolled patient's guardian, verified for a 5-member group.
- Low stock → the procurement officer role, not all staff.
- PR status → the requester only.
- Export ready → the requesting user only.

### Unit tests — `ApprovalChainService`

- Chain resolution snapshots steps onto the instance.
- A conditional step below the threshold is skipped and recorded as skipped.
- Reporting-manager resolution walks the hierarchy; a manager-less employee falls back.
- Escalation notifies but never auto-approves.
- Changing a chain does not alter an in-flight instance.

### Unit tests — gateway

- Handshake without a token rejected.
- Handshake with an expired token rejected.
- Correct rooms joined per role; a parent joins only their scoped student rooms.
- `thread:subscribe` by a non-participant rejected.
- Periodic re-verification disconnects on expiry.
- `entity:changed` payload contains no sensitive fields — asserted against a deny-list of field names.

### Integration tests

| Suite | Assertions |
|---|---|
| `notification-matrix.integration.spec.ts` | Transcribes the TDD 10.3 table and asserts the seeded `notification_types` channel configuration matches it exactly. Any drift fails. |
| `notification-mapping-completeness.integration.spec.ts` | Every event constant marked `notifiable` has a mapping; every mapping's type code exists; startup assertion verified |
| `end-to-end-notification.integration.spec.ts` | For each of the 25 types: trigger the real domain event through the real API, then assert the `notifications` row, the `notification_deliveries` rows per expected channel, and the mock email/SMS provider received the right content |
| `transactional-notification.integration.spec.ts` | Force a failure after a notify call inside a fee payment transaction; assert the payment rolled back **and** no notification or delivery row exists |
| `websocket.integration.spec.ts` | Real Socket.io client: connect with a valid token, receive `notification:new` on a triggered event, receive `notification:count` after marking read in another session, get disconnected on deactivation |
| `websocket-multi-instance.integration.spec.ts` | Two app instances sharing Redis; a notification created on instance A reaches a client connected to instance B |
| `websocket-authz.integration.spec.ts` | Parent A's socket never receives events for Parent B's child; a coordinator's socket does not receive payroll events |
| `retry-and-suppression.integration.spec.ts` | A soft failure retries 3 times with backoff; a hard bounce does not retry and lands on the suppression list; a subsequent notification to that address is suppressed |
| `digest.integration.spec.ts` | Three notifications for a daily-digest user produce zero immediate emails and one digest email containing all three |
| `messaging.integration.spec.ts` | Thread creation, posting, read markers, edit window, soft delete tombstone, non-participant 403 |
| `announcement.integration.spec.ts` | Publish to a role audience; only that role sees it and receives the socket push; read stats correct |
| `approval-chain-regression.integration.spec.ts` | **The regression guarantee:** the Phase 1–6 approval test suites (PR approval, leave approval, fee waiver, journal approval, encashment) run unmodified against `ApprovalChainService` and all pass |
| `reminder-schedule.integration.spec.ts` | Seeded schedules reproduce the previous hardcoded reminder behaviour; editing a schedule changes the dispatch days |
| `sms-kill-switch.integration.spec.ts` | With `sms_enabled = false`, notifications still persist and email still sends, but no SMS job is enqueued |

### Performance tests

- `k6/scripts/websocket-connections.js` — 150 concurrent socket connections held for 5 minutes, asserting no dropped connections and stable memory.
- `k6/scripts/notification-fanout.js` — trigger an event with 200 recipients and assert the queue drains within 60 seconds with no failures.

### Mutation testing

`NotificationService`, `ChannelRouterService`, `TemplateRendererService`, `RecipientResolverService`, `ApprovalChainService`, `DigestService` at ≥ 75%.

---

## 11. Exit criteria

Global Definition of Done, plus:

- [ ] `NotificationPort` is bound to `MultiChannelNotificationAdapter` with **zero changes** to any phase 1–7 service — verified by the diff containing no edits under `modules/{school,therapy,hr,accounts,inventory,procurement}/services`.
- [ ] The TDD 10.3 notification matrix test passes.
- [ ] All 25 notification types have an end-to-end integration test proving the real event produces the right rows and provider calls.
- [ ] The transactional-notification test proves no notification escapes a rolled-back transaction.
- [ ] Multi-instance WebSocket delivery works through the Redis adapter.
- [ ] The socket payload deny-list test passes: no medical, salary, or financial value appears in any socket event.
- [ ] The approval-chain regression suite passes with the phase 1–6 approval tests unmodified.
- [ ] Reminder schedules reproduce prior behaviour with the seeded defaults.
- [ ] Global email and SMS kill switches work and are documented for the UAT phase.
- [ ] 150 concurrent socket connections sustained for 5 minutes without drops.
