<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Bundle\Modules\Email\Tables\FwEmailAttempts;

    class EmailAttempts extends FwEmailAttempts {
        protected string $tableName = 'email_attempts';
    }
}
