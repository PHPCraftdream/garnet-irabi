<?php declare(strict_types=1);

/**
 * Live-DB regression check: AccountBalance::withAccountLock() must not let
 * a NamedLock::release() failure escape its finally block (task #179).
 *
 * PHP `finally` semantics: an exception thrown in finally REPLACES the
 * try block's outcome — a successful (already-committed) money-path
 * result would turn into an uncaught 500, and a real business exception
 * would be silently masked. NamedLock::release() throws DbException on
 * genuine state errors (e.g. the lock was released behind its back on
 * the owning connection).
 *
 * Sabotage pattern (same as the framework's own
 * Kernel/Db/Link/Spec/NamedLockIntegrationSpec.php): steal the lock from
 * the owning connection mid-critical-section, so the finally's
 * RELEASE_LOCK observes "not owned" and throws.
 *
 * Run:  php Tests/php/account_balance_release_lock.php
 * Needs: WorkDir/ConfigDev/db.ini with enabled = 1 (dev MySQL).
 * Exits 0 when every check passes, 1 on any failure or DB error, 0 with
 * "SKIPPED" when no dev DB is configured.
 */

use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
use PHPCraftdream\Garnet\Kernel\Db\Link\NamedLock;
use PHPCraftdream\Garnet\Kernel\Exceptions\DbException;
use PHPCraftdream\Garnet\Kernel\Io\IniConfig\IniConfig;
use PHPCraftdream\Garnet\Kernel\Io\Logs\Logger;
use PHPCraftdream\IRabi\Common\Tables\AccountBalance;

require __DIR__ . '/../../vendor/autoload.php';

$failures = 0;

function check(bool $condition, string $label): void {
    global $failures;

    echo ($condition ? '  PASS' : '  FAIL') . ": {$label}\n";

    if (!$condition) {
        $failures++;
    }
}

/**
 * Steal $lockName from the connection NamedLock pinned as its owner.
 *
 * Shape-agnostic: reads $owners[$lockName] as either a bare
 * IDbMySQLiLink (framework <= v0.1.0-alpha27, currently vendored) or
 * ['link' => IDbMySQLiLink, 'count' => int, ...] (framework HEAD as of
 * the NamedLock reentrancy fix, task #170) -- so this script keeps
 * working across a future composer update without needing a
 * synchronized edit (task #189).
 */
function stealLock(string $lockName): void {
    $ownersProp = new ReflectionProperty(NamedLock::class, 'owners');
    $ownersProp->setAccessible(true);

    $owners = $ownersProp->getValue();
    $entry = $owners[$lockName] ?? null;

    if ($entry === null) {
        throw new RuntimeException("No NamedLock owner recorded for '{$lockName}'");
    }

    $ownerLink = is_array($entry) ? $entry['link'] : $entry;

    $ownerLink->query('SELECT RELEASE_LOCK(?)', [$lockName]);

    $thief = DbPool::get()->newLink();
    $thief->query('SELECT GET_LOCK(?, 0) AS lk', [$lockName]);
}

/** Mirror of the protected AccountBalance::lockNameFor() convention. */
function lockName(int $accountId): string {
    return 'irabi_bal_' . $accountId;
}

/** ERROR_LOGGER files for the account_lock_release category under $logDir. */
function loggedReleaseFailures(string $logDir): array {
    return glob($logDir . '/*/ERROR_LOGGER-account_lock_release-*.log') ?: [];
}

$dbConfigPath = __DIR__ . '/../../WorkDir/ConfigDev/db.ini';

if (!file_exists($dbConfigPath)) {
    echo "SKIPPED: dev db.ini not found at {$dbConfigPath}\n";

    exit(0);
}

$parsed = parse_ini_file($dbConfigPath);
$enabled = is_array($parsed) ? (string)($parsed['enabled'] ?? '') : '';

if ($enabled !== '1') {
    echo "SKIPPED: enabled != 1 in dev db.ini\n";

    exit(0);
}

IniConfig::defineDbIni($dbConfigPath);

try {
    DbPool::get()->newLink()->query('SELECT 1', []);
} catch (Throwable $e) {
    echo 'DB unavailable: ' . $e->getMessage() . "\n";

    exit(1);
}

$logDir = sys_get_temp_dir() . '/irabi_account_lock_test_' . getmypid() . '_' . uniqid();
mkdir($logDir);
Logger::define($logDir, Logger::ERROR_LOGGER);

echo "Scenario A: happy path (no sabotage)\n";
$resultA = AccountBalance::withAccountLock(777001, static function (): string {
    return 'OK_A';
});
check($resultA === 'OK_A', 'closure result returned when release succeeds');
check(loggedReleaseFailures($logDir) === [], 'no error logged when release succeeds');

echo "Scenario B: release throws after a successful critical section\n";
$resultB = null;
$exB = null;

try {
    $resultB = AccountBalance::withAccountLock(777002, static function (): string {
        stealLock(lockName(777002));

        return 'MONEY_WRITES_COMMITTED';
    });
} catch (Throwable $e) {
    $exB = $e;
}

check($exB === null, 'no exception escapes when only the release fails');
check($resultB === 'MONEY_WRITES_COMMITTED', 'original return value preserved (not replaced by release failure)');

$logsB = loggedReleaseFailures($logDir);
$contentB = $logsB !== [] ? (string)file_get_contents($logsB[0]) : '';
check($logsB !== [], 'release failure was logged to ERROR_LOGGER');
check(
    str_contains($contentB, 'DbException') && str_contains($contentB, lockName(777002)),
    'log entry contains the exception and the lock name',
);

echo "Scenario C: release throws while the critical section itself threw\n";
$exC = null;

try {
    AccountBalance::withAccountLock(777003, static function (): void {
        stealLock(lockName(777003));

        throw new DomainException('BUSINESS_FAILURE_MARKER');
    });
} catch (Throwable $e) {
    $exC = $e;
}

check($exC instanceof DomainException, 'original business exception observed (not masked)');
check($exC?->getMessage() === 'BUSINESS_FAILURE_MARKER', 'original business exception message preserved');
check(!($exC instanceof DbException), 'release DbException did not replace the business exception');

$logsC = loggedReleaseFailures($logDir);
$matchedC = '';
foreach ($logsC as $logFile) {
    $content = (string)file_get_contents($logFile);

    if (str_contains($content, lockName(777003))) {
        $matchedC = $content;

        break;
    }
}
check(count($logsC) >= 2, 'second release failure was logged too');
check(
    $matchedC !== '' && str_contains($matchedC, 'DbException'),
    'second log entry contains the exception and the lock name',
);

DbPool::closeAll();

echo $failures === 0 ? "ALL CHECKS PASSED\n" : "{$failures} CHECK(S) FAILED\n";
exit($failures === 0 ? 0 : 1);
