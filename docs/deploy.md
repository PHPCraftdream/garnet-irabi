# Production deployment guide — slotbook.ru

Assumes the server already has a 3-folder layout
(`slotbook.ru/`, `garnet-framework-*/`, `garnet-app-slotbook/`)
with WorkDir inside the app folder. Steps migrate it to the 4-folder
layout (`garnet-runtime-slotbook/` holds WorkDir, garnet CLI, .env,
`_shared_index.php`).

## Pre-flight

```bash
# Verify current layout on the server
php garnet ssh "ls -la /var/www/u1780595/data/www"
```

## Migration steps

1. **Create the runtime folder next to the existing siblings**
   ```bash
   php garnet ssh "mkdir -p garnet-runtime-slotbook" --cd-remote
   ```

2. **Move WorkDir into it**
   ```bash
   php garnet ssh "mv garnet-app-slotbook/WorkDir garnet-runtime-slotbook/" --cd-remote
   ```

3. **Move garnet CLI, _shared_index.php, and .env**
   ```bash
   php garnet ssh "mv garnet-app-slotbook/garnet garnet-app-slotbook/_shared_index.php garnet-app-slotbook/.env garnet-runtime-slotbook/" --cd-remote
   ```

4. **Rewrite `.env` inside the runtime folder** — paths are now relative
   to the runtime folder, not the app folder:
   ```
   APP_NAME=IRabi
   BUNDLE_PUBLIC_DIR=../slotbook.ru
   BUNDLE_FRAMEWORK_DIR=../garnet-framework-YYYY-MM-DD
   BUNDLE_APP_DIR=../garnet-app-slotbook
   BUNDLE_WORKDIR_DIR=./WorkDir
   BUNDLE_RUNTIME_DIR=garnet-runtime-slotbook
   ```
   Upload via:
   ```bash
   php garnet ssh:put WorkDir/Config/runtime.env "garnet-runtime-slotbook/.env"
   ```

5. **Rewrite `slotbook.ru/index.php`** to point at the runtime folder:
   ```php
   <?php
   require __DIR__ . '/../garnet-runtime-slotbook/_shared_index.php';
   ```

6. **Replace `_shared_index.php`** in the runtime folder with the new
   template (produced by `php garnet bundle --no-phar --keep-dir`):
   ```bash
   php garnet ssh:put dist/IRabi/garnet-runtime-slotbook/_shared_index.php "garnet-runtime-slotbook/_shared_index.php"
   ```

7. **Smoke-test**
   ```bash
   curl -I https://slotbook.ru/
   # Expect: HTTP 200
   php garnet ssh "tail -20 garnet-runtime-slotbook/WorkDir/LogJournal/Errors/$(date +%Y-%m-%d).log 2>/dev/null || echo ok" --cd-remote
   ```

8. **Cron** — if any cron command contains a path to the old `garnet`
   binary (`garnet-app-slotbook/garnet`), update it to
   `garnet-runtime-slotbook/garnet`.

## Future deploys (after migration)

```bash
# Build a fresh bundle (reads public_dir / app_dir / etc. from ssh.ini)
php garnet bundle --no-phar --keep-dir

# Upload only the app dir (typical code-only deploy)
php garnet ssh:put dist/IRabi/garnet-app-slotbook "garnet-app-slotbook" --cd-remote

# Or upload framework dir if kernel changed
php garnet ssh:put dist/IRabi/garnet-framework-* "garnet-framework-NEW" --cd-remote
```
