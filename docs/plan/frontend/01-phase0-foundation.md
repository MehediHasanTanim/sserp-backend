# Frontend Phase 0 — App Shell, Authentication & Design System

| Field | Value |
|---|---|
| Duration | 3 weeks |
| Prerequisites | Backend Phase 0 contract published |
| Feature list coverage | 9.1 User Management, 9.2 Organization Configuration, 9.4 Audit Trail viewer |
| TDD sections | 4.1, 5.2, 8.1–8.4, 16 |
| Backend counterpart | [backend/01-phase0-foundation.md](../backend/01-phase0-foundation.md) |

---

## 1. Objective and scope

Build the foundation every later phase depends on: the Next.js application, the authentication flow, the design system, the shared component library, the API client, the RBAC plumbing, and the test infrastructure. No domain feature ships here beyond user and organisation administration.

The quality bar is high because defects here propagate everywhere. A `DataTable` that mishandles empty states, or a `MoneyInput` that loses a paisa, becomes a hundred bugs later.

**In scope**

- Project scaffold, TypeScript strict config, Tailwind theme, ESLint/Prettier
- OpenAPI type generation and the MSW mock layer
- Design tokens and the shadcn/ui base component set
- Shared components: `DataTable`, `StatusBadge`, `MoneyInput`, `FileUpload`, `DateRangePicker`, `ConfirmDialog`, `EmptyState`, `ErrorState`, `PageHeader`, `Breadcrumbs`, `Pagination`, `FilterBar`
- Layouts: auth, staff app shell, portal shell (structure only)
- Login, forgot password, reset password, forced password change, session idle warning
- API client with envelope unwrapping, single-flight token refresh, and error mapping
- Permission helpers and the `<Can>` component
- User administration, role permission editor, organisation settings, numbering schemes, audit log viewer
- Notification bell stub and `notificationStore`
- Storybook, Jest + RTL, Playwright, axe, visual regression harness

**Out of scope**

- Any school, therapy, HR, accounts, inventory, or procurement page
- Real-time socket connection (Phase 8) — the bell polls `/notifications/unread-count` until then
- Dashboards (Phase 7) — `/dashboard` shows a role-aware placeholder with quick links

---

## 2. Prerequisites

Backend Phase 0 merged and `openapi.json` published, providing auth, admin, files, notifications, and health endpoints.

---

## 3. Routes and page tree

```
app/
├── layout.tsx                          # providers, fonts, html lang, Toaster
├── (auth)/
│   ├── layout.tsx                      # centred card, org logo, no navigation
│   ├── login/page.tsx
│   ├── forgot-password/page.tsx
│   ├── reset-password/page.tsx         # token from query string
│   ├── change-password/page.tsx        # forced change; only reachable when flagged
│   └── two-factor/page.tsx             # scaffolded, enabled in Phase 9
├── (app)/
│   ├── layout.tsx                      # sidebar + header + breadcrumbs + idle timer
│   ├── dashboard/page.tsx              # role-aware placeholder
│   ├── profile/
│   │   ├── page.tsx                    # own profile
│   │   └── notifications/page.tsx      # notification preferences (stub until Phase 8)
│   ├── notifications/page.tsx          # full notification list
│   └── admin/
│       ├── users/
│       │   ├── page.tsx                # list
│       │   ├── new/page.tsx
│       │   └── [id]/page.tsx           # detail + edit + role assignment
│       ├── roles/
│       │   ├── page.tsx
│       │   └── [id]/permissions/page.tsx   # permission matrix editor
│       ├── organization/page.tsx       # org profile + system settings tabs
│       ├── numbering/page.tsx
│       ├── audit-logs/page.tsx
│       └── login-activity/page.tsx
├── (portal)/
│   └── layout.tsx                      # structure only; pages arrive in Phase 2
├── unauthorized/page.tsx
├── error.tsx
├── not-found.tsx
└── global-error.tsx
```

### Middleware

