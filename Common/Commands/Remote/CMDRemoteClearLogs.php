<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Commands\Remote {
    class CMDRemoteClearLogs extends RemoteCommand {
        protected static function innerCommand(): string {
            return 'clear-logs';
        }
    }
}
