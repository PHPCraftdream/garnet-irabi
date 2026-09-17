<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Commands\Remote\Db {
    use PHPCraftdream\IRabi\Common\Commands\Remote\RemoteCommand;

    class CMDRemoteMigration extends RemoteCommand {
        protected static function innerCommand(): string {
            return 'migration';
        }
    }
}
