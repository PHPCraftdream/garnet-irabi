<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables\Ops {
    use PHPCraftdream\Garnet\Bundle\Modules\Ops\Idempotency\Tables\FwIdempotencyKeys;

    class IdempotencyKeys extends FwIdempotencyKeys {
        protected string $tableName = 'idempotency_keys';
    }
}
