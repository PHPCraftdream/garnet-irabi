<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\System {
    use PHPCraftdream\Garnet\Bundle\Modules\SystemSettings\FwAppSettings;

    class AppSettings extends FwAppSettings {
        /**
         * App-wide default cancellation penalty percent (0..100).
         * Used as the fallback when an expert creates a slot without
         * specifying an override value.
         */
        public static function cancellationPenaltyPercent(): int {
            return parent::cancellationPenaltyPercent();
        }
    }
}
