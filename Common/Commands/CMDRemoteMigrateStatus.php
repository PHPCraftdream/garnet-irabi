<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Commands {
    class CMDRemoteMigrateStatus extends RemoteCommand {
        protected static function innerCommand(): string {
            return 'migrate:status';
        }
    }
}
