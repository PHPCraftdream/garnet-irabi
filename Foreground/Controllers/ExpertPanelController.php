<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers {
    use Closure;
    use PHPCraftdream\Garnet\Bundle\Utils\HtmlLayout;
    use PHPCraftdream\Garnet\Kernel\Core\FrameworkController;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\Garnet\Kernel\Io\Twig\TwigParams;
    use PHPCraftdream\IRabi\Foreground\Controllers\ExpertPanel\ExpertBookingsService;
    use PHPCraftdream\IRabi\Foreground\Controllers\ExpertPanel\ExpertSlotsService;
    use PHPCraftdream\IRabi\Foreground\Params\Menu;
    use PHPCraftdream\IRabi\Foreground\Params\UserEntityConfig;
    use PHPCraftdream\IRabi\IRabi;

    /**
     * Личный кабинет эксперта (/expert/...).
     *
     * Тонкий контроллер-диспетчер. Вся бизнес-логика вынесена
     * в сервисы в подпапке Teaching/.
     */
    class ExpertPanelController extends FrameworkController {
        public const URL = '/expert/';

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

        private static function render(string $url): Closure {
            return fn (string $content): mixed => ControllerTools::ok(static::renderContent($content, $url));
        }

        private static function account(): ?Account {
            return Account::fromSession();
        }

        private static function denied(): mixed {
            return ControllerTools::JSON(['error' => 'Not authenticated'], status: 401);
        }

        /**
         * Security audit A-02: expertOnly() at the route level only checks
         * business type (type=expert), not approval — matches the documented
         * invariant (docs/roles.md §4: "эксперт получает доступ к /expert"
         * only после IS_APPROVED). GET pages stay reachable for unapproved
         * experts (the frontend shows a "pending approval" banner there, and
         * slots created while unapproved are simply never surfaced publicly
         * — see ExpertSlotsService/SlotsController), but every state-changing
         * action requires approval as a defense-in-depth API-level guard.
         *
         * Staff rank (moderator/owner/admin) bypasses this business-role
         * check entirely — approval is orthogonal to staff rank, same as
         * everywhere else in this codebase (rank ladder admin ⊇ owner ⊇
         * moderator).
         */
        private static function mayMutate(Account $account): bool {
            return $account->isApproved() || UserEntityConfig::isModerator();
        }

        private static function deniedNotApproved(): mixed {
            return ControllerTools::JSON(['error' => 'Expert not approved'], status: 403);
        }

        // ── Дашборд ────────────────────────────────────────────────────

        public static function get__dashboard(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            return ControllerTools::redirect(IRabi::url('/'));
        }

        public static function get__main(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            return ControllerTools::redirect(IRabi::url('/'));
        }

        // ── Слоты ──────────────────────────────────────────────────────

        public static function get__slots(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $account = static::account();
            if (!$account) {
                return static::denied();
            }
            return ExpertSlotsService::slotsPage($globals, $account, static::render($globals->getUri()));
        }

        public static function post__userPreview(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $account = static::account();
            if (!$account) {
                return static::denied();
            }
            return ExpertSlotsService::userPreview($globals, $account);
        }

        public static function post__slots(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $account = static::account();
            if (!$account) {
                return static::denied();
            }
            if (!static::mayMutate($account)) {
                return static::deniedNotApproved();
            }
            return ExpertSlotsService::createSlot($globals, $account);
        }

        public static function post__batchPreview(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $account = static::account();
            if (!$account) {
                return static::denied();
            }
            return ExpertSlotsService::batchPreview($globals, $account);
        }

        public static function post__batchSlots(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $account = static::account();
            if (!$account) {
                return static::denied();
            }
            if (!static::mayMutate($account)) {
                return static::deniedNotApproved();
            }
            return ExpertSlotsService::batchSlots($globals, $account);
        }

        public static function post__editSlot(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $account = static::account();
            if (!$account) {
                return static::denied();
            }
            if (!static::mayMutate($account)) {
                return static::deniedNotApproved();
            }
            return ExpertSlotsService::editSlot($globals, $account);
        }

        public static function post__deleteSlot(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $account = static::account();
            if (!$account) {
                return static::denied();
            }
            if (!static::mayMutate($account)) {
                return static::deniedNotApproved();
            }
            return ExpertSlotsService::deleteSlot($globals, $account);
        }

        // ── Бронирования ───────────────────────────────────────────────

        public static function get__bookings(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $account = static::account();
            if (!$account) {
                return static::denied();
            }
            return ExpertBookingsService::bookingsPage($globals, $account, static::render($globals->getUri()));
        }

        public static function post__confirmBooking(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $account = static::account();
            if (!$account) {
                return static::denied();
            }
            if (!static::mayMutate($account)) {
                return static::deniedNotApproved();
            }
            return ExpertBookingsService::confirmBooking($globals, $account);
        }

        public static function post__cancelBooking(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $account = static::account();
            if (!$account) {
                return static::denied();
            }
            if (!static::mayMutate($account)) {
                return static::deniedNotApproved();
            }
            return ExpertBookingsService::cancelBooking($globals, $account);
        }

        public static function post__cancelBookedSlot(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $account = static::account();
            if (!$account) {
                return static::denied();
            }
            if (!static::mayMutate($account)) {
                return static::deniedNotApproved();
            }
            return ExpertBookingsService::cancelBookedSlot($globals, $account);
        }

        public static function post__cancelSlot(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $account = static::account();
            if (!$account) {
                return static::denied();
            }
            if (!static::mayMutate($account)) {
                return static::deniedNotApproved();
            }
            return ExpertBookingsService::cancelSlot($globals, $account);
        }
    }
}
