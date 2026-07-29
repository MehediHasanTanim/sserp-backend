# Frontend Phase 8 — Notifications, Real-Time & Communication

| Field | Value |
|---|---|
| Duration | 3 weeks |
| Prerequisites | Frontend Phase 0–7; Backend Phase 8 contract published |
| Feature list coverage | 11.1–11.4 (Communication & Notification), 9.2 Organization Configuration, 9.3 Workflow Configuration, 9.5 Data Backup & Security (administration UI) |
| Backend counterpart | [backend/09-phase8-notifications-realtime.md](../backend/09-phase8-notifications-realtime.md) |

---

## 1. Objective and scope

Phase 0 shipped a notification bell stub against a `NotificationPort`. This phase makes it real: a live WebSocket connection, a full notification centre, preference management, internal messaging, announcements, and the configurable approval-workflow administration UI.

The governing constraint is that **real-time is an enhancement, never a dependency.** Every screen built in Phases 0–7 works correctly with no socket connection at all, because they poll or refetch. This phase adds push on top so that data arrives sooner — it must never become the only path by which data arrives. If a developer later makes a screen depend on a socket event to render correctly, that screen breaks behind every corporate proxy that blocks WebSocket upgrades.

The second constraint is that a real-time connection makes state divergence visible. Two users editing the same session, a dashboard tile updating while being read, a list reordering under the user's cursor — all become possible. The design must make updates helpful rather than disruptive.

**In scope**

- Socket.io client with authenticated connect, reconnect with backoff, and a connection-state indicator
- Real-time event handling mapped to targeted query invalidation
- Notification centre: bell with unread count, dropdown, full page, filters, mark-read, bulk actions
- Notification preferences per type and channel, with a quiet-hours setting
- Notification type and template administration
- Delivery log for administrators with per-channel status and retry
- Internal messaging: conversation list, thread view, compose, attachments, read receipts, typing indication
- Parent–teacher and parent–therapist communication threads within the portal
- Announcements: authoring, targeting, publishing, acknowledgment tracking
- Approval-workflow configuration UI: chains, levels, thresholds, delegation, escalation
- Organisation-wide configuration screens consolidated
- Backup and security administration: backup history, manual backup trigger, restore, session policy, IP access list

**Out of scope**

- Push notifications to mobile devices and SMS gateway administration beyond template configuration

---

## 2. Prerequisites

- Phase 0 notification bell stub and its query keys, which this phase replaces without changing call sites.
- Backend Phase 8 contract including the socket event catalogue with payload shapes and room semantics.
- Phase 2 parent portal shell for the portal-side messaging surfaces.

---

## 3. Routes and page tree

```
app/(app)/notifications/
├── page.tsx                               # full centre with filters
└── preferences/page.tsx

app/(app)/messages/
├── page.tsx                               # conversation list (empty-state pane on desktop)
└── [conversationId]/page.tsx              # thread

app/(app)/announcements/
├── page.tsx                               # feed
├── new/page.tsx
└── [id]/
    ├── page.tsx
    └── acknowledgments/page.tsx

app/(app)/admin/
├── notification-types/page.tsx
├── notification-templates/
│   ├── page.tsx
│   └── [id]/page.tsx
├── notification-deliveries/page.tsx
├── workflows/
│   ├── page.tsx                           # chain list
│   ├── new/page.tsx
│   └── [id]/page.tsx                      # chain builder
├── delegations/page.tsx
├── configuration/page.tsx                 # consolidated org configuration
└── security/
    ├── page.tsx                           # session policy + IP access list
    └── backups/page.tsx                   # backup history, manual trigger, restore

app/portal/
├── messages/
│   ├── page.tsx
│   └── [conversationId]/page.tsx
└── notices/page.tsx
```

On desktop, `/messages` renders a two-pane layout with the conversation list beside the thread; on mobile it is two separate screens with back navigation. The route structure supports both because `/messages/[id]` renders the list alongside the thread at wide viewports.

---

## 4. Real-time layer

### `SocketProvider`

A single provider mounted inside the authenticated layout owns the connection.