`middleware.ts` responsibilities:

1. Allow `(auth)` routes and static assets through unconditionally.
2. For everything else, require a refresh-cookie presence; redirect to `/login?next=<path>` when absent.
3. Route by role: a `parent` token requesting an `(app)` path is redirected to `/portal`; a staff token requesting `/portal` is redirected to `/dashboard`.
4. When the session is flagged `mustChangePassword`, redirect everything except `/change-password` and `/logout` to `/change-password`.

Role is read from a lightweight non-sensitive session hint cookie set at login, not by decoding the access token in middleware (the access token is memory-only). The hint cookie carries only the role names and is never trusted for authorisation — only for routing.

---

## 4. Component inventory

### `components/ui/` — shadcn base

Generated and lightly customised: `button`, `input`, `textarea`, `select`, `checkbox`, `radio-group`, `switch`, `label`, `form`, `dialog`, `sheet`, `dropdown-menu`, `popover`, `tooltip`, `tabs`, `table`, `card`, `badge`, `alert`, `avatar`, `skeleton`, `separator`, `scroll-area`, `command`, `calendar`, `toast`, `progress`, `accordion`, `alert-dialog`, `breadcrumb`.

Customisations are limited to token wiring and focus-ring visibility. Radix behaviour is not overridden — that is the point of using it.

### `components/shared/`

| Component | Responsibility and notable requirements |
|---|---|
| `DataTable<T>` | TanStack Table wrapper. Server-side sort/filter/pagination, column visibility, row selection, sticky header, loading skeleton rows, empty state slot, error state slot, export hook, mobile card collapse below `md`. Full keyboard navigation and correct `<th scope>`. |
| `StatusBadge` | Maps a domain status union to a token + label + optional icon. A status not present in the map is a type error. |
| `MoneyInput` | Displays major units, emits minor units. Handles paste, negative rejection where configured, and locale grouping. Never uses floating-point arithmetic. |
| `MoneyDisplay` | Renders minor units with the org currency symbol and alignment suitable for tables. |
| `FileUpload` | Presign → PUT to MinIO with progress → confirm. Drag-and-drop, mime and size validation mirroring the server's rules, retry on failure, multi-file, preview for images and PDFs. Keyboard-operable. |
| `DateRangePicker` | Presets (this month, last month, this term, this fiscal year, custom), max-range enforcement, org-timezone aware. |
| `DatePicker` | Single date, business-date semantics (no time component). |
| `ConfirmDialog` | Destructive-action confirmation stating exactly what will happen and requiring an explicit action; optional typed confirmation for high-risk operations. |
| `EmptyState` | Illustration slot, message, primary action. Distinct from loading and error. |
| `ErrorState` | Message, retry action, optional detail disclosure. |
| `PageHeader` | Title, subtitle, breadcrumb slot, action button group, tab slot. |
| `Breadcrumbs` | Derived from the route segment map, not hand-passed per page. |
| `Pagination` | Cursor and page modes, page-size selector, total display, keyboard support. |
| `FilterBar` | Composable filter controls with an active-filter chip row, clear-all, and persistence into `filterStore`. |
| `SearchInput` | Debounced, with a clear button and a loading indicator. |
| `EntitySelect` | Async-search combobox for picking students, employees, patients, vendors, items. Paginated, keyboard-navigable, with a "no results" state distinguishable from "still loading". Used pervasively in later phases. |
| `Timeline` | Chronological event list used for status history, audit trails, and approval trails. |
| `KeyValueList` | Label/value pairs with responsive column collapse — the standard detail-page primitive. |
| `TabbedDetailLayout` | Standard entity detail scaffold: header, tab navigation, content area. Every entity detail page in later phases uses it, which is what makes the app feel consistent. |
| `AsyncActionButton` | Button with pending, success, and error states, preventing double submission. |
| `PermissionGate` / `<Can>` | Renders children only when the permission is held; optional `fallback`. |

