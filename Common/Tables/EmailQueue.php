<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Bundle\Modules\Email\Tables\FwEmailQueue;

    class EmailQueue extends FwEmailQueue {
        protected string $tableName = 'email_queue';
    }
}