- Connects after authentication using the access token, and reconnects with the refreshed token when the token rotates. A socket authenticated with a stale token silently stops receiving events, which is worse than a visible disconnection.
- Exponential backoff on reconnect with a cap, and a jitter to avoid a thundering herd when a server restarts.
- Joins rooms based on the authenticated user's identity and roles, as the backend contract defines.
- Exposes connection state: `connecting`, `connected`, `reconnecting`, `disconnected`, `unsupported`.
- Disconnects on logout and on tab close, and pauses subscriptions when the tab is hidden for an extended period to avoid holding idle connections.

### `ConnectionStateIndicator`

- Invisible while connected, because a persistent "connected" badge is noise.
- On `reconnecting`, an unobtrusive indicator stating that live updates are paused and data will refresh.
- On `disconnected` or `unsupported`, a persistent but dismissible notice that live updates are unavailable and screens will refresh periodically instead. This sentence is important: it tells the user their data is still correct, just slower, which prevents them from assuming the application is broken.
- When the connection is lost, the query client's `refetchInterval` fallback is enabled for the notification and dashboard queries, so the degradation is graceful rather than nominal.

### Event to invalidation mapping

Events never carry authoritative state into the cache. **An event is a signal to refetch, not a source of truth.** The one exception is the notification list, where the payload is appended optimistically because the latency benefit is the entire point of the feature and a subsequent refetch reconciles it.

| Event | Handling |
|---|---|
| `notification:new` | Prepend to the notification list cache, increment the unread count, and show a transient toast for high-priority types only. Then invalidate the unread count so the server figure wins. |
| `notification:read` | Update the read state and the count — this keeps multiple open tabs consistent. |
| `session:updated`, `session:status_changed` | Invalidate `therapy.sessions.calendar` and the specific session. |
| `attendance:marked` | Invalidate the relevant attendance queries and the teacher dashboard tile. |
| `approval:pending` | Invalidate the relevant approval queue and the pending-approvals dashboard tile. |
| `approval:decided` | Invalidate the subject document and its queue. |
| `payroll:run_status` | Invalidate the payroll run status — this replaces the Phase 5 polling when the socket is available, while the polling remains as the fallback. |
| `export:job_status` | Invalidate the export job — same replacement pattern. |
| `stock:low` | Invalidate the low-stock query and the alert tile. |
| `message:new` | Append to the thread if it is open, increment the conversation's unread count, and invalidate the conversation list. |
| `message:typing` | Ephemeral UI only; never touches the cache. |
| `announcement:published` | Invalidate the announcement feed and show a toast for targeted users. |
| `dashboard:tile_invalidated` | Invalidate the named tile. |

A registry maps each event to its invalidation set, and a test asserts every event in the backend's documented catalogue has a handler. An unhandled event should fail a test rather than be silently dropped.

### Update disruption rules

| Situation | Behaviour |
|---|---|
| A list the user is viewing gains an item | The item appears, but the scroll position is preserved and the list does not reorder under the cursor. Where sorting would move rows, a "3 new items — refresh" affordance is offered instead of an automatic reorder. |
| A record the user is editing changes remotely | The form is never overwritten. A notice states that the record changed, names who changed it, and offers to discard local edits and reload. Silently clobbering a user's typing is the single worst thing a real-time layer can do. |
| A dashboard tile updates | It updates in place with a brief highlight, since nothing is being typed into it. |
| A calendar the user is viewing changes | The affected event updates in place; a newly created event appears with a highlight. |
| A toast for a high-priority notification | Never steals focus; announced politely; dismissible; auto-dismisses except for critical types. |

---

## 5. Component inventory

### Notification centre

