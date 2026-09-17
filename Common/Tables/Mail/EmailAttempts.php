<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables\Mail {
    use PHPCraftdream\Garnet\Bundle\Modules\Comms\Email\Tables\FwEmailAttempts;

    class EmailAttempts extends FwEmailAttempts {
        protected string $tableName = 'email_attempts';
    }
}
