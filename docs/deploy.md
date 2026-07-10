# Production deployment guide — example.com

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
