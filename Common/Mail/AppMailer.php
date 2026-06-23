<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Mail {
    use PHPCraftdream\Garnet\Bundle\Modules\Logging\Mail\FwAppMailer;
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTable;
    use PHPCraftdream\IRabi\Common\Tables\MailLog;

    class AppMailer extends FwAppMailer {
        protected function mailLogTable(): DbTable {
            return MailLog::get();
        }
    }
}
