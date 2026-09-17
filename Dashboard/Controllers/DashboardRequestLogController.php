<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Dashboard\Controllers {
    use PHPCraftdream\Garnet\Kernel\Core\Runtime\FrameworkController;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Core\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Web\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Http\Router\Controller\ControllerTools;
    use PHPCraftdream\IRabi\IRabi;

    /**
     * Legacy URL — redirects to the unified logs viewer at /admin/logs/?tab=requests.
     */
    class DashboardRequestLogController extends FrameworkController {
        public const URL = '/admin/request-log/';

        public static function get__main(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            return ControllerTools::redirect(IRabi::url(DashboardLogsController::URL) . '?tab=requests');
        }
    }
}
