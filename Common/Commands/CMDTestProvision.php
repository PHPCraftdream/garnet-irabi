<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Commands {
    use Aura\Cli\Context;
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Core\Benchmark\BenchmarkLog;
    use PHPCraftdream\Garnet\Kernel\Core\Env\TestScope;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Migration\CMDMigration;
    use PHPCraftdream\Garnet\Kernel\Interfaces\ICommand;
    use PHPCraftdream\Garnet\Kernel\Io\IniConfig\IniConfig;
    use PHPCraftdream\IRabi\Common\Services\DevSeedService;
    use PHPCraftdream\IRabi\Common\Services\TestScopeDbService;
    use PHPCraftdream\IRabi\Common\Services\TestScopeSeedService;

    /**
     * `php garnet test:provision` — server-side setup for the prod UI-test run.
     *
     * Driven over SSH by the local orchestrator (`php garnet test:remote`).
     * It is the only thing that plants the `.allow_tests` token, and it pins
     * every DB write to the isolated `test_worker_0` prefix — so it can never
     * touch the live `db_ir_*` tables, even if invoked by mistake.
     *
     * Steps:
     *   1. Plant the secret token (from GARNET_TEST_TOKEN) into `.allow_tests`.
     *      From now on web requests carrying `run-test-garnet-team: <token>`
     *      flip to the `test_worker_0` scope + `UploadTest` dir.
     *   2. Pin the CLI prefix override to `test_worker_0`.
     *   3. Drop any leftover `test_worker_0_*` tables (clean slate).
     *   4. Migrate the schema, seed sample data, register the `testuser_setup_*`
     *      role accounts the Playwright suite logs into.
     *
     * Mirrors `Framework/tests/helpers/isolation-setup.ts` (template build), but for a
     * single scope against a remote prod box with no local DB access.
     */
    class CMDTestProvision implements ICommand {
        public static function description(): string {
            return 'Provision the isolated test_worker_0 scope on this host (prod UI-test pipeline)';
        }

        public static function help(array $args, Context $context, Stdio $stdio): void {
            $stdio->outln('Usage: GARNET_TEST_TOKEN=<secret> php garnet test:provision');
            $stdio->outln('');
            $stdio->outln('  Plants .allow_tests, then migrates + seeds the test_worker_0 scope.');
            $stdio->outln('  The token may also be passed as --token=<secret>.');
            $stdio->outln('  Tear down afterwards with: php garnet test:teardown');
        }

        public static function run(array $args, Context $context, Stdio $stdio): void {
            $token = self::resolveToken($args);
            if ($token === null) {
                $stdio->errln('ERROR: missing/invalid token. Set GARNET_TEST_TOKEN or pass --token=<secret>.');
                $stdio->errln('       Token must be 16-128 chars of [A-Za-z0-9_-].');
                exit(1);
            }

            $tokenFile = TestScope::tokenFilePath();
            if ($tokenFile === null) {
                $stdio->errln('ERROR: cannot resolve the app directory for the token file.');
                exit(1);
            }

            // 1. Plant the token.
            if (@file_put_contents($tokenFile, $token) === false) {
                $stdio->errln("ERROR: failed to write token file: {$tokenFile}");
                exit(1);
            }
            $stdio->outln("Token planted: {$tokenFile}");

            // 2. Pin the prefix. Self-contained — we don't depend on run_cmd's
            //    env-gated override (the token file didn't exist yet at boot).
            $prefix = TestScope::WORKER_PREFIX;
            IniConfig::db()->setRuntimeOverride('prefix', $prefix);
            $stdio->outln("DB prefix pinned: {$prefix}");

            // 3. Clean slate.
            $dropped = TestScopeDbService::dropScopeTables($prefix);
            $stdio->outln("Dropped {$dropped} leftover {$prefix}_* table(s)");

            // 4. Migrate.
            $stdio->outln('Migrating schema...');
            CMDMigration::run(['init'], $context, $stdio);
            CMDMigration::run(['migrate'], $context, $stdio);

            // 5. Seed sample data + role accounts. BenchmarkLog::init first —
            //    seed paths emit benchmark marks and BenchmarkLog::$start
            //    must be initialised before any log() call (mirrors CMDSeed).
            $stdio->outln('Seeding sample data...');
            BenchmarkLog::init('test:provision');
            DevSeedService::seed();

            $stdio->outln('Registering testuser_setup_* role accounts...');
            TestScopeSeedService::seedSetupAccounts();

            $stdio->outln('');
            $stdio->outln("Provision complete — scope `{$prefix}` is ready.");
        }

        /**
         * @param array<int, string> $args
         */
        private static function resolveToken(array $args): ?string {
            $token = (string)(getenv(TestScope::ENV_TOKEN) ?: '');
            foreach ($args as $arg) {
                if (str_starts_with($arg, '--token=')) {
                    $token = substr($arg, 8);
                    break;
                }
            }
            $token = trim($token);
            if (preg_match('/^[A-Za-z0-9_-]{16,128}$/', $token) !== 1) {
                return null;
            }
            return $token;
        }
    }
}