| Component | Notes |
|---|---|
| `NotificationBell` | Unread count badge with the count in the accessible name. Replaces the Phase 0 stub with no change to its call site. |
| `NotificationDropdown` | The ten most recent with type icon, title, relative time, and read state. Actions to mark all read and to open the full centre. Each item navigates to its subject. |
| `NotificationCentre` | Full list with filters by type, read state, and date, plus bulk mark-read and pagination. |
| `NotificationItem` | Type, title, body, absolute and relative time, read state, and a link to the subject record. An item whose subject was deleted states that rather than producing a dead link. |
| `NotificationPreferences` | A matrix of notification type × channel (in-app, email, SMS) with toggles, plus a quiet-hours range and a digest-frequency option for low-priority types. Types the organisation has marked mandatory are shown as locked with the reason stated, rather than hidden — a user should know why they cannot turn off a payroll notification. |
| `NotificationTypeTable` / `NotificationTypeForm` | Administration of types with default channels, priority, and the mandatory flag. |
| `NotificationTemplateEditor` | Subject and body per channel with a **variable palette** listing the available variables for the type, insertable at the cursor. A live preview renders the template against sample data. An unknown variable is flagged before saving, since a broken template is only discovered when a real notification goes out wrong. |
| `TemplateTestSendDialog` | Sends a test to the current user on a chosen channel. |
| `DeliveryLogTable` | Recipient, type, channel, status, attempts, error, and sent time. Filterable by status and channel, with a retry action for failed deliveries and a bulk retry. A failed-delivery count is surfaced on the admin dashboard, because silent delivery failure is the most common real problem with notification systems. |

### Messaging

| Component | Notes |
|---|---|
| `ConversationList` | Participants, last message preview, unread count, and time. Sorted by last activity. Search across participants and content. |
| `ConversationThread` | Chronological messages grouped by day with date separators, sender identity, timestamp, read receipts, and attachments. Auto-scrolls to the newest message only when the user is already at the bottom; otherwise it shows a "new messages" affordance so reading history is not interrupted. |
| `MessageComposer` | Multi-line input with attachment upload, a send action, and Enter-to-send with Shift+Enter for a newline. Emits typing events, debounced. A message that fails to send is retained in the composer with a retry rather than lost. |
| `TypingIndicator` | Shows who is typing, with the identity in text. |
| `MessageAttachment` | Inline preview for images and PDFs; a download action otherwise. |
| `NewConversationDialog` | Recipient selection constrained by role: a parent may only start a conversation with staff assigned to their own child, which is enforced server-side and reflected in the picker's contents. |
| `ReadReceiptIndicator` | Per-message delivery and read state, with the state in text. |

### Announcements

| Component | Notes |
|---|---|
| `AnnouncementFeed` | Cards with title, excerpt, author, publish time, priority, and acknowledgment state for the current user. Unacknowledged announcements requiring acknowledgment are pinned to the top. |
| `AnnouncementEditor` | Title, rich body, priority, targeting (all, by role, by class or group, by individual), publish scheduling, expiry, attachments, and an acknowledgment-required flag. The targeting step shows the **resolved recipient count** before publishing, because publishing to the wrong audience cannot be undone. |
| `AnnouncementDetail` | Full content, attachments, and an acknowledge action where required. |
| `AcknowledgmentTracker` | Acknowledged and pending recipient lists with counts and a reminder action for pending ones. |
| `PortalNoticeList` | The parent-facing view, targeted to their children's classes and groups. |

### Workflow configuration

| Component | Notes |
|---|---|
| `WorkflowChainTable` | Document type, chain name, active state, level count, and last modified. |
| `WorkflowChainBuilder` | Ordered approval levels, each with an approver by role or named user, an optional amount threshold, a skip condition, and an SLA in hours. A **live simulation panel** lets the administrator enter a sample document (type, amount, department) and see exactly which levels would apply and in what order. Approval chains are configuration with far-reaching consequences, and a builder without simulation guarantees production surprises. |
| `WorkflowLevelRow` | Level ordering by drag with a keyboard-accessible move-up and move-down alternative. |
| `ThresholdEditor` | Amount bands per level with gap and overlap detection, stating any uncovered range explicitly. |
| `EscalationSettings` | SLA breach behaviour: notify, escalate to the next level, or auto-approve, with auto-approve carrying an explicit warning about its consequence. |
| `DelegationTable` / `DelegationForm` | Delegator, delegate, document types, date range, with an overlap check and a statement that actions taken by the delegate are recorded as delegated in the audit trail. |
| `WorkflowActivationDialog` | States how many in-flight documents exist under the current chain and confirms that they continue under the old chain while new documents use the new one — the ambiguity that otherwise causes support tickets. |

### Consolidated configuration

