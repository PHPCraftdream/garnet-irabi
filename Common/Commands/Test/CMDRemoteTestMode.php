<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Commands\Test {
    use PHPCraftdream\IRabi\Common\Commands\Remote\RemoteCommand;

    class CMDRemoteTestMode extends RemoteCommand {
        protected static function innerCommand(): string {
            return 'test-mode';
        }
    }
}
