<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\System {
    use PHPCraftdream\Garnet\Bundle\Modules\SystemSettings\FwAppSettings;
    use PHPCraftdream\Garnet\Kernel\Io\IniConfig\IniConfig;

    class AppSettings extends FwAppSettings {
        /**
         * App-wide default cancellation penalty percent (0..100).
         * Used as the fallback when an expert creates a slot without
         * specifying an override value.
         */
        public static function cancellationPenaltyPercent(): int {
            return parent::cancellationPenaltyPercent();
        }

        /**
         * D-137: without this flag a logged-out visitor hitting the catalog or
         * an expert card is silently swapped to the login form — no leak (no
         * name, no photo), but no explanation either. Owner's decision:
         * guests stay blocked by default; this is a raw ini switch, not an
         * admin-panel toggle — there is no product decision yet about what a
         * public catalog should even show a guest.
         */
        public static function publicCatalogEnabled(): bool {
            return IniConfig::app()->paramBool('public_catalog_enabled', false);
        }
    }
}
