<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Bundle\Modules\Idempotency\Tables\FwIdempotencyKeys;

    class IdempotencyKeys extends FwIdempotencyKeys {
        protected string $tableName = 'idempotency_keys';
    }
}
