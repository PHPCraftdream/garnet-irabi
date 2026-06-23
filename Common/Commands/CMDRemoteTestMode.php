<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Commands {
    class CMDRemoteTestMode extends RemoteCommand {
        protected static function innerCommand(): string {
            return 'test-mode';
        }
    }
}
