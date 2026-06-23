<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Bundle\Modules\EntityHistory\Tables\FwEntityHistory;

    class EntityHistory extends FwEntityHistory {
        protected string $tableName = 'entity_history';
    }
}
