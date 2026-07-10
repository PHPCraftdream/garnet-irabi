<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\System {
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

        /** Absolute path of the `.test-mode` marker (null if app dir unknown). */
        public static function filePath(): ?string {
            try {
                $appName = GarnetEnv::readAppName();
                if ($appName === '') {
                    return null;
                }
                $appDir = GarnetEnv::getAppDir($appName);
                if ($appDir === '') {
                    return null;
                }
                return rtrim($appDir, '/\\') . DIRECTORY_SEPARATOR . self::FILE;
            } catch (Throwable) {
                return null;
            }
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
