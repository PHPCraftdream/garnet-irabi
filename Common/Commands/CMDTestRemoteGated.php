<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Commands {
    use Aura\Cli\Context;
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Io\ICommand;
    use PHPCraftdream\Garnet\Kernel\Io\Services\IniConfig\IniConfig;
    use PHPCraftdream\Garnet\Kernel\Io\Services\Ssh\SshClient;
    use Throwable;

    /**
     * `php garnet test:remote:gated --base-url=<url> [test:remote args...]`
     *
     * Wraps `test:remote` (#397) with a pre-flight check: if the remote box
     * is unreachable or in maintenance, WAIT for it to clear (bounded)
     * instead of either failing outright or — worse — letting "the run
     * never happened" read as a passing gate. This is the rule #398 exists
     * to enforce: an untold outage went unnoticed for 12 hours because a
     * green-by-default signal didn't distinguish "checked, fine" from
     * "never checked".
     *
     * Exit codes are deliberately distinct from test:remote's own 0/1:
     *   0/1 — the run actually happened; test:remote's own exit code is
     *         forwarded as-is (0 pass, 1 real test failures).
     *   2   — the run did NOT happen at all: SSH unreachable, or the site
     *         stayed in maintenance past the wait budget. A caller (a push
     *         hook, a human) must treat this as "gate not satisfied", the
     *         same as a failure — never as a pass.
     */
    class CMDTestRemoteGated implements ICommand {
        private const POLL_SECONDS = 20;
        private const MAX_WAIT_SECONDS = 600;

        public static function description(): string {
            return 'test:remote, but waits out maintenance instead of silently skipping the gate';
        }

        public static function help(array $args, Context $context, Stdio $stdio): void {
            $stdio->outln('Usage: php garnet test:remote:gated --base-url=<url> [test:remote args...]');
            $stdio->outln('  Exit 0/1: the run happened — forwards test:remote\'s own exit code (0 pass, 1 real failures).');
            $stdio->outln('  Exit 2: the run did NOT happen (unreachable, or maintenance held past ' . self::MAX_WAIT_SECONDS . 's) — treat as NOT passed.');
        }

        public static function run(array $args, Context $context, Stdio $stdio): void {
            if (in_array('--help', $args, true) || in_array('-h', $args, true)) {
                self::help($args, $context, $stdio);

                exit(0);
            }

            $client = SshClient::fromIniConfig();

            try {
                $client->validate();
            } catch (Throwable $e) {
                $stdio->errln("GATE NOT RUN: ssh.ini invalid — {$e->getMessage()}");

                exit(2);
            }

            $remoteDir = self::remoteRuntimeDir($stdio);

            $ping = $client->run('echo ok', ['cwd' => $remoteDir, 'stream' => false]);

            if (!$ping->ok() || trim($ping->stdout) !== 'ok') {
                $stdio->errln('GATE NOT RUN: remote host unreachable over SSH — fix connectivity and retry, this is NOT a pass.');

                exit(2);
            }

            $waited = 0;

            while (true) {
                $status = $client->run('php garnet maintenance status', ['cwd' => $remoteDir, 'stream' => false]);

                if (!str_contains($status->stdout, 'Maintenance mode ON')) {
                    break;
                }

                if ($waited >= self::MAX_WAIT_SECONDS) {
                    $stdio->errln('GATE NOT RUN: remote site still in maintenance after ' . self::MAX_WAIT_SECONDS . 's — retry once it lifts, this is NOT a pass.');

                    exit(2);
                }

                $stdio->outln('[test:remote:gated] remote in maintenance — waiting ' . self::POLL_SECONDS . "s (elapsed {$waited}/" . self::MAX_WAIT_SECONDS . 's)…');
                sleep(self::POLL_SECONDS);
                $waited += self::POLL_SECONDS;
            }

            // Delegate to the real test:remote, forwarding its exit code as-is.
            $cmd = 'garnet test:remote';

            foreach ($args as $a) {
                $cmd .= ' ' . escapeshellarg((string)$a);
            }
            passthru('php ' . $cmd, $code);

            exit((int)$code);
        }

        private static function remoteRuntimeDir(Stdio $stdio): string {
            $deploy = IniConfig::deploy();
            $base = rtrim($deploy->paramString('remote_path', ''), '/');
            $dir = trim($deploy->paramString('runtime_dir', ''), '/');

            if ($base === '' || $dir === '') {
                $stdio->errln('GATE NOT RUN: deploy.ini must define remote_path and runtime_dir.');

                exit(2);
            }

            return $base . '/' . $dir;
        }
    }
}
