<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers {
    use PHPCraftdream\Garnet\Bundle\Modules\Balance\Controllers\FwBalanceController;
    use PHPCraftdream\Garnet\Bundle\Modules\Balance\Tables\FwAccountBalance;
    use PHPCraftdream\Garnet\Bundle\Modules\Balance\Tables\FwBalanceLedger;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\IRabi\Common\Tables\AccountBalance;
    use PHPCraftdream\IRabi\Common\Tables\BalanceLedger;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use PHPCraftdream\IRabi\Foreground\Params\Menu;

    class BalanceController extends FwBalanceController {
        public const URL = '/balance';

        protected static function balanceTable(): FwAccountBalance {
            return AccountBalance::get();
        }

        protected static function ledgerTable(): FwBalanceLedger {
            return BalanceLedger::get();
        }

        protected static function getSideMenu(string $url): array {
            return Menu::side($url);
        }

        protected static function getMainMenu(string $url): array {
            return Menu::main($url);
        }

        protected static function topUpNote(): string {
            return ForegroundI18n::getInstance()->Balance_LedgerNote_TopUp();
        }

        public static function get__main(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            // Personal balance is everyone's self-service page — staff
            // (admins/owners/moderators) have their own balance too, so it is no
            // longer bounced to the dashboard. Platform-wide finance still lives
            // under /admin/finance/.
            return parent::get__main($globals, $params);
        }
    }
}