| Component | Notes |
|---|---|
| `ConfigurationPage` | Tabbed consolidation of organisation profile, academic and fiscal settings, numbering schemes, holiday master, session and slot defaults, fee and billing defaults, notification defaults, and security settings such as session timeout and password policy. Each tab is permission-gated independently. |
| `ConfigChangeConfirmation` | For settings with wide effects — numbering schemes, fiscal year start, session timeout — a confirmation stating the effect and that the change is audited. |

### Backup and security administration

Feature 9.5's operational work is a backend concern, but three parts of it need an interface, and without one an administrator has no way to exercise them.

| Component | Notes |
|---|---|
| `BackupHistoryTable` | Backup time, type (scheduled or manual), size, duration, status, and retention expiry. A failed backup is prominent, because a silently failing backup schedule is only discovered when a restore is needed. |
| `ManualBackupPanel` | Trigger action with the last backup time shown, plus a progress indicator while the job runs, following the same job-polling pattern as payroll and exports. |
| `RestoreDialog` | The most dangerous action in the application. It states the backup's timestamp, that all data created since then will be lost, and requires typing the backup's identifier to confirm. Restricted to super_admin, and the UI states that the action is audited and that users will be signed out. |
| `SessionPolicyForm` | Idle timeout, absolute session lifetime, and concurrent session limit, with each value's effect stated in words rather than left to inference. A change warns that active sessions are affected. |
| `IpAccessListPanel` | Allow and deny entries with CIDR input, a label per entry, and an active toggle. A **live check against the administrator's own current IP** is shown before saving, because the classic failure here is locking yourself out of the system with a correct-looking rule. |

---

## 6. Server state

### Query keys

```typescript
notifications: {
  list: (f) => [...], unreadCount: [...], item: (id) => [...],
  preferences: [...], types: [...], templates: (f) => [...], template: (id) => [...],
  deliveries: (f) => [...], deliveryStats: [...],
},
messages: {
  conversations: (f) => [...], conversation: (id) => [...],
  thread: (id, page) => [...], unreadTotal: [...],
  recipientOptions: (context) => [...],
},
announcements: {
  feed: (f) => [...], item: (id) => [...],
  acknowledgments: (id) => [...], recipientPreview: (targeting) => [...],
},
workflows: {
  chains: (f) => [...], chain: (id) => [...], simulate: (chainId, sample) => [...],
  delegations: (f) => [...], inFlightCount: (chainId) => [...],
},
config: { all: [...], section: (key) => [...] },
security: {
  backups: (f) => [...], backupJob: (id) => [...],
  sessionPolicy: [...], ipAccessList: [...], currentIp: [...],
}
```

### Polling fallback

Every real-time-backed query keeps a polling configuration that activates only when the socket is unavailable.

```typescript
const liveOrPoll = (isConnected: boolean, intervalMs: number) =>
  isConnected ? { refetchInterval: false as const } : { refetchInterval: intervalMs };
```

| Query | Fallback interval |
|---|---|
| `notifications.unreadCount` | 30 s |
| `notifications.list` | 60 s |
| `messages.unreadTotal` | 30 s |
| `messages.thread` (open thread) | 10 s |
| `messages.conversations` | 60 s |
| `dashboard.tile` | already 2 min stale time with focus refetch; unchanged |
| `payroll.runStatus`, `exportJob` | retain their Phase 5 and 7 polling as-is |

This table is the concrete expression of "real-time is an enhancement." A reviewer can check it and know the application still functions with WebSockets blocked.

### Invalidation

| Mutation | Invalidates |
|---|---|
| Mark notification read | `notifications.list`, `notifications.unreadCount` |
| Mark all read | `notifications.list`, `notifications.unreadCount` |
| Update preferences | `notifications.preferences` |
| Create or update a type | `notifications.types`, `notifications.templates` |
| Save a template | `notifications.template`, `notifications.templates` |
| Retry a delivery | `notifications.deliveries`, `notifications.deliveryStats` |
| Send a message | `messages.thread`, `messages.conversation`, `messages.conversations`, `messages.unreadTotal` |
| Open a thread (read) | `messages.conversation`, `messages.conversations`, `messages.unreadTotal` |
| Publish an announcement | `announcements.feed`, `announcements.item`, `announcements.acknowledgments` |
| Acknowledge an announcement | `announcements.feed`, `announcements.item`, `announcements.acknowledgments` |
| Save a workflow chain | `workflows.chains`, `workflows.chain`, `workflows.simulate` |
| Activate a chain | `workflows.chains`, `workflows.chain`, plus every approval-queue key, since routing changes |
| Create a delegation | `workflows.delegations`, plus the affected approval queues |
| Update configuration | `config.all`, `config.section`, plus the domain keys the section affects (numbering schemes affect document lists; fiscal settings affect period queries) |
| Trigger a manual backup | `security.backups`, `security.backupJob` (polled at 2 s while running, as with payroll and exports) |
| Update the session policy | `security.sessionPolicy`, `config.section('security')` |
| Update the IP access list | `security.ipAccessList`, `security.currentIp` |

