<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services;

use PHPCraftdream\Garnet\Kernel\Io\GarnetCli\GarnetEnv;

/**
 * Best-effort off-site upload of a fresh DB backup, via WebDAV PUT.
 *
 * WHY WEBDAV: the audit (12-production-readiness-devops.md C-1) flags that
 * WorkDir/Backups/ lives on the SAME server as the DB it backs up — a
 * single-host failure loses both. WebDAV is the cheapest meaningful fix:
 * Nextcloud / ownCloud / Box / any rclone serve webdav endpoint speaks it,
 * a single HTTP PUT with Basic auth ships the file, and there is NO new
 * composer dependency (we shell out to the universally-installed `curl`
 * binary). S3 / rsync would each pull in either an SDK or assumptions
 * about remote-shell access that may not hold on a hardened box.
 *
 * Configuration: read from `WorkDir/Config/backup.ini` (parse_ini_file —
 * NOT registered with IniConfig, so the cron path doesn't need a boot
 * change). When the file is absent OR the [webdav] url is empty, the
 * uploader returns self::NOT_CONFIGURED and the caller logs a one-line
 * warning without failing the cron tick. This is the default on the dev
 * stand and on any prod box where ops haven't provisioned a remote yet —
 * the LOCAL backup created moments earlier is already valuable.
 *
 * Security: the backup file contains real user data — we MUST use HTTPS
 * for transport. isConfigured() rejects http:// URLs even with creds
 * present, because silently shipping a DB dump over plaintext is worse
 * than not shipping it at all. Credentials live in backup.ini (gitignored,
 * same protection as db.ini) and are passed to curl via the --user flag,
 * NOT via the URL, so they don't show up in server-side request logs.
 *
 * Failure isolation: any upload error is reported back to the caller
 * (via the $log callable and the returned status) but does NOT throw —
 * the cron task treats off-site as opportunistic, never as a reason to
 * fail a tick that already produced a usable local backup.
 */
class DbBackupOffSiteUploader {
    /** Nothing to do — no remote configured. Not an error. */
    public const NOT_CONFIGURED = 0;

    /** Upload attempted and the server reported success (2xx). */
    public const OK = 1;

    /** Upload attempted but failed — $log received the diagnostic. */
    public const FAILED = 2;

    /** Per-attempt hard timeout (seconds). A hung upload must not stall cron. */
    public const UPLOAD_TIMEOUT_SEC = 600;

    /**
     * Upload $backupPath to the configured WebDAV endpoint, if any.
     *
     * @param string        $backupPath Absolute path to a local .sql.gz.
     * @param callable      $log        `function(string $line): void` — every
     *                                   diagnostic line is forwarded. The cron
     *                                   task bridges this to $stdio->outln().
     *
     * @return int One of self::NOT_CONFIGURED / self::OK / self::FAILED.
     */
    public static function upload(string $backupPath, callable $log): int {
        $cfg = self::loadConfig();
        if ($cfg === null) {
            return self::NOT_CONFIGURED;
        }

        $basename = basename($backupPath);
        if (!is_file($backupPath)) {
            $log("webdav: source file missing before upload: {$basename}");

            return self::FAILED;
        }

        $url = rtrim($cfg['url'], '/') . '/' . str_replace('+', '%20', urlencode($basename));

        // Resolve the curl executable. PATH-search on POSIX; on Windows we
        // also try `where curl.exe` (Git for Windows ships curl in a known
        // spot, but it isn't always on the default PATH the cron shell sees).
        $curl = self::probeCurlOnPath();
        if ($curl === null) {
            $log('webdav: curl binary not found on PATH; skipping off-site upload');

            return self::FAILED;
        }

        $cmd = [
            $curl,
            '-sS',
            '--max-time', (string)self::UPLOAD_TIMEOUT_SEC,
            '--fail-with-body',
            '--location',
            '--user', "{$cfg['user']}:{$cfg['password']}",
            '-T', $backupPath,
            '-w', "\n__HTTP_STATUS__:%{http_code}",
            $url,
        ];

        $stdout = '';
        $stderr = '';
        $exitCode = self::runProcess($cmd, $stdout, $stderr);

        $status = self::extractHttpStatus($stdout);
        // Drop the trailing __HTTP_STATUS__ sentinel from stdout for logging.
        $logBody = self::stripStatusSentinel($stdout);

        if ($exitCode === 0 && $status !== null && $status >= 200 && $status < 300) {
            // is_file() was checked at the top of upload(), and the curl -T
            // upload can't delete the source, so filesize() is safe here.
            $size = (int)filesize($backupPath);
            $log("webdav: uploaded {$basename} ({$size} bytes, HTTP {$status})");

            return self::OK;
        }

        $detail = $logBody !== '' ? $logBody : trim($stderr);
        if ($detail !== '') {
            $log("webdav: upload failed (exit={$exitCode}, http=" . ($status ?? 'n/a') . "): {$detail}");
        } else {
            $log("webdav: upload failed (exit={$exitCode}, http=" . ($status ?? 'n/a') . ')');
        }

        return self::FAILED;
    }

