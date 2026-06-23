<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Bundle\Modules\Logging\Mail\Tables\FwMailLog;
    use PHPCraftdream\Garnet\Bundle\Modules\Logging\Mail\Tables\FwMailLogRecipients;

    class MailLog extends FwMailLog {
        protected string $tableName = 'mail_log';

        protected static function recipientsTable(): FwMailLogRecipients {
            return MailLogRecipients::get();
        }
    }
}
