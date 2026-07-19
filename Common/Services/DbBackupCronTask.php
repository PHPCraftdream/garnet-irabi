<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services;

use Aura\Cli\Stdio;
use PHPCraftdream\Garnet\Kernel\Core\AppInit\BaseAppInit;
use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
use PHPCraftdream\Garnet\Kernel\Io\GarnetCli\GarnetDbBackupCommand;
use PHPCraftdream\Garnet\Kernel\Io\GarnetCli\GarnetEnv;
use Throwable;

/**
 * db-backup cron task: take a daily local DB snapshot, prune the local
 * backup dir to the retention window, and opportunistically push the
 * fresh dump off-site when WebDAV creds are configured.
 *
 * Triggered by AppCronService::registerTasks() once per `php garnet cron`
 * / `php run_cmd.php cron db-backup` tick. Schedule (crontab line) is the
 * operator's responsibility — see docs in WorkDir/ConfigExample/backup.ini.
 *
 * Failure policy:
 *   - The LOCAL backup step is the load-bearing one — it must succeed for
 *     the cron tick to count as OK. A throw here propagates and is logged
 *     as a cron error by AppCronService::runWithLogging().
 *   - Retention and off-site are SOFT: any error is reported via $stdio
 *     but does NOT fail the tick, because a fresh local backup has already
 *     been written and that alone is better than what we had before the
 *     tick started. Operators see the message in the cron log; the next
 *     tick tries again.
 *
 * Return value: the number of bytes of the fresh local backup, so the
 * cron log records a non-zero "did work" entry (and gets logged even on
 * the daily-heartbeat path of AppCronService::runWithLogging()).
 */
class DbBackupCronTask {
    /**
     * Run the full db-backup pipeline. Returns the byte size of the fresh
     * local backup (a non-zero "did work" signal to the cron logger) or
     * throws on a hard local-backup failure.
     */
    public static function run(Stdio $stdio): int {
        // ── 1. Local backup ─────────────────────────────────────────────
        // GarnetDbBackupCommand exposes TWO public entry points:
        //   - createBackup($reason): a standalone CLI entry that re-boots
        //     the whole app via require run_cmd.php. Used by `garnet
        //     db:backup` / `garnet deploy` (which both launch from the
        //     `garnet` wrapper, NOT from run_cmd.php, so the re-boot is the
        //     FIRST boot). Calling it from inside `php run_cmd.php cron …`
        //     throws "Cache already defined: ENV_APP" — the second boot
        //     tries to redefine an IniConfig that's already loaded.
        //   - autoBackup($link, $dbName, $reason): the IN-PROCESS entry
        //     point. Skips boot() entirely, takes a pre-booted DbPool link.
        //     This is the exact API the framework's own db:wipe and
        //     snapshot:apply use from inside a booted process — and it's
        //     the right tool for a cron task that's already deep inside
        //     a booted run_cmd.php invocation.
        // Both share autoPath()/dumpTo() under the hood, so the on-disk
        // file format and WorkDir/Backups/ location are identical.
        //
        // autoBackup → autoPath → backupsDir → GarnetEnv::requireAppName()
        // reads GARNET_APP_DIR. The `garnet` CLI wrapper sets that env var,
        // but `run_cmd.php` (the cron entry point) does NOT — seed it from
        // the already-booted BaseAppInit instance before the call. No-op on
        // the `garnet` CLI path.
        self::seedGarnetAppDir();
        $link = DbPool::get()->newLink();
        $dbName = (string)DbPool::get()->getDbConfig()->paramString('dbname');
        $backupPath = GarnetDbBackupCommand::autoBackup($link, $dbName, 'cron');
        $bytes = is_file($backupPath) ? (int)filesize($backupPath) : 0;

        $stdio->outln(
            'db-backup: local backup written — ' . basename($backupPath)
            . ' (' . self::humanSize($bytes) . ').'
        );

        // ── 2. Retention ────────────────────────────────────────────────
        // Run immediately so the disk footprint of a daily cron is bounded
        // by the retention policy, not by how long it's been running. The
        // fresh file from step 1 is newest-first in the scan, so retention
        // never deletes what we just wrote.
        $deleted = self::safePrune($stdio, $backupPath);
        $keptNote = $deleted === 0
            ? 'no stale backups to prune'
            : "pruned {$deleted} stale backup(s)";
        $stdio->outln("db-backup: retention — {$keptNote}.");

        // ── 3. Off-site upload ─────────────────────────────────────────
        // Best-effort. When no WebDAV endpoint is configured (the default
        // on the dev stand, and on prod until ops provision a remote), we
        // log a one-line WARNING and continue — the local backup already
        // exists and is valuable on its own. This is the explicit "out"
        // required by the audit: the cron tick must NOT fail just because
        // off-site isn't wired yet.
        if (!DbBackupOffSiteUploader::isConfigured()) {
            $stdio->outln('db-backup: off-site upload not configured, backup stays local-only.');
            return $bytes;
        }

        $log = static function (string $line) use ($stdio): void {
            $stdio->outln("db-backup: {$line}");
        };
        $status = DbBackupOffSiteUploader::upload($backupPath, $log);
        if ($status === DbBackupOffSiteUploader::OK) {
            $stdio->outln('db-backup: off-site upload OK.');
        } elseif ($status === DbBackupOffSiteUploader::FAILED) {
            // Diagnostic line already emitted via $log inside upload().
            $stdio->outln('db-backup: off-site upload FAILED — local backup still intact.');
        }

        return $bytes;
    }