    /**
     * True when a usable WebDAV config exists. Exposed for callers that
     * want to log the "not configured" path before even attempting an
     * upload (the db-backup cron task does this).
     */
    public static function isConfigured(): bool {
        return self::loadConfig() !== null;
    }

    /**
     * Locate and validate the WebDAV config. Returns null when off-site
     * upload is intentionally disabled (default state).
     *
     * @return null|array{url: string, user: string, password: string}
     */
    private static function loadConfig(): ?array {
        $file = self::configPath();
        if (!is_file($file)) {
            return null;
        }

        /** @var array<string, mixed>|false $parsed */
        $parsed = @parse_ini_file($file, true, INI_SCANNER_TYPED);
        if ($parsed === false || !isset($parsed['webdav']) || !is_array($parsed['webdav'])) {
            return null;
        }

        $section = $parsed['webdav'];
        $url = isset($section['url']) ? (string)$section['url'] : '';
        $url = trim($url);

        if ($url === '') {
            return null;
        }

        // Enforce HTTPS. Plain HTTP would broadcast the entire DB dump (and
        // the Basic-auth credentials) over the wire — refuse rather than ship
        // insecurely. Let ops fix the URL.
        if (!str_starts_with(strtolower($url), 'https://')) {
            return null;
        }

        $user = isset($section['user']) ? (string)$section['user'] : '';
        $password = isset($section['password']) ? (string)$section['password'] : '';

        return ['url' => $url, 'user' => $user, 'password' => $password];
    }

    private static function configPath(): string {
        // GarnetEnv::workDir() is the framework's canonical WorkDir resolver
        // (honours GARNET_WORKDIR_DIR / app-dir / deploy-bundle layout) —
        // reusing it guarantees we read the same Config/ tree the live app
        // reads, even on a deploy box where WorkDir was relocated.
        return GarnetEnv::workDir() . DIRECTORY_SEPARATOR . 'Config' . DIRECTORY_SEPARATOR . 'backup.ini';
    }

    /**
     * Resolve the `curl` executable. `command -v` on POSIX, `where` on
     * Windows — both report the resolved absolute path on stdout. Returns
     * null when curl is not installed, in which case the caller logs and
     * skips the off-site leg.
     */
    private static function probeCurlOnPath(): ?string {
        $candidates = ['curl', 'curl.exe'];
        foreach ($candidates as $c) {
            // `command -v` on POSIX, `where` on Windows. Both report the
            // resolved path on stdout (first line, in Windows' case).
            if (PHP_OS_FAMILY === 'Windows') {
                $cmd = ['where', $c];
            } else {
                $cmd = ['sh', '-c', 'command -v ' . escapeshellarg($c)];
            }
            $stdout = '';
            $stderr = '';
            $exit = self::runProcess($cmd, $stdout, $stderr);
            if ($exit !== 0) {
                continue;
            }
            $firstLine = trim((string)strstr($stdout, "\n", true) ?: $stdout);
            if ($firstLine !== '' && is_executable($firstLine)) {
                return $firstLine;
            }
            // Windows `where` may resolve a bare name from PATHEXT — accept
            // the first hit even without is_executable() (Windows reports
            // .exe paths that pass PHP's is_executable() inconsistently).
            if (PHP_OS_FAMILY === 'Windows' && $firstLine !== '') {
                return $firstLine;
            }
        }
        return null;
    }

    /**
     * Run a command without shell interpolation. argv is passed straight
     * to proc_open, so values like the Basic-auth "user:pass" string never
     * need shell escaping. Captures stdout + stderr separately so the
     * caller can parse the HTTP status line from stdout without noise.
     *
     * @param list<string> $argv
     * @param string       $stdout  Appended with the process's stdout.
     * @param string       $stderr  Appended with the process's stderr.
     *
     * @return int Exit code; -1 on internal failure (e.g. proc_open refused).
     */
    private static function runProcess(array $argv, string &$stdout, string &$stderr = ''): int {
        $stdout = '';
        $stderr = '';
        $descriptors = [
            0 => ['file', '/dev/null', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];
        // On Windows, PHP's proc_open with an array bypasses cmd.exe and
        // avoids the notorious quoting pitfalls of the array→string path.
        $proc = @proc_open($argv, $descriptors, $pipes);
        if (!is_resource($proc)) {
            return -1;
        }
        $stdout = (string)stream_get_contents($pipes[1]);
        $stderr = (string)stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        return (int)proc_close($proc);
    }

    private static function extractHttpStatus(string $stdout): ?int {
        if (preg_match('/__HTTP_STATUS__:(\d{3})/', $stdout, $m)) {
            return (int)$m[1];
        }
        return null;
    }

    private static function stripStatusSentinel(string $stdout): string {
        return trim((string)preg_replace('/\n?__HTTP_STATUS__:\d{3}$/', '', $stdout));
    }
}
