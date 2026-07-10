<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Dashboard\Controllers {
    use PHPCraftdream\Garnet\Kernel\Core\FrameworkController;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\IRabi\IRabi;

    /**
     * Legacy URL kept for compatibility — the dedicated "Balances" admin
     * section was merged into the unified "Finance" page (see
     * {@see DashboardFinanceController}). Any access to /admin/balances/
     * is permanently routed to the balances tab of the new page.
     */
    class DashboardBalancesController extends FrameworkController {
        public const URL = '/admin/balances/';

        public static function get__main(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            return ControllerTools::redirect(IRabi::url(DashboardFinanceController::URL) . '?tab=balances');
        }
    }
}
