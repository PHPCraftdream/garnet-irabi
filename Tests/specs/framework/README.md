# Pure framework tests

This directory holds tests that exercise **Framework core primitives**
(Router, IniConfig, Session, CSRF, dev-login token storage, etc.)
without depending on any application-specific tables or data.

A test belongs here only if it would pass against a fresh framework
installation that has no `ir_*`, `n72_*`, `mi_*`, or other app tables
seeded.

## Sibling: `specs/framework-bundle/`

Tests for **FrameworkBundle modules** (Idempotency, MailLog, AuditLog,
EntityHistory, …) live in `specs/framework-bundle/`. They run against
the live IRabi app because the bundle ships abstract base classes that
each app subclasses with its own table prefix (`ir_*`), but the logic
under test belongs to the bundle.

## Sibling: app-specific tests

App-level flows (booking, slots, moderation, support, etc.) live in
`specs/iRabi/<role-or-area>/`. Authentication flows for an app's own
middleware (e.g. IrabiAuthMiddleware's dev `.test` auto-login) live in
`specs/iRabi/auth/`.

## When to add a test here

- The test only hits framework-level paths (e.g. CSRF flow,
  RouterUriParams, IniConfig, dev-login token storage).
- All DB queries (if any) target framework-only tables: `accounts`,
  `accounts_data`, `session`, `session_data`. Not `ir_*` / app-specific.
- HTTP requests use a generic dev/example route, not a controller bound
  to a particular app's middleware chain.

## When NOT to add a test here

- The test reads or writes `ir_idempotency_keys`, `ir_mail_log`,
  `ir_news_events`, etc. → put it in `specs/framework-bundle/` (if it
  tests a FrameworkBundle module) or `specs/iRabi/<area>/` (if it tests
  app-level wiring).
- The test depends on dev-seed users (`testuser_setup_*@irabi.test`).
- The test asserts UI text or DOM that is rendered by an app-specific
  controller.