---

## 7. Client state

- `socketStore` — connection state, last connected time, reconnect attempt count, and whether the environment reported WebSocket as unsupported.
- `notificationStore` — dropdown open state and the toast queue with priority ordering.
- `messageStore` — the open conversation, draft text per conversation (so switching threads does not lose a draft), typing state, and the failed-send queue.
- `announcementDraftStore` — editor draft with autosave.
- `workflowBuilderStore` — the chain being edited with its simulation input.
- `remoteChangeStore` — per open form, whether a remote change was detected, by whom, and when, driving the non-destructive reload notice.

---

## 8. Forms and validation

| Form | Notable rules |
|---|---|
| Notification preferences | Mandatory types cannot be disabled, with the reason stated; quiet-hours start ≠ end; a digest frequency requires at least one type assigned to it |
| Notification type | Code unique; at least one default channel; priority required |
| Notification template | Subject required for email; body required for every enabled channel; every variable used must exist in the type's variable set, with unknown variables named; the preview must render before save; SMS body length warns beyond the single-segment limit with the segment count stated |
| Message | Non-empty body or at least one attachment; attachment size and type validated client-side against the configured limits; recipient permitted by the role rules |
| Announcement | Title and body required; at least one target; the resolved recipient count must be greater than zero, with the targeting restated if it resolves to nobody; expiry after publish time; a scheduled publish time in the future |
| Workflow chain | At least one level; level order contiguous; each level has an approver; thresholds must not overlap and must leave no gap, with any uncovered range named; SLA positive; the simulation must run successfully before activation |
| Delegation | Delegate ≠ delegator; date range valid; at least one document type; an overlapping delegation for the same type blocked with a link to the existing one |
| Configuration | Per-section rules; session timeout within the policy bounds; a numbering scheme change blocked mid-sequence with the current sequence value stated |
| Session policy | Idle timeout and absolute lifetime within the configured bounds; idle timeout < absolute lifetime; concurrent session limit ≥ 1 |
| IP access list | Valid CIDR notation; a label required per entry; **a rule that would exclude the administrator's own current IP is blocked with that IP stated**, since a lockout requires server-side intervention to undo |
| Restore | Typed confirmation of the backup identifier required; super_admin only; the data-loss window stated in words before the confirmation field |

---

## 9. RBAC visibility

| Element | Visible to |
|---|---|
| Notification bell, centre, preferences | every authenticated user, for themselves |
| Notification types and templates | super_admin |
| Delivery log and retry | super_admin, principal |
| Messaging | every authenticated user; recipient options constrained by role |
| Parent messaging | parents may message only staff assigned to their own children |
| Announcement authoring | principal, super_admin, coordinator |
| Announcement targeting to all staff and parents | principal, super_admin |
| Acknowledgment tracker | the author, principal, super_admin |
| Workflow chains | super_admin, principal |
| Delegations | super_admin; users may create their own delegation for the period they are away, subject to permission |
| Configuration tabs | per-tab: organisation and security to super_admin; academic and fiscal to principal and super_admin; fee defaults to accountant and principal; notification defaults to super_admin |
| Backup history and manual trigger | super_admin, principal (read-only) |
| Restore | super_admin only |
| Session policy and IP access list | super_admin only |

The parent recipient constraint is the sharpest isolation concern in this phase. A parent must not be able to enumerate staff, discover other parents, or address a conversation to a staff member unrelated to their child. The picker is populated from a scoped endpoint, and an E2E test attempts a direct API-shaped request from the portal session to confirm the server refuses it — a UI-only constraint would be no constraint.

