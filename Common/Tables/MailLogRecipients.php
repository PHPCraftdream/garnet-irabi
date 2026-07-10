<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Bundle\Modules\Logging\Mail\Tables\FwMailLogRecipients;

    class MailLogRecipients extends FwMailLogRecipients {
        protected string $tableName = 'mail_log_recipients';
    }
}
