# Agent onboarding — IRabi

You're an AI agent (or a new developer) starting work on **IRabi** — a
teacher/expert time-booking platform built on **Garnet Framework**.
This file is your map for *this application*: architecture, dev
conventions, and tooling. For business logic, roles, and the data
model, read [`docs/README.md`](docs/README.md) first.

## Where the framework lives

IRabi installs `phpcraftdream/garnet-framework` as a normal Composer
dependency (not a monorepo checkout):

```
vendor/phpcraftdream/garnet-framework/
```

The framework's own `Kernel/` and `Bundle/` source is present there and
safe to read/grep directly — that's the fastest way to answer "how does
X actually work" questions (routing, DB, auth, CLI commands, …). What is
**not** shipped in the installed copy: the framework's own `AGENTS.md`,
`docs/`, and dev-tooling scripts (they're excluded from the Packagist
dist archive on purpose — not needed at runtime). For framework
architecture docs, use the source repo directly:
<https://github.com/PHPCraftdream/garnet-framework> (see its own
`AGENTS.md` and `docs/`), or just read the vendor'd `Kernel`/`Bundle`
source in this repo — it's the same code.

Check the installed version: `composer show phpcraftdream/garnet-framework`.

## What is IRabi

A teacher/expert time-booking platform — users browse expert profiles,
book time slots, pay, exchange messages, and leave comments. Admins
manage everything through a dashboard. Full business-logic description,
roles, and data model: [`docs/README.md`](docs/README.md).

## Framework architecture (Garnet)

Garnet is an opinionated PHP 8 web framework. Two top-level trees:

| Tree | Purpose |
|---|---|
| `Kernel/` | Engine — router, async DB pool, IniConfig, Twig, CLI, cache, logger |
| `Bundle/` | Reusable opt-in modules — Auth, Balance, Comments, Cron, Dashboard, Files, IM, Support, Users, … |

Apps pull the framework via Composer and compose bundles. Source of
truth is **code, not config** — routes are PHP arrays, entity schemas
are PHP classes, validation rules auto-convert to Zod for React forms.

Full framework architecture: the source repo's own `AGENTS.md` and
`docs/` (`architecture.md`, `database.md`, …) at
<https://github.com/PHPCraftdream/garnet-framework> — not shipped in
the installed vendor copy, but the `Kernel`/`Bundle` source itself is
identical and readable locally (see above).

## Routing

Routes are registered in `IRabi.php` via `$router->add()`:

```php
$router->add(BookingsController::URL, BookingsController::class, $common);
$router->add(BookingsController::URL . '/{id}', BookingsController::class, $common);
```

Each controller defines `public const URL = '/bookings';` and extends
`FrameworkController`. The third argument is a middleware array (auth
guards, maintenance mode, etc. — see `$common` at the top of `IRabi.php`).

| Area | Pattern | Example controllers |
|---|---|---|
| Foreground (public) | `/bookings`, `/expert/{id}`, `/users` | `BookingsController`, `ExpertController`, `UsersController` |
| Dashboard (admin) | `/admin/…` | `DashboardUsersController`, `DashboardFinanceController` |
| System | `/dev-login`, static pages | `DevLoginController`, `StaticPagesController` |

To add a route: create a controller in `Foreground/Controllers/` or
`Dashboard/Controllers/`, set `const URL`, then add the `$router->add()`
call in `IRabi.php`.

## React islands

The frontend uses a **React-island** pattern — each interactive UI
chunk is a self-contained, lazy-loaded (code-split) React component
hydrated into a DOM element by CSS class name.

### Registration

Islands are registered in entry-point files under `Front/EntryPoints/`
via `createIsland()`:

```ts
import {createIsland} from '@common/Islands/createIsland';

createIsland({
  className: 'bookings-list-init',
  lazy: () => import('../Islands/Bookings/BookingsList'),
  exportName: 'BookingsListIsland',
});
```

On the PHP side, the controller renders the mount point:

```php
$content = RenderIsland::render('bookings-list', ['bookings' => $data]);
```

### App-level islands (`Front/Islands/`)

```
Front/Islands/
├── AdminPanel/  Bookings/       Comments/
├── Dashboard/   ExpertDashboard/  ExpertSlots/
├── Im/          InviteError/    SlotsCalendar/
├── Support/     Users/
```

Framework-level islands (navigation, timezone banner, …) live in
`vendor/…/Bundle/Front/Islands/`.

### Adding a new island

