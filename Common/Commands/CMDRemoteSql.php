<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Commands {
    class CMDRemoteSql extends RemoteCommand {
        protected static function innerCommand(): string {
            return 'sql';
        }
    }
}
