<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Params {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Bundle\I18n\FwI18n;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Io\Router\RouterUriParams;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;
    use PHPCraftdream\IRabi\Dashboard\Controllers\DashboardMainController;
    use PHPCraftdream\IRabi\Dashboard\Controllers\DashboardUsersController;
    use PHPCraftdream\IRabi\Foreground\Controllers\BookingsController;
    use PHPCraftdream\IRabi\Foreground\Controllers\ExpertPanelController;
    use PHPCraftdream\IRabi\Foreground\Controllers\SlotsController;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use PHPCraftdream\IRabi\IRabi;

    class Menu {
        private static function isSection(string $url, string $sectionUrl): bool {
            $section = rtrim($sectionUrl, '/');
            return $url === $section || str_starts_with($url, $section . '/') || str_starts_with($url, $section . '~');
        }

        public static function side(string $url): array {
            return [];
        }

        public static function main(string $url): array {
            $t = ForegroundI18n::getInstance();
            $tf = FwI18n::getInstance();

            // The current URI carries the dynamic scope prefix (e.g. /system/…)
            // while the section URLs below are bare (/slots, /bookings). Strip
            // the prefix once so the isSection() comparisons line up — otherwise
            // nothing ever matches and no item highlights.
            $url = static::stripScopePrefix(static::stripQuery($url));

            $isModerator = UserEntityConfig::isModerator();
            $isHomeUrl = $url === '/' || $url === '';
            $isSlotsSection = static::isSection($url, SlotsController::URL);
            $isBookingsSection = static::isSection($url, BookingsController::URL);
            $isMySlotsSection = $url === ExpertPanelController::URL . '~slots';
            $isAdminSection = static::isSection($url, DashboardUsersController::URL)
                || static::isSection($url, '/admin/');

            $items = [];

            $items[] = [
                'label' => $tf->MainPage(),
                'href' => IRabi::url('/'),
                'icon' => 'columns',
                'active' => $isHomeUrl,
            ];

            $items[] = [
                'label' => $t->Menu_BrowseSlots(),
                'href' => IRabi::url(SlotsController::URL),
                'icon' => 'calendar3',
                'active' => $isSlotsSection,
            ];
            $bookingsItem = [
                'id' => 'bookings',
                'label' => $t->Menu_Bookings(),
                'href' => IRabi::url(BookingsController::URL),
                'icon' => 'bookmark',
                'active' => $isBookingsSection,
            ];

            if (UserEntityConfig::isExpert()) {
                $pendingCount = static::expertPendingBookingsCount();
                if ($pendingCount > 0) {
                    $bookingsItem['badge'] = $pendingCount;
                }
            }

            $items[] = $bookingsItem;

            if (UserEntityConfig::isExpert()) {
                $items[] = [
                    'label' => $t->Menu_ManageSlots(),
                    'href' => IRabi::url(ExpertPanelController::URL . '~slots'),
                    'icon' => 'people',
                    'active' => $isMySlotsSection,
                ];
            }

            if ($isModerator) {
                $items[] = [
                    'label' => $tf->Menu_DashBoard(),
                    'href' => IRabi::url(rtrim(DashboardMainController::URL, '/')),
                    'icon' => 'gear',
                    'active' => $isAdminSection,
                ];
            }

            return $items;
        }

        /**
         * Count of pending bookings on slots owned by the current expert account.
         * Used to badge the "Брони" menu item for experts (server-render and the
         * live ~counts poll).
         */
        public static function expertPendingBookingsCount(): int {
            $account = Account::fromSession();
            if ($account === null) {
                return 0;
            }
            $expertId = $account->id();

            $slotIds = array_column(TimeSlots::get()->selectByField('expert_id', $expertId), 'id');
            if (empty($slotIds)) {
                return 0;
            }

            $rows = Bookings::get()->selectAll(function (SelectInterface $query) use ($slotIds): void {
                $query->resetCols()->cols(['COUNT(*) as cnt'])
                    ->where('bookable_type = :btype', ['btype' => 'time_slot'])
                    ->where('status = :st', ['st' => 'pending'])
                    ->where('bookable_id IN (:slot_ids)', ['slot_ids' => array_map('intval', $slotIds)]);
            });

            return (int)($rows[0]['cnt'] ?? 0);
        }

        public static function item(string $label, string $url, string $icon, string $currentUrl, bool $strict = false): array {
            $isRootUrl = $url === '/';

            // Normalise both URLs into the same scope-coordinate space before
            // comparing — router accepts both prefixed (/system/admin/...)
            // and bare (/admin/...) forms, so the active-class logic must
            // tolerate either side carrying the prefix.
            $normUrl = static::stripScopePrefix($url);
            $normCur = static::stripScopePrefix(static::stripQuery($currentUrl));

            if ($strict) {
                $active = rtrim($normUrl, '/') === rtrim($normCur, '/');
            } else {
                $active = $isRootUrl ?
                    ($normCur === $normUrl || str_starts_with($normCur, '/~')) :
                    str_contains(trim($normCur, '/'), trim($normUrl, '/'));
            }

            return [
                'label' => $label,
                'href' => $isRootUrl ? '/' : rtrim($url, '/'),
                'icon' => $icon,
                'active' => $active,
            ];
        }

        private static function stripScopePrefix(string $url): string {
            $prefix = RouterUriParams::getRoutePrefix();
            if ($prefix !== '' && str_starts_with($url, $prefix)) {
                $rest = substr($url, strlen($prefix));
                return $rest === '' ? '/' : $rest;
            }
            return $url;
        }

        private static function stripQuery(string $url): string {
            $pos = strpos($url, '?');
            return $pos === false ? $url : substr($url, 0, $pos);
        }
    }
}
