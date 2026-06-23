<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Dashboard\Controllers {
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\IRabi\IRabi;

    /**
     * Cancellations were merged into the unified admin Bookings section as two
     * tabs. This controller now exists only to keep the legacy URL alive — it
     * 302s to the right tab on the new admin page.
     */
    class DashboardCancellationsController extends DashboardController {
        public const URL = '/admin/cancellations/';

        public static function get__main(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            return ControllerTools::redirect(IRabi::url(DashboardBookingsController::URL) . '?tab=expert-cancellations');
        }
    }
}
