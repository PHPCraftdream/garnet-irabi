<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers {
    use PHPCraftdream\Garnet\Bundle\Utils\HtmlLayout;
    use PHPCraftdream\Garnet\Kernel\Core\FrameworkController;
    use PHPCraftdream\Garnet\Kernel\Io\Twig\TwigParams;
    use PHPCraftdream\IRabi\Foreground\Controllers\Bookings\BookingCancelTrait;
    use PHPCraftdream\IRabi\Foreground\Controllers\Bookings\BookingCreateTrait;
    use PHPCraftdream\IRabi\Foreground\Controllers\Bookings\BookingRescheduleTrait;
    use PHPCraftdream\IRabi\Foreground\Controllers\Bookings\BookingsListTrait;
    use PHPCraftdream\IRabi\Foreground\Params\Menu;

    class BookingsController extends FrameworkController {
        use BookingsListTrait;
        use BookingCreateTrait;
        use BookingRescheduleTrait;
        use BookingCancelTrait;

        public const URL = '/bookings';

        protected static function getSideMenu(string $url): array {
            return Menu::side($url);
        }

        protected static function getMainMenu(string $url): array {
            return Menu::main($url);
        }

        public static function renderContent(string $content, string $url): string {
            return HtmlLayout::render(
                TwigParams::init()->get(TwigParams::DEF_LAYOUT_PARAMS, [
                    'content' => $content,
                    'top_menu_items' => static::getMainMenu($url),
                    'side_menu_items' => static::getSideMenu($url),
                ])
            );
        }

        private const ALLOWED_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed'];
    }
}
