<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables\Mail {
    use PHPCraftdream\Garnet\Bundle\Modules\Ops\Logging\Mail\Tables\FwMailLogRecipients;

    class MailLogRecipients extends FwMailLogRecipients {
        protected string $tableName = 'mail_log_recipients';
    }
}
