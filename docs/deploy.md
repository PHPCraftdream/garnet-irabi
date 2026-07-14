# Production deployment guide

## Configuration — `ssh.ini` and `deploy.ini`

All deploy/SSH tooling (`ssh`, `ssh:put`, `ssh:get`, `ssh:test`,
`deploy:diff`, `deploy`, `bundle`) reads two files:
`WorkDir/Config[Dev]/ssh.ini` and `WorkDir/Config[Dev]/deploy.ini`.
Seed them from `WorkDir/ConfigExample/{ssh,deploy}.ini` (`php garnet
config:init`) and fill in real values — both files stay out of git via
`.gitignore` (only `ConfigExample/` is tracked).

### `ssh.ini` — connection

| Key | Meaning |
|---|---|
| `host` / `port` / `user` | Remote host |
| `identity_file` | Path to a private key (relative to the ini file's own directory) — **preferred** |
| `identity_key` | Key contents pasted inline — only if `identity_file` isn't practical (e.g. CI secret injection). If both are set, `identity_key` wins with a warning. |
| `strict_host_key_checking` | `yes` / `no` / `accept-new` — use `accept-new` for a first connect, then leave it (don't silently downgrade to `no` in a script) |

Verify before doing anything else: `php garnet ssh:test` — read-only,
safe to run anytime.

### `deploy.ini` — remote layout

```ini
remote_path   = "/var/www/<hosting-account>/data/www"
public_dir    = "example.com"          ; docroot — what the webserver serves
public_name   = "irabi"                ; asset/upload URL segment (rebrand target)
framework_dir = "garnet-framework"      ; where the framework package lands
app_dir       = "garnet-app-irabi"      ; app code (no WorkDir)
runtime_dir   = "garnet-runtime-irabi"  ; WorkDir + garnet CLI + .env + _shared_index.php
```

These four directories sit **side by side** under `remote_path` — this
is the "framework and app deploy in parallel, into separate folders"
layout mentioned in `AGENTS.md`. Every field is overridable per
invocation via the matching CLI flag (`--public-dir=`, `--framework-dir=`,
`--app-dir=`, `--runtime-dir=`, `--public-name=`).

## Recommended workflow

**First deploy to a fresh host:**
```bash
php garnet ssh:test                      # verify SSH connectivity first
php garnet bundle --no-phar --keep-dir   # build dist/IRabi/{public,framework,app,runtime}
php garnet ssh:put dist/IRabi/<public_dir>    "<public_dir>"    --cd-remote
php garnet ssh:put dist/IRabi/<framework_dir> "<framework_dir>" --cd-remote
php garnet ssh:put dist/IRabi/<app_dir>       "<app_dir>"       --cd-remote
php garnet ssh:put dist/IRabi/<runtime_dir>   "<runtime_dir>"   --cd-remote
```

**Routine code-only deploys** (fast — only the diff since the last
deploy, not a full re-upload):
```bash
php garnet deploy:diff --since=<git-ref>          # dry-run by default — review the plan first
php garnet deploy:diff --since=<git-ref> --apply   # then actually ship it
```
`deploy:diff` maps `Framework/…` → framework_dir, `Public/…` → public_dir
(with asset-path rebranding), everything else app-relative → app_dir, and
auto-rebuilds the frontend when source files changed. Always read the
dry-run output before `--apply` — it's cheap insurance.

**Full deploy with migrations** (maintenance-wrapped, safe by design):
```bash
php garnet deploy
```
Order: maintenance ON → DB backup → migrations → cache clear →
maintenance OFF. If the backup or migration step fails, maintenance is
**deliberately left ON** so a half-migrated site never goes live — fix
forward or restore the backup, then re-run. Avoid `--skip-backup`
except when you've already taken one manually; `--skip-migrate` is fine
for a code-only release with no pending schema change.

## Historical migration record: 3-folder → 4-folder layout

Assumes the server already has a 3-folder layout
(`example.com/`, `garnet-framework-*/`, `garnet-app-example/`)
with WorkDir inside the app folder. Steps migrate it to the 4-folder
layout (`garnet-runtime-example/` holds WorkDir, garnet CLI, .env,
`_shared_index.php`).

## Pre-flight

```bash
# Verify current layout on the server
php garnet ssh "ls -la /var/www/<hosting-account>/data/www"
```

## Migration steps

1. **Create the runtime folder next to the existing siblings**
   ```bash
   php garnet ssh "mkdir -p garnet-runtime-example" --cd-remote
   ```

2. **Move WorkDir into it**
   ```bash
   php garnet ssh "mv garnet-app-example/WorkDir garnet-runtime-example/" --cd-remote
   ```

3. **Move garnet CLI, _shared_index.php, and .env**
   ```bash
   php garnet ssh "mv garnet-app-example/garnet garnet-app-example/_shared_index.php garnet-app-example/.env garnet-runtime-example/" --cd-remote
   ```

4. **Rewrite `.env` inside the runtime folder** — paths are now relative
   to the runtime folder, not the app folder:
   ```
   APP_NAME=IRabi
   BUNDLE_PUBLIC_DIR=../example.com
   BUNDLE_FRAMEWORK_DIR=../garnet-framework-YYYY-MM-DD
   BUNDLE_APP_DIR=../garnet-app-example
   BUNDLE_WORKDIR_DIR=./WorkDir
   BUNDLE_RUNTIME_DIR=garnet-runtime-example
   ```
   Upload via:
   ```bash
   php garnet ssh:put WorkDir/Config/runtime.env "garnet-runtime-example/.env"
   ```

5. **Rewrite `example.com/index.php`** to point at the runtime folder:
   ```php
   <?php
   require __DIR__ . '/../garnet-runtime-example/_shared_index.php';
   ```

6. **Replace `_shared_index.php`** in the runtime folder with the new
   template (produced by `php garnet bundle --no-phar --keep-dir`):
   ```bash
   php garnet ssh:put dist/IRabi/garnet-runtime-example/_shared_index.php "garnet-runtime-example/_shared_index.php"
   ```

7. **Smoke-test**
   ```bash
   curl -I https://example.com/
   # Expect: HTTP 200
   php garnet ssh "tail -20 garnet-runtime-example/WorkDir/LogJournal/Errors/$(date +%Y-%m-%d).log 2>/dev/null || echo ok" --cd-remote
   ```

8. **Cron** — if any cron command contains a path to the old `garnet`
   binary (`garnet-app-example/garnet`), update it to
   `garnet-runtime-example/garnet`.

## Future deploys (after migration)

```bash
# Build a fresh bundle (reads public_dir / app_dir / etc. from ssh.ini)
php garnet bundle --no-phar --keep-dir

# Upload only the app dir (typical code-only deploy)
php garnet ssh:put dist/IRabi/garnet-app-example "garnet-app-example" --cd-remote

# Or upload framework dir if kernel changed
php garnet ssh:put dist/IRabi/garnet-framework-* "garnet-framework-NEW" --cd-remote
```
