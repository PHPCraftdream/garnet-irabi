<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Commands {
    use Aura\Cli\Context;
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Interfaces\ICommand;
    use PHPCraftdream\Garnet\Kernel\Io\IniConfig\IniConfig;
    use PHPCraftdream\Garnet\Kernel\Io\Ssh\SshClient;
    use Throwable;

    /**
     * Base for `remote-<cmd>` twins: runs `php garnet <cmd> <args>` on the
     * deploy host over SSH (which auto-cd's into the runtime dir). Subclasses
     * only declare which inner command they wrap.
     */
    abstract class RemoteCommand implements ICommand {
        abstract protected static function innerCommand(): string;

        public static function description(): string {
            return 'Remote twin — runs `php garnet ' . static::innerCommand() . '` on the deploy host';
        }

        public static function help(array $args, Context $context, Stdio $stdio): void {
            $inner = static::innerCommand();
            $stdio->outln("Usage: php garnet remote-{$inner} [args…]");
            $stdio->outln("  Runs `php garnet {$inner} [args…]` on the remote host (auto-cd into the runtime dir).");
        }

        public static function run(array $args, Context $context, Stdio $stdio): void {
            $remoteCmd = 'php garnet ' . static::innerCommand();
            foreach ($args as $a) {
                // POSIX single-quote for the REMOTE shell (do NOT use
                // escapeshellarg — it quotes for the local OS, wrong on Windows).
                $remoteCmd .= " '" . str_replace("'", "'\\''", (string)$a) . "'";
            }

            // Run over SSH directly. We can't delegate to GarnetSshCommand::run()
            // here: it re-boots the app (run_cmd.php) and the second boot trips
            // "Cache already defined". The app is already booted, so use the
            // SSH client straight away and cd into the deploy runtime dir.
            $client = SshClient::fromIniConfig();
            $client->validate();

            $opts = ['stream' => true, 'tty' => false];
            $runtime = self::runtimeDir();
            if ($runtime !== '') {
                $opts['cwd'] = $runtime;
            }

            $result = $client->run($remoteCmd, $opts);
            exit($result->exitCode);
        }

        /** Absolute deploy runtime dir (remote_path/runtime_dir) from deploy.ini. */
        private static function runtimeDir(): string {
            try {
                $deploy = IniConfig::deploy();
                $base = rtrim($deploy->paramString('remote_path', ''), '/');
                $dir = trim($deploy->paramString('runtime_dir', ''), '/');
                return ($base !== '' && $dir !== '') ? $base . '/' . $dir : '';
            } catch (Throwable) {
                return '';
            }
        }
    }
}
