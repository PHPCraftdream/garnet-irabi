<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables\Support {
    use PHPCraftdream\Garnet\Bundle\Modules\Comms\Support\Tables\FwSupportAssignmentLog;

    class SupportAssignmentLog extends FwSupportAssignmentLog {
        protected string $tableName = 'support_assignment_log';
    }
}
