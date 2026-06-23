<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Commands {
    use Aura\Cli\Context;
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Core\AppInit\BaseAppInit;
    use PHPCraftdream\Garnet\Kernel\Core\Env\TestScope;
    use PHPCraftdream\Garnet\Kernel\Interfaces\ICommand;
    use PHPCraftdream\Garnet\Kernel\Io\IniConfig\IniConfig;
    use PHPCraftdream\IRabi\Common\Services\TestScopeDbService;

    /**
     * `php garnet test:teardown` — tear down the isolated test_worker_0 scope.
     *
     * The closing half of `test:provision`: drops every `test_worker_0_*`
     * table, removes the `UploadTest` upload dir, and deletes the
     * `.allow_tests` token (closing the web gate again). Safe to run with no
     * token in the environment — it only ever touches the test namespace,
     * never the live `db_ir_*` tables or the live `Upload` dir.
     */
    class CMDTestTeardown implements ICommand {
        public static function description(): string {
            return 'Drop the test_worker_0 scope + token + UploadTest (prod UI-test pipeline)';
        }

        public static function help(array $args, Context $context, Stdio $stdio): void {
            $stdio->outln('Usage: php garnet test:teardown');
            $stdio->outln('');
            $stdio->outln('  Drops test_worker_0_* tables, removes UploadTest, deletes .allow_tests.');
        }

        public static function run(array $args, Context $context, Stdio $stdio): void {
            $prefix = TestScope::WORKER_PREFIX;
            IniConfig::db()->setRuntimeOverride('prefix', $prefix);

            // 1. Drop the scope's tables.
            $dropped = TestScopeDbService::dropScopeTables($prefix);
            $stdio->outln("Dropped {$dropped} {$prefix}_* table(s)");

            // 2. Remove the isolated upload dir. Compute the path explicitly
            //    from workDir + the test sub-dir constant — NEVER trust
            //    $app->uploadDir here, which resolves to the live `Upload`
            //    folder when the token has already been removed / no env token.
            $app = BaseAppInit::getInstance();
            if ($app !== null) {
                $uploadTestDir = rtrim($app->workDir, '/\\') . DIRECTORY_SEPARATOR . TestScope::UPLOAD_SUBDIR;
                if (is_dir($uploadTestDir)) {
                    self::rmTree($uploadTestDir);
                    $stdio->outln("Removed upload dir: {$uploadTestDir}");
                }
            }

            // 3. Delete the token — closes the web gate.
            $tokenFile = TestScope::tokenFilePath();
            if ($tokenFile !== null && is_file($tokenFile)) {
                @unlink($tokenFile);
                $stdio->outln("Removed token: {$tokenFile}");
            }

            $stdio->outln('');
            $stdio->outln("Teardown complete — scope `{$prefix}` is gone.");
        }

        /**
         * Recursively delete a directory. Best-effort: a file that can't be
         * removed is skipped rather than aborting the whole teardown.
         */
        private static function rmTree(string $dir): void {
            $items = @scandir($dir);
            if ($items === false) {
                return;
            }
            foreach ($items as $item) {
                if ($item === '.' || $item === '..') {
                    continue;
                }
                $path = $dir . DIRECTORY_SEPARATOR . $item;
                if (is_dir($path) && !is_link($path)) {
                    self::rmTree($path);
                } else {
                    @unlink($path);
                }
            }
            @rmdir($dir);
        }
    }
}
