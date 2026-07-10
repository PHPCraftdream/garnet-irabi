<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Dashboard\Controllers {
    use PHPCraftdream\Garnet\Bundle\Modules\EntityHistory\Controllers\FwEntityHistoryController;
    use PHPCraftdream\IRabi\Common\Tables\EntityHistory;
    use PHPCraftdream\IRabi\Dashboard\IrabiDashboardMenuTrait;

    /**
     * IRabi-side wiring for the generic entity-history endpoint.
     *
     * Single endpoint POST /admin/entity-history/~list expects
     * { entity_type, entity_id, limit?, offset? } and returns the
     * recent change log for that record.
     *
     * Allowed entity_type tokens are whitelisted here so callers cannot
     * scrape unrelated entities.
     */
    class DashboardEntityHistoryController extends FwEntityHistoryController {
        use IrabiDashboardMenuTrait;

        public const URL = '/admin/entity-history/';

        protected static function historyTableClass(): string {
            return EntityHistory::class;
        }

        protected static function allowedEntityTypes(): array {
            return [
                'account',         // флаги на пользователях (IS_APPROVED, IS_DISABLED, ...)
                'expert_profile',  // профиль эксперта
                'static_page',     // страница (мета)
                'static_block',    // блок страницы
                'static_snippet',  // сниппет
                'invite_token',    // токены приглашения
                'app_settings',    // системные настройки
                'booking',         // изменения статусов бронирований
            ];
        }
    }
}
