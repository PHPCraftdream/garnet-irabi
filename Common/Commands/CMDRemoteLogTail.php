<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Commands {
    class CMDRemoteLogTail extends RemoteCommand {
        protected static function innerCommand(): string {
            return 'log-tail';
        }
    }
}
