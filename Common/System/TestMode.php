<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\System {
    use PHPCraftdream\Garnet\Kernel\Core\AppInit\BaseAppInit;
    use PHPCraftdream\Garnet\Kernel\Io\GarnetCli\GarnetEnv;
    use Throwable;

    /**
     * App-level "test mode" gate, toggled from the CLI (`php garnet test-mode
     * on|off`). Detected purely by the presence of a `.test-mode` file in the
     * active app directory.
     *
     * Test mode unlocks destructive maintenance commands that must never be
     * runnable in normal operation — currently `php garnet clear-user`, which
     * wipes every trace of an account. The file is the single source of truth:
     * remove it (or run `test-mode off`) and the gate closes instantly.
     */
    class TestMode {
        public const FILE = '.test-mode';

        /**
         * Absolute path of the `.test-mode` marker (null if app dir unknown).
         *
         * The running app is asked first. `GarnetEnv::readAppName()` resolves
         * the name from `GARNET_APP_DIR` or the root `.env`, and neither is set
         * on the `run_cmd.php` entry point — so the gate there was closed
         * unconditionally, no matter what the marker said. Harmless for safety
         * and useless for anything else: `php garnet test-mode on` had no
         * effect on the very path cron and the test suite use.
         *
         * `BaseAppInit::getAppDir()` returns the app's own `__DIR__`, so it is
         * right from every entry point. The CLI resolution stays as a fallback
         * for the case where no app instance has been constructed yet.
         */
        public static function filePath(): ?string {
            try {
                $appDir = self::appDirFromInstance() ?? self::appDirFromCliEnv();

                if ($appDir === null || $appDir === '') {
                    return null;
                }

                return rtrim($appDir, '/\\') . DIRECTORY_SEPARATOR . self::FILE;
            } catch (Throwable) {
                return null;
            }
        }

        private static function appDirFromInstance(): ?string {
            $instance = BaseAppInit::getInstance();

            if ($instance === null) {
                return null;
            }

            $appDir = rtrim($instance->appDir, '/\\');

            return $appDir === '' ? null : $appDir;
        }

        private static function appDirFromCliEnv(): ?string {
            $appName = GarnetEnv::readAppName();

            if ($appName === '') {
                return null;
            }

            $appDir = GarnetEnv::getAppDir($appName);

            return $appDir === '' ? null : $appDir;
        }

        public static function isActive(): bool {
            $path = self::filePath();
            return $path !== null && is_file($path);
        }

        public static function enable(): bool {
            $path = self::filePath();
            if ($path === null) {
                return false;
            }
            return @file_put_contents($path, "1\n") !== false;
        }

        public static function disable(): bool {
            $path = self::filePath();
            if ($path === null) {
                return false;
            }
            if (!is_file($path)) {
                return true;
            }
            return @unlink($path);
        }
    }
}