### `components/layout/`

| Component | Notes |
|---|---|
| `AppSidebar` | Module navigation filtered by permission; collapsible; drawer below `lg`; active-route highlighting; keyboard navigable with a skip-to-content link. |
| `AppHeader` | Org logo and name, global search placeholder, notification bell, user menu (profile, preferences, logout). |
| `NotificationBell` | Unread count badge, dropdown with the 10 most recent, "view all" link. Polls `/notifications/unread-count` every 60 s in this phase; switches to socket push in Phase 8 with no interface change. |
| `IdleTimeoutWarning` | Modal at 2 minutes before the configured idle timeout with "stay signed in" and countdown. Announced via `aria-live` so it is not silently missed. |
| `PortalHeader` / `PortalBottomNav` | Portal shell structure, populated in Phase 2. |
| `Breadcrumbs` | Route-segment driven, with human labels from a central segment map. |

### `components/forms/`

`FormField` (label + control + description + error, wired to React Hook Form), `FormSection`, `FormActions` (sticky on mobile), `FormErrorSummary` (a focusable list of errors at the top, essential for accessibility on long forms).

---

## 5. Server state

### Hooks

| Hook | Endpoint |
|---|---|
| `useLogin()` | `POST /auth/login` |
| `useLogout()` | `POST /auth/logout` |
| `useCurrentUser()` | `GET /auth/me` — the source of roles and permissions |
| `useChangePassword()` | `POST /auth/change-password` |
| `useForgotPassword()` / `useResetPassword()` | Password recovery |
| `useUsers(filters)` / `useUser(id)` | `GET /admin/users` |
| `useCreateUser()` / `useUpdateUser()` / `useDeactivateUser()` / `useResetUserPassword()` / `useUnlockUser()` | User mutations |
| `useRoles()` / `useRolePermissions(id)` / `useUpdateRolePermissions()` | Role administration |
| `useOrganization()` / `useUpdateOrganization()` | Org settings; `staleTime: Infinity` with explicit invalidation |
| `useNumberingSchemes()` / `useUpdateNumberingScheme()` | Numbering |
| `useAuditLogs(filters)` / `useEntityAuditTrail(type, id)` | Audit |
| `useLoginActivity(filters)` | Login log |
| `useNotifications(filters)` / `useUnreadCount()` / `useMarkRead()` / `useMarkAllRead()` | Notifications |
| `usePresignUpload()` / `useConfirmUpload()` / `useDownloadUrl(id)` | Files |

### Query keys

```typescript
export const queryKeys = {
  auth:   { me: ['auth', 'me'] as const },
  users:  {
    all:    ['users'] as const,
    list:   (f: UserFilters) => ['users', 'list', f] as const,
    detail: (id: string)     => ['users', 'detail', id] as const,
  },
  roles:  {
    all:         ['roles'] as const,
    permissions: (id: string) => ['roles', id, 'permissions'] as const,
  },
  organization:     ['organization'] as const,
  numberingSchemes: ['numbering-schemes'] as const,
  audit: {
    list:   (f: AuditFilters) => ['audit', 'list', f] as const,
    entity: (t: string, id: string) => ['audit', 'entity', t, id] as const,
  },
  notifications: {
    list:  (f: NotificationFilters) => ['notifications', 'list', f] as const,
    count: ['notifications', 'count'] as const,
  },
} as const;
```

### Invalidation rules

| Mutation | Invalidates |
|---|---|
| Create / update / deactivate user | `users.all`, and `auth.me` when the target is self |
| Update role permissions | `roles.permissions(id)`, `auth.me` for affected sessions |
| Update organisation | `organization`, plus a full reload prompt if the timezone or currency changed (formatting is cached app-wide) |
| Mark notification read | `notifications.list`, `notifications.count` — optimistic |

---

## 6. Client state

### `authStore`

