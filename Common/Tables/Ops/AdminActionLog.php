<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables\Ops {
    use PHPCraftdream\Garnet\Bundle\Modules\Ops\Logging\Admin\Tables\FwAdminActionLog;

    class AdminActionLog extends FwAdminActionLog {
        protected string $tableName = 'admin_action_log';
    }
}
