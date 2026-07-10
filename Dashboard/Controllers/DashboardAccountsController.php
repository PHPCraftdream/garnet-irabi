<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Dashboard\Controllers {
    use PHPCraftdream\Garnet\Bundle\Modules\Auth\Controllers\FwAccountsController;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Db\IEntityConfig;
    use PHPCraftdream\IRabi\Foreground\Params\Menu;
    use PHPCraftdream\IRabi\Foreground\Params\UserEntityConfig;
    use PHPCraftdream\IRabi\IRabi;

    class DashboardAccountsController extends FwAccountsController {
        protected static function publicDir(): string {
            return IRabi::getInstance()->publicDir;
        }

        protected static function getEntityConfig(): IEntityConfig {
            return UserEntityConfig::getEntityConfig();
        }
        // -------------------------------------------------------------------------------------------------------------

        protected static function getSideMenu(string $url): array {
            return Menu::side($url);
        }

        protected static function getMainMenu(string $url): array {
            return Menu::main($url);
        }
    }
}