```typescript
interface AuthState {
  accessToken: string | null;          // memory only
  user: CurrentUser | null;
  roles: RoleName[];
  permissions: Set<string>;            // "module:action"
  isRefreshing: boolean;
  lastActivityAt: number;
  setSession(token: string, user: CurrentUser): void;
  clearSession(): void;
  touch(): void;                       // called by the activity listener
  hasPermission(p: string): boolean;
  hasRole(r: RoleName | RoleName[]): boolean;
}
```

Bootstrap on app load: attempt a silent refresh via the cookie. While it is in flight, protected content renders a full-page skeleton — never a flash of the login screen, which is a common and jarring bug.

### `uiStore`

Sidebar collapsed state, active module, table density, theme. Persisted to `localStorage` (non-sensitive).

### `notificationStore`

Unread count, recent items, connection status (`polling` in this phase, `connected`/`reconnecting` from Phase 8), toast queue.

### `filterStore`

Per-route filter state keyed by pathname, persisted for the session so a user returning to a list sees the view they left.

### Idle timeout

An activity listener (pointer, key, focus) calls `authStore.touch()` at most once per second. A timer compares against `organization.sessionIdleTimeoutMinutes`. At `timeout − 2min` the warning modal appears; at timeout the session is cleared and the user is redirected to login with a reason message. The backend enforces the same window server-side, so the client timer is a courtesy, not a control.

---

## 7. Forms and validation

| Form | Schema highlights |
|---|---|
| Login | Username or email required; password required; remember-me toggle. Submit disabled while pending. After 5 failures the lockout message shows the retry time from the API. |
| Forgot password | Email format. Always shows the same success message regardless of account existence, matching the backend's non-disclosure. |
| Reset password | Token from the URL; password against the full policy with a live requirement checklist (not just an error after submit); confirmation match. |
| Change password | Current password, new password with checklist, confirmation. |
| User create/edit | Username (min 3, alphanumeric plus dot/underscore), email, at least one role, optional employee link via `EntitySelect`, active toggle. |
| Role permissions | A matrix of module × action checkboxes with per-row select-all and a diff summary before save, because a mis-click here silently changes what nine roles can do. |
| Organisation settings | Name, logo upload, address, phone, email, currency, timezone, date format, fiscal year start, idle timeout. Timezone and currency changes warn that formatting will change app-wide. |
| Numbering scheme | Prefix (max 6 chars), padding (1–10), reset period, with a live preview of the next generated code. |

**Shared form behaviours**

- Zod schemas live in `features/<domain>/schemas.ts` and are derived from generated request types where the shape allows.
- Server-side field errors from a 400 response are mapped back onto the corresponding form fields via `setError`, so validation failures land where the user is looking.
- Unsaved-changes guard on navigation away from a dirty form.
- `FormErrorSummary` at the top of long forms, focused on failed submit.

---

## 8. RBAC visibility

Navigation is built from a declarative map:

```typescript
export const navigation: NavSection[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, permission: null },
  { label: 'School',    icon: School,  permission: 'school:read',  children: [ /* Phase 1+ */ ] },
  { label: 'Therapy',   icon: Activity, permission: 'therapy:read', children: [ /* Phase 3 */ ] },
  // ...
  { label: 'Administration', icon: Settings, roles: ['super_admin'], children: [
      { label: 'Users',           href: '/admin/users' },
      { label: 'Roles',           href: '/admin/roles' },
      { label: 'Organization',    href: '/admin/organization' },
      { label: 'Numbering',       href: '/admin/numbering' },
      { label: 'Audit Logs',      href: '/admin/audit-logs' },
      { label: 'Login Activity',  href: '/admin/login-activity' },
  ]},
];
```

A section with no visible children is not rendered. Every admin route additionally guards at the page level and renders `/unauthorized` content rather than a blank screen if a user reaches it directly.

This phase's key deliverable for RBAC is that **the permission map matching TDD 8.4 is encoded once** in `lib/permissions.ts` and consumed by navigation, `<Can>`, and the tests — so later phases add pages without re-deriving who can see what.