1. Create `Front/Islands/<Name>/<Name>Island.tsx` — export a named component.
2. Register it in `Front/EntryPoints/Foreground.ts` (or `Dashboard.ts`) via `createIsland()`.
3. In the PHP controller, call `RenderIsland::render('<name>', $props)`.
4. Run `php garnet build` (or `build:watch`).

## FrontBuilder / asset pipeline

Build runs via rspack from the framework's `FrontBuilder/` directory —
see `php garnet build`/`build:watch` above. Internally
`GarnetBuildCommand` sets `COMMON_GARNET_WEB_DIR` and calls `npx rspack
build --config rspack.config.ts` inside `vendor/…/FrontBuilder/`.

### Codegen — `*Gen.php` classes

The rspack plugin `PhpClassGeneratorPlugin.ts` runs at build time and
generates PHP classes (e.g. `ForegroundJsGen`, `ForegroundCssGen`) with
static methods returning content-hashed asset URLs, consumed by Twig
layouts to emit `<script>`/`<link>` tags. **Never edit `*.gen.php`
files** — they're overwritten on every build.

## Running things — `garnet` is the entry point

Everything goes through the local `garnet` CLI wrapper at the app root:

```bash
php garnet help          # list all commands
php garnet setup         # composer + npm (app, Tests, framework FrontBuilder/MCP) + junctions
php garnet build         # production rspack build
php garnet build:watch   # dev build with watch
php garnet serve         # Node proxy :8001 -> pool of php -S workers
php garnet migration     # DB migrations
php garnet admin         # generate an admin-panel access token
php garnet config:init   # seed WorkDir/Config/*.ini from WorkDir/ConfigExample/
```

`php garnet setup` is idempotent — safe to re-run after a
`composer update`/`npm install` drift. It also installs the npm deps
for the two MCP servers below (see "MCP servers").

Quality gates (mirrors CI): `composer ci` runs `cs:check` → `build` →
`phpstan` → `build:check`. E2E: `composer test:e2e` (or `cd Tests && npm test`,
Playwright — see [`Tests/TESTING.md`](Tests/TESTING.md)).

## Dev mode / dev-only UI

Framework dev-only features (e.g. the `AuthDev` quick-login panel with
a "reset db" button, verbose error pages) only activate when
`Env::isDevDir()` finds an IDE marker directory — `.idea`, `.vscode`,
`.vs`, `.xcodeproj`, or `.atom` — at or above the app root. This repo
already has `.vscode/` checked in for that reason. If dev-only UI isn't
showing up, that marker is the first thing to check — not a framework
bug by default.

## MCP servers (already wired in `.mcp.json`)

`.mcp.json` at the repo root already configures two MCP servers backed
by the installed framework package:

- `garnet-browser` — Playwright-backed browser control/debugging
  (`vendor/phpcraftdream/garnet-framework/tooling/mcp/browser/`).
- `garnet-mysql-mcp` — direct MySQL introspection/queries against this
  app's configured DB (`tooling/mcp/mysql/`).