---

## 10. Accessibility and responsive requirements

| Item | Requirement |
|---|---|
| Bell | Unread count in the accessible name ("Notifications, 5 unread"); the dropdown is a proper menu with arrow-key navigation and focus return on close |
| New notification toast | `role="status"` with polite announcement; never steals focus; dismissible by keyboard; critical types persist |
| Connection state | The reconnecting and disconnected states announced politely once, not repeatedly on each retry; the notice text explains that data still refreshes |
| Notification centre | Filters labelled; the result count announced; bulk selection state announced; read state stated in text, not by colour or weight alone |
| Preferences matrix | A real table with row and column headers; each toggle's accessible name includes both the type and the channel; a locked toggle states why it is locked |
| Template editor | The variable palette is keyboard-operable and insertion is announced; the preview is a labelled region; an unknown-variable error names the variable |
| Delivery log | Status in text; the retry action's accessible name names the recipient |
| Conversation list | Unread state and count in text; the selected conversation indicated programmatically |
| Thread | Messages in a labelled log region with `aria-live="polite"` scoped so that only newly arriving messages are announced, not the whole history on load — the difference between a helpful and an unusable screen reader experience |
| Day separators | Real headings within the log |
| Composer | Labelled; the Enter-to-send behaviour stated in help text; a failed send announced with the retry focusable |
| Typing indicator | Announced politely and infrequently, debounced so it does not chatter |
| Read receipts | State in text per message |
| Announcement editor | The resolved recipient count announced when targeting changes; the acknowledgment-required flag's consequence stated |
| Announcement feed | Pinned unacknowledged items are announced as requiring acknowledgment; priority in text |
| Workflow builder | Levels are an ordered list; reordering has keyboard move actions and is announced with the new position; threshold gaps and overlaps stated in text with the ranges; the simulation result readable in sequence as an ordered list of levels |
| Remote-change notice | Announced politely; states who changed the record; the reload action is focusable and never automatic |
| Mobile messaging | Two separate screens with back navigation; the composer is fixed above the keyboard; the thread does not jump when the keyboard opens |
| Mobile notification centre | Full-screen list with a filter sheet |
| Mobile preferences matrix | Becomes per-type cards with channel toggles, since a matrix is unusable at 360px |
| Mobile workflow builder | Vertical level cards with move actions; the simulation panel in a sheet |

---

## 11. Tests owed by this phase

### Component and hook tests

