<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Bundle\Modules\Logging\Admin\Tables\FwAdminActionLog;

    class AdminActionLog extends FwAdminActionLog {
        protected string $tableName = 'admin_action_log';
    }
}