Both need `php garnet setup` to have run at least once (installs their
`node_modules` — a separate `npm install` from FrontBuilder's). They
only actually connect if your agent session's project root is this
directory (`D:\dev\garnet\Apps\IRabi`), not a parent folder.

## SSH / deploy

Deploy tooling talks to the remote host via SSH, configured in
`WorkDir/Config[Dev]/ssh.ini` (see
[`WorkDir/ConfigExample/ssh.ini`](WorkDir/ConfigExample/ssh.ini) for the
full key reference — host/port/user, one of `identity_file` or
`identity_key`, `strict_host_key_checking`). Deployment layout
parameters (remote paths) live in a separate `deploy.ini`, not `ssh.ini`.

Key commands:

```bash
php garnet ssh "<remote command>"        # run a shell command remotely
php garnet ssh:put <local> <remote>      # upload a file
php garnet ssh:get <remote> <local>      # download a file
php garnet ssh:test                      # verify connectivity
php garnet deploy:diff --since=<ref>     # ship changed files since a git ref
php garnet deploy:diff --full-public     # re-ship all Public/ assets + rebuild
php garnet deploy                        # full deploy: maintenance -> migrate -> cache -> off
php garnet bundle                        # build a production deploy bundle
```

Full walkthrough (3-folder → 4-folder runtime layout migration, `.env`
rewriting, etc.): [`docs/deploy.md`](docs/deploy.md).

`deploy:diff` works correctly against this app's vendor-install layout
as of `garnet-framework` v0.1.0-alpha8 — earlier versions assumed a
monorepo (`Framework/...`, `Apps/IRabi/...` path prefixes) and broke on
`--file=` mode for installed apps. If deploy:diff misbehaves, check the
installed framework version first.

## Database access — DbTable / QueryEx

Every table has a class extending `DbTable`:

```php
class Bookings extends DbTable {
    protected string $tableName = 'bookings';
    protected string $primaryKey = 'id';

    public static function init(): ITableBuilderDriver {
        return DbTableBuilderFactory::newCreateTable(table: static::get())
            ->addIdColumn()
            ->addColumn(column: 'user_id', type: 'INT', length: '11')
            ->addColumn(column: 'status', type: 'ENUM', length: "'pending','confirmed','cancelled','completed'");
    }
}
```

Key `DbTable` methods (each has a sync and an `*Async` variant going
through `DbPool`, finalized with `pollFinishAll()`):
`selectAll()`, `selectOneByField($field, $value)`, `getCount()`,
`existsById($id)`, `insertAsync($data, …)`, plus `newSelect()`/
`newInsert()`/`newUpdate()`/`newDelete()` query builders. Use
`QueryEx::get()` for raw SQL when the builder doesn't fit.

App tables live in `Common/Tables/` (`Bookings`, `TimeSlots`,
`ExpertProfiles`, `Payments`, `AccountBalance`, `BalanceLedger`, …).
Framework tables (accounts, sessions, settings, migration tracker) are
in `vendor/…/Kernel/Db/Entity/`. All table names are auto-prefixed
(`db_ir_` for this app, from `db.ini` → `prefix`).

## Migrations

Plan class: `Migrations/AppMigration.php` — a numbered
`$migrationClasses` map (`Migrations/Items/M_0001.php` … `M_0009.php`,
current version 9). Each step implements `IMigrationItem::update()`:

```php
class M_0009 implements IMigrationItem {
    public static function update(Stdio $stdio): void {
        // ALTER TABLE ... (idempotent — check SHOW COLUMNS / IF NOT EXISTS first)
    }
}
```

To add one: create `Migrations/Items/M_00XX.php`, add it to
`$migrationClasses`, bump `$currentVersion`, run `php garnet migration`.

## Configuration — IniConfig

Runtime config comes from `WorkDir/Config/*.ini` (prod) or
`WorkDir/ConfigDev/*.ini` (dev — see "Dev mode" above); templates live
in `WorkDir/ConfigExample/`, seeded via `php garnet config:init`.

| Factory | File | Typical keys |
|---|---|---|
| `IniConfig::app()` | `app.ini` | `base_url`, `timezone`, `env` |
| `IniConfig::db()` | `db.ini` | `host`, `user`, `password`, `dbname`, `prefix` |
| `IniConfig::email()` | `email.ini` | SMTP settings |
| `IniConfig::ssh()` | `ssh.ini` | remote host, identity |
| `IniConfig::deploy()` | `deploy.ini` | remote paths |

Read a value: `IniConfig::db()->paramString('host')` /
`->paramInt('port', 3306)`.

## Directory map

| Path | What |
|---|---|
| `Foreground/` | Public-facing controllers/routes/Twig (booking, auth, expert/user pages) |
| `Dashboard/` | Admin/owner dashboard-side code |
| `Common/` | Shared business code between Foreground and Dashboard |
| `Front/` | React islands + app-specific frontend (build via `garnet build`) |
| `Migrations/` | DB schema migrations (`AppMigration.php` + seed data) |
| `WorkDir/` | Runtime state — `Config[Dev]/*.ini`, caches, logs, uploads (gitignored except `ConfigExample/`) |
| `Public/` | Web root + built assets (`*.gen.php`/`*.gen.js`/`*.gen.css`) |
| `Tests/` | Playwright e2e specs |
| `docs/` | Business/architecture docs — start at `docs/README.md` |
| `vendor/phpcraftdream/garnet-framework/` | The framework itself (Kernel/Bundle source, readable) |

**Strict separation** (inherited from the framework's own convention):
`vendor/phpcraftdream/garnet-framework/{Kernel,Bundle}` must not know
about IRabi-specific business concepts (roles like `expert`/`user`,
booking, slots). Business logic extends framework classes from inside
this app (`Foreground/`, `Dashboard/`, `Common/`) — look at an existing
controller/middleware for the extension-point convention before adding
a new one.