| Target | Scenarios |
|---|---|
| `SocketProvider` | Connects with the access token; reconnects with a refreshed token after rotation; backoff increases and is capped; disconnects on logout; state transitions are exposed correctly |
| Event registry completeness | Every event in the backend's documented catalogue has a handler with a declared invalidation set — the test that prevents silently dropped events |
| Event handling | For each event, assert exactly the expected query keys are invalidated and no others |
| `notification:new` handling | Prepends optimistically, increments the count, then reconciles with the server count; a toast appears for high priority only |
| `message:typing` handling | Never writes to the query cache |
| Polling fallback | For each query in the fallback table, assert `refetchInterval` is the stated value when disconnected and `false` when connected |
| Degradation | With the socket forced unavailable, the notification count, message thread, and conversation list all still update via polling |
| `ConnectionStateIndicator` | Hidden when connected; the reconnecting and disconnected texts render; announcement happens once rather than per retry |
| Remote-change handling | With a form dirty and a remote change event received, the form retains local values, the notice names the changer, and reload is manual |
| List-update rules | An incoming item does not reorder a sorted list under the user; the "new items" affordance appears instead; the scroll position is preserved |
| `NotificationBell` | Count in the accessible name; the dropdown is a menu with arrow-key navigation and focus return |
| `NotificationCentre` | Filters; bulk mark-read; an item with a deleted subject states so instead of linking |
| `NotificationPreferences` | Matrix toggles; a mandatory type is locked with the reason; quiet-hours validation; accessible names include type and channel; the mobile card layout renders |
| `NotificationTemplateEditor` | Variable insertion at the cursor; an unknown variable is named and blocks save; the preview renders against sample data; the SMS segment count warning appears at the boundary |
| `DeliveryLogTable` | Status in text; retry per row and in bulk; filters |
| `ConversationList` | Unread counts; search across participants and content; selection state programmatic |
| `ConversationThread` | Day separators as headings; auto-scroll only when already at the bottom, otherwise the "new messages" affordance; only newly arriving messages are announced, not the history |
| `MessageComposer` | Enter sends and Shift+Enter inserts a newline; a failed send retains the text and offers a retry; typing events are debounced; drafts persist per conversation across switching |
| `NewConversationDialog` | For a parent, only staff assigned to their own children are offered; for staff, the appropriate set |
| `AnnouncementEditor` | The resolved recipient count updates with targeting and is announced; targeting resolving to nobody blocks publish; scheduled publish must be in the future |
| `AcknowledgmentTracker` | Counts correct; the reminder action targets pending recipients only |
| `WorkflowChainBuilder` | Level add, remove, reorder by keyboard with the position announced; threshold overlap and gap detection names the ranges; the simulation returns the correct level sequence for six sample documents including a threshold boundary and a skip condition |
| `WorkflowActivationDialog` | States the in-flight document count and the old-chain continuation rule |
| `DelegationForm` | Overlap blocked with a link to the existing delegation; delegate ≠ delegator |
| `ConfigurationPage` | Each tab is independently permission-gated across all nine roles; a wide-effect change shows the confirmation with its stated effect |
| `BackupHistoryTable` | A failed backup renders prominently with its error; retention expiry stated; the manual and scheduled types are distinguished in text |
| `ManualBackupPanel` | Trigger shows progress and polls; completion refreshes the history; the last backup time renders |
| `RestoreDialog` | Typed backup-identifier confirmation enforced; the data-loss window stated before the confirmation field; absent entirely for every role except super_admin |
| `SessionPolicyForm` | Idle timeout must be below the absolute lifetime; each value's effect stated in words; the active-session warning renders on change |
| `IpAccessListPanel` | CIDR validation; a rule excluding the administrator's own IP is blocked with that IP stated; the current-IP check renders before save |

### E2E scenarios

| ID | Scenario |
|---|---|
| `RT-E2E-01` | Two browser contexts: user A triggers an action that notifies user B → B's bell count increments without a reload → B opens the notification and lands on the subject record (mirrors TDD NOT-E2E-01) |
| `RT-E2E-02` | **With WebSocket blocked at the network layer**, the same notification arrives for B within the polling interval, and the disconnected notice explains that live updates are unavailable — the proof that real-time is an enhancement |
| `RT-E2E-03` | Kill the socket server mid-session → the reconnecting indicator appears → restart → the connection is restored and events resume without a reload |
| `RT-E2E-04` | Rotate the access token during a session and confirm events continue to arrive |
| `RT-E2E-05` | User A has a session-edit form dirty; user B changes that session → A's form retains its input and shows the notice naming B → A reloads deliberately |
| `RT-E2E-06` | Mark a notification read in one tab; a second tab's count updates |
| `RT-E2E-07` | A therapy session status change in one context updates another context's calendar in place, and the dashboard tile updates |
| `MSG-E2E-01` | Two contexts exchange messages in a thread: messages arrive live, typing indication appears, read receipts update, and an attachment uploads and previews |
| `MSG-E2E-02` | A parent starts a conversation and can address only staff assigned to their own child; a direct attempt to address unrelated staff is refused by the server |
| `MSG-E2E-03` | Send a message while offline → the composer retains it → reconnect → retry succeeds |
| `MSG-E2E-04` | Switch between two conversations with drafts in each; both drafts persist |
| `MSG-E2E-05` | Mobile viewport: list and thread as separate screens, the composer stays above the keyboard, and the thread does not jump |
| `ANN-E2E-01` | Author an announcement targeted to one class with acknowledgment required → the recipient count is shown before publish → publish → a parent of that class sees it pinned in the portal → acknowledges → the tracker reflects it (mirrors NOT-E2E-02) |
| `ANN-E2E-02` | An announcement targeted to a group resolving to nobody cannot be published |
| `WF-E2E-01` | Configure a two-level chain with an amount threshold → simulate a document below and above the threshold and confirm the level sequences → activate with the in-flight notice → raise a document above the threshold → both levels appear in the approval trail and both approvers are notified (mirrors TDD WF-E2E-01) |
| `WF-E2E-02` | Create a delegation → the delegate sees the delegator's pending approvals → approves → the audit trail records it as a delegated action |
| `WF-E2E-03` | An SLA breach escalates according to the configured behaviour and notifies the escalation target |
| `WF-E2E-04` | A threshold gap is detected and named at configuration time, and activation is blocked |
| `NOT-E2E-01` | Disable a non-mandatory notification type's email channel → trigger it → an in-app notification exists and no email delivery is recorded |
| `NOT-E2E-02` | A mandatory type cannot be disabled and states why |
| `NOT-E2E-03` | Quiet hours defer a low-priority notification's email while the in-app notification appears immediately |
| `NOT-E2E-04` | A failed delivery appears in the log and a retry succeeds |
| `SEC-E2E-01` | Trigger a manual backup → progress polls to completion → the backup appears in the history with its size and retention expiry |
| `SEC-E2E-02` | The restore action is absent for principal and every other role, and present only for super_admin; opening it requires the typed backup identifier |
| `SEC-E2E-03` | Change the session policy → the active-session warning appears → save → a new session honours the new idle timeout |
| `SEC-E2E-04` | Add an IP deny rule covering the administrator's own address → blocked with that address stated → add a rule excluding a different range → saved |
| `A11Y-E2E-10` | Keyboard-only: open the bell menu, navigate items, open one, then send a message and reorder two workflow levels |
| `A11Y-E2E-11` | Screen-reader assertions: a thread load does not announce the whole history, an arriving message is announced, and the reconnecting state is announced once |

