<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Dashboard\Controllers {
    use PHPCraftdream\Garnet\Bundle\Modules\Dashboard\Controllers\FwDashboardController;
    use PHPCraftdream\IRabi\Dashboard\IrabiDashboardMenuTrait;

    /**
     * IRabi-specific dashboard base controller for controllers that don't
     * inherit from a generic Fw* dashboard controller. Carries the IRabi
     * menus / role checks via IrabiDashboardMenuTrait.
     *
     * Controllers that DO extend a Fw* base (Logs, MailLog, RequestLog,
     * SystemSettings) cannot extend this class because of single inheritance —
     * they use IrabiDashboardMenuTrait directly instead.
     */
    abstract class DashboardController extends FwDashboardController {
        use IrabiDashboardMenuTrait;
    }
}