---

## 9. Accessibility and responsive requirements

| Requirement | Verification |
|---|---|
| Skip-to-content link as the first focusable element | Keyboard test |
| Sidebar navigation operable by keyboard with arrow keys within groups | Keyboard test |
| Every dialog traps focus, closes on Escape, restores focus | `jest-axe` + Playwright |
| Form errors announced via `aria-live="polite"` and linked with `aria-describedby` | axe + manual screen reader pass |
| `DataTable` has correct header scope and a caption; sortable headers announce sort state | axe |
| Focus visible on every interactive element at ≥ 3:1 contrast against the adjacent surface | Manual + visual regression |
| Login page fully usable at 360px | Playwright viewport test |
| Admin tables collapse to cards below `md` | Playwright viewport test |
| Idle warning announced, not only visual | Manual screen reader pass |
| Reduced-motion preference honoured | Manual |
| Colour contrast ≥ 4.5:1 for text, ≥ 3:1 for UI | axe + a token-level contrast test asserting every semantic pair |

The token-level contrast test is worth calling out: it asserts contrast ratios for every `foreground`/`background` token pair programmatically, so a designer changing a token cannot silently break AA across the whole app.

---

## 10. Tests owed by this phase

### Infrastructure deliverables

- Jest + RTL configured with `@testing-library/jest-dom`, `@testing-library/user-event`, and `jest-axe`.
- MSW server for Jest, MSW worker for the browser, and a handler generator from `openapi.json`.
- A `renderWithProviders()` helper wrapping QueryClientProvider (with retries disabled), a seeded `authStore`, and the router mock.
- An `asRole(role)` test helper seeding `authStore` with that role's exact permission set from the central map, so component RBAC tests are trivially written and impossible to get wrong.
- Playwright configured for Chromium, Firefox, and WebKit with auth fixtures per role, storage-state reuse, trace on failure, and a test-run id generator.
- Playwright visual regression project with a 0.2% pixel threshold.
- Storybook 8 with the a11y addon and Chromatic-compatible story export.
- Bundle-size CI check.

### Component tests

| Target | Scenarios |
|---|---|
| `DataTable` | Renders rows; loading skeletons; empty state; error state; sort click emits the right params; pagination; row selection; column visibility toggle; mobile card collapse; keyboard navigation; axe clean |
| `StatusBadge` | Each status renders its token and label; an unknown status is a compile error (type-level test) |
| `MoneyInput` | Major-to-minor conversion; paste handling; 2-decimal clamping; negative rejection; no floating-point drift across 100 random values; emits minor units |
| `MoneyDisplay` | Formats with currency symbol; handles zero and negative; right-aligned in table context |
| `FileUpload` | Presign → PUT → confirm happy path; oversize rejected client-side; wrong mime rejected; progress reported; failed PUT retried; keyboard-triggered file dialog; axe clean |
| `DateRangePicker` | Presets produce correct ranges; max-range enforced; timezone-correct boundaries; keyboard navigation |
| `ConfirmDialog` | Confirm and cancel paths; focus trap; Escape closes; typed confirmation gate |
| `EntitySelect` | Debounced search; loading vs no-results distinction; keyboard selection; clears correctly |
| `PermissionGate` | Renders with permission; renders fallback without; renders nothing when no fallback |
| `FormErrorSummary` | Lists errors, links to fields, receives focus on submit failure |
| `AppSidebar` | For each of the nine roles, exactly the permitted sections render — table-driven from the permission map |
| `NotificationBell` | Count renders; dropdown lists recent; mark-read optimistic update and rollback on failure |
| `IdleTimeoutWarning` | Appears at the right time; stay-signed-in resets; timeout clears the session |

### Hook and utility tests