### Accessibility tests

- `jest-axe` on every component in section 5.
- Full-page axe scan on: notification centre, preferences (desktop and mobile layouts), type and template administration, template editor, delivery log, conversation list, thread, announcement feed, announcement editor, acknowledgment tracker, workflow chain list, chain builder, delegation management, each configuration tab, the security page, and the backup page.
- Live-region assertions for the notification toast, connection state, arriving messages, typing indication, recipient count, and workflow level reordering.

### Visual regression

Baselines for: the bell with and without unread items; the dropdown; the notification centre; the preferences matrix at desktop and its mobile card layout; the template editor with the variable palette and preview; the delivery log with failures; the two-pane desktop messaging layout and both mobile screens; the thread with attachments, receipts, and typing indication; the announcement editor targeting step with the recipient count; the pinned unacknowledged feed state; the workflow builder with thresholds and the simulation result; and the connection-state reconnecting and disconnected notices.

---

## 12. Exit criteria

Global Definition of Done, plus:

- [ ] Every screen from Phases 0–7 works with WebSocket blocked, proven by `RT-E2E-02` and the polling-fallback table test.
- [ ] The event registry test proves every backend event has a handler and a declared invalidation set.
- [ ] No socket event writes authoritative state into the cache except the notification list, which reconciles with the server.
- [ ] A dirty form is never overwritten by a remote change; the notice names the changer and reload is manual.
- [ ] Sorted lists do not reorder under the user; a refresh affordance is offered instead.
- [ ] Socket reconnection survives access-token rotation.
- [ ] The connection-state notice explains that data still refreshes, and is announced once rather than per retry.
- [ ] The Phase 0 notification bell stub is replaced with no change to its call sites.
- [ ] A thread load does not announce the entire history to a screen reader; arriving messages are announced.
- [ ] Message drafts persist per conversation, and a failed send is never lost.
- [ ] Parent messaging is constrained to staff assigned to their own children, enforced server-side and proven by `MSG-E2E-02`.
- [ ] Announcement publishing shows the resolved recipient count and blocks a zero-recipient publish.
- [ ] The workflow builder's simulation is required before activation and correct across six samples including a threshold boundary.
- [ ] Threshold gaps and overlaps are named at configuration time.
- [ ] Mandatory notification types cannot be disabled and state why.
- [ ] The restore action is absent for every role except super_admin and requires a typed backup identifier with the data-loss window stated.
- [ ] An IP access rule that would lock out the acting administrator is blocked with their address stated.
- [ ] Zero axe violations across all scanned pages.