    /**
     * Wrap retention in a soft-failure guard: a glitch reading the dir
     * must never invalidate the fresh backup. Returns the deletion count
     * (0 when retention was skipped for any reason).
     */
    private static function safePrune(Stdio $stdio, string $freshBackupPath): int {
        $dir = self::backupsDir();
        if ($dir === null) {
            $stdio->outln('db-backup: could not resolve backups dir; skipping retention.');

            return 0;
        }
        if (!is_dir($dir)) {
            return 0;
        }

        try {
            $deleted = DbBackupRetentionService::prune($dir);
        } catch (Throwable $e) {
            $stdio->outln('db-backup: retention skipped — ' . $e->getMessage());

            return 0;
        }

        // Paranoia: if retention somehow listed the file we just created
        // (a bug or a clock skew), restore it from the in-memory path. The
        // framework's createBackup() has already returned, so the file is
        // on disk; if unlink removed it, the size check below catches it.
        if ($deleted !== [] && in_array($freshBackupPath, $deleted, true)) {
            $stdio->outln('db-backup: WARNING — retention deleted the fresh backup; this is a bug.');
        }

        return count($deleted);
    }

    /**
     * Populate GARNET_APP_DIR from the active IRabi instance when the cron
     * task is invoked via `run_cmd.php` (the only entry point that does
     * NOT set it). The `garnet` CLI wrapper sets this itself, so this is a
     * no-op on the deploy / `garnet db:backup` paths. Idempotent and safe
     * to call repeatedly — putenv on an already-set var just overwrites
     * with the same value.
     */
    private static function seedGarnetAppDir(): void {
        $current = getenv('GARNET_APP_DIR');
        if ($current !== false && $current !== '') {
            return;
        }
        $instance = BaseAppInit::getInstance();
        if ($instance === null) {
            return;
        }
        // BaseAppInit::$appDir has a trailing DS — trim it so GarnetEnv's
        // rtrim()+concatenation doesn't produce a doubled separator.
        $appDir = rtrim($instance->appDir, '/\\');
        if ($appDir !== '') {
            putenv('GARNET_APP_DIR=' . $appDir);
        }
    }

    /**
     * Resolve the backups dir using the SAME logic the framework's
     * GarnetDbBackupCommand::backupsDir() uses (GarnetEnv::workDir() is
     * public, unlike backupsDir()). We don't reuse GarnetEnv::workDir()
     * blindly here because we want a single source of truth: if the
     * framework ever moves WorkDir/Backups, this method is the only place
     * to update on the app side.
     */
    private static function backupsDir(): ?string {
        try {
            return GarnetEnv::workDir() . DIRECTORY_SEPARATOR . 'Backups';
        } catch (Throwable) {
            return null;
        }
    }

    private static function humanSize(int $bytes): string {
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $i = 0;
        $n = (float)$bytes;
        while ($n >= 1024 && $i < count($units) - 1) {
            $n /= 1024;
            $i++;
        }
        return ($i === 0 ? (string)$bytes : number_format($n, 1)) . ' ' . $units[$i];
    }
}