- `useAuth` / `authStore`: session set and clear; permission and role checks; `touch()` updates activity.
- API client: envelope unwrapping; 401 triggers exactly one refresh for eight concurrent failures (the single-flight test); second 401 logs out; each error code maps to its message; `X-Request-Id` attached.
- `lib/money`: format and parse round-trip across 1,000 random values with no drift; zero, negative, and large values.
- `lib/datetime`: UTC→org timezone conversion; DST boundary; date-only values never shift; range formatting.
- `lib/permissions`: the encoded map matches a transcription of TDD 8.4 exactly — this test is the client-side twin of the backend's RBAC matrix test.

### Page tests

- Login: successful submit stores the session and redirects to `next`; invalid credentials show the mapped message; lockout shows the retry time; validation errors before submit.
- Forced password change: a flagged session is redirected from any route; changing the password clears the flag and lands on the dashboard.
- User list: filters, pagination, and the create path.
- Role permission editor: toggling produces the right payload; the diff summary lists exactly the changes.
- Audit log viewer: filters apply; the entity trail renders as a timeline.

### E2E scenarios (Playwright)

| ID | Scenario |
|---|---|
| `AUTH-E2E-01` | Login → dashboard → logout → protected route redirects to login |
| `AUTH-E2E-02` | Wrong password five times → lockout message with retry time |
| `AUTH-E2E-03` | Forgot password → reset with the emailed token → login with the new password |
| `AUTH-E2E-04` | Forced password change on first login blocks navigation until completed |
| `AUTH-E2E-05` | Session idle warning appears and "stay signed in" keeps the session |
| `AUTH-E2E-06` | Access token expiry mid-session refreshes silently with no visible interruption |
| `ADMIN-E2E-01` | Create a user with two roles → the new user logs in and sees the union of both roles' navigation |
| `ADMIN-E2E-02` | Deactivate a user → their next action returns them to login |
| `ADMIN-E2E-03` | Edit role permissions → an affected user's navigation changes after re-login |
| `ADMIN-E2E-04` | Organisation settings change (timezone) → dates across the app render in the new zone |
| `ADMIN-E2E-05` | Audit log shows the create, update, and deactivate actions with before/after values |
| `RBAC-E2E-01` | Table-driven: for each of the nine roles, assert the exact visible navigation set and that a direct URL to a forbidden admin route renders the unauthorized page |
| `A11Y-E2E-01` | Keyboard-only path: login → navigate to users → open create dialog → complete the form → submit, with no mouse |

### Accessibility tests

- `jest-axe` on every component listed in section 4, zero violations.
- Full-page axe scan via Playwright on: login, forgot password, dashboard placeholder, user list, user detail, role permissions, organisation settings, audit logs.
- Token contrast test over every semantic colour pair.

### Visual regression

Baselines for: login page, app shell with sidebar expanded and collapsed, user list (populated, empty, loading, error), role permission matrix, organisation settings, `DataTable` in all states, every `StatusBadge` variant, all form controls in default/focus/error/disabled states, and both mobile and desktop viewports of the shell.

---

## 11. Exit criteria

Global Definition of Done, plus:

- [ ] `npm run dev:msw` produces a fully navigable application with no backend running.
- [ ] The permission map test matches TDD 8.4 exactly, and the `RBAC-E2E-01` navigation matrix passes for all nine roles.
- [ ] The single-flight refresh test proves eight concurrent 401s produce exactly one refresh call.
- [ ] `MoneyInput` round-trips 1,000 random values with zero drift.
- [ ] The token contrast test passes for every semantic pair.
- [ ] Every shared component has a Storybook story with default, loading, empty, error, and disabled states where applicable.
- [ ] Bundle budget check is active and the shell route group is under 200 KB gzipped.
- [ ] All Phase 0 E2E scenarios pass on Chromium, Firefox, and WebKit.
- [ ] Visual baselines committed and the CI comparison job green.
- [ ] Zero axe violations on all eight scanned pages.
- [ ] A deliberate accessibility regression (removing a form label) fails CI — verified once, then reverted.
