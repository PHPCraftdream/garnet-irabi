<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Dashboard {
    use PHPCraftdream\IRabi\Dashboard\Controllers\DashboardBookingsController;
    use PHPCraftdream\IRabi\Dashboard\Controllers\DashboardFinanceController;
    use PHPCraftdream\IRabi\Dashboard\Controllers\DashboardLogsController;
    use PHPCraftdream\IRabi\Dashboard\Controllers\DashboardMainController;
    use PHPCraftdream\IRabi\Dashboard\Controllers\DashboardStaticPagesController;
    use PHPCraftdream\IRabi\Dashboard\Controllers\DashboardSupportController;
    use PHPCraftdream\IRabi\Dashboard\Controllers\DashboardSystemController;
    use PHPCraftdream\IRabi\Dashboard\Controllers\DashboardUsersController;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use PHPCraftdream\IRabi\Foreground\Params\Menu;
    use PHPCraftdream\IRabi\Foreground\Params\UserEntityConfig;
    use PHPCraftdream\IRabi\IRabi;

    /**
     * Supplies the IRabi business menus + role checks expected by
     * FwDashboardController. Used by all admin dashboard controllers
     * (both pure IRabi ones and those extending generic Fw* bases).
     */
    trait IrabiDashboardMenuTrait {
        protected static function isModerator(): bool {
            return UserEntityConfig::isModerator();
        }

        protected static function isOwner(): bool {
            return UserEntityConfig::isOwner();
        }

        protected static function getSideMenu(string $url): array {
            $t = ForegroundI18n::getInstance();
            // Moderators land on the admin dashboard at / (rendered inline by MainController),
            // so highlight the Dashboard sidebar item there too.
            $dashboardUrl = ($url === '/' || $url === '') ? DashboardMainController::URL : $url;
            $items = [
                Menu::item($t->Admin_Dashboard(), IRabi::url(DashboardMainController::URL), 'speedometer2', $dashboardUrl, strict: true),
                Menu::item($t->Admin_Users(), IRabi::url(DashboardUsersController::URL), 'people', $url, strict: true),
                Menu::item($t->Admin_Slots(), IRabi::url(DashboardBookingsController::URL), 'calendar-check', $url),
                Menu::item($t->Admin_Finance(), IRabi::url(DashboardFinanceController::URL), 'cash-stack', $url),
                Menu::item($t->Admin_Logs(), IRabi::url(DashboardLogsController::URL), 'clipboard-list', $url),
                Menu::item($t->Admin_Support(), IRabi::url(DashboardSupportController::URL), 'chat-dots', $url),
            ];

            if (static::isOwner()) {
                $items[] = Menu::item($t->Admin_Pages(), IRabi::url(DashboardStaticPagesController::URL), 'file-earmark-text', $url, strict: true);
                $items[] = Menu::item($t->Admin_SystemSettings(), IRabi::url(DashboardSystemController::URL), 'gear', $url, strict: true);
            }

            return $items;
        }

        protected static function getMainMenu(string $url): array {
            return Menu::main($url);
        }
    }
}
