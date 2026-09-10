<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Bundle\Modules\Balance\Controllers\FwBalanceController;
    use PHPCraftdream\Garnet\Bundle\Modules\Balance\Tables\FwAccountBalance;
    use PHPCraftdream\Garnet\Bundle\Modules\Balance\Tables\FwBalanceLedger;
    use PHPCraftdream\Garnet\Bundle\Utils\PaginationHelper;
    use PHPCraftdream\Garnet\Bundle\Utils\RenderIsland;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Session\Session;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\IRabi\Common\Services\LedgerContextService;
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

        /**
         * Строки истории, дополненные поводом операции.
         *
         * Родительские `get__main` и `post__ledgerPage` отдают строки как есть,
         * а зацепиться в них не за что: `ledgerWhereCallback` приватный, хука
         * для обогащения нет. Поэтому оба метода переопределены целиком —
         * дублирование маленькое и осознанное, чтобы не трогать фреймворк.
         */
        private static function ledgerPage(int $accountId, int $page, int $perPage): array {
            $where = static function (SelectInterface $query) use ($accountId): void {
                $query->where('account_id = ?', [$accountId])
                      ->orderBy(['created_at DESC']);
            };

            $pageData = PaginationHelper::fetchPage(static::ledgerTable(), $page, $perPage, $where);
            $response = PaginationHelper::toPageResponse($pageData);
            $response['items'] = LedgerContextService::enrich($response['items'], $accountId);

            return $response;
        }

        public static function get__main(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            // Personal balance is everyone's self-service page — staff
            // (admins/owners/moderators) have their own balance too, so it is no
            // longer bounced to the dashboard. Platform-wide finance still lives
            // under /admin/finance/.
            $account = Account::fromSession();

            if (!$account) {
                return parent::get__main($globals, $params);
            }

            $accountId = (int)$account->id();

            $content = RenderIsland::render('balance', [
                'balance' => static::balanceTable()::getBalance($accountId),
                'ledgerPagination' => static::ledgerPage($accountId, 1, 20),
                'ledgerPageUrl' => static::ledgerPagePath(),
                'csrf' => Session::touchCSRF_(),
            ]);

            return ControllerTools::ok(static::renderContent($content, $globals->getUri()));
        }

        public static function post__ledgerPage(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $account = Account::fromSession();

            if (!$account) {
                return ControllerTools::JSON(['error' => 'Not authenticated'], status: 401);
            }

            ['page' => $page, 'perPage' => $perPage] = PaginationHelper::readPageParams($globals);

            return ControllerTools::JSON(static::ledgerPage((int)$account->id(), $page, $perPage));
        }
    }
}
