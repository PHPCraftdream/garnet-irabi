<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Calendar {
    /**
     * Backward-compatible alias: delegates all calls to SlotDateFilterLocalized.
     *
     * Existing callers that reference this class continue to work unchanged.
     * The actual calendar logic lives in Framework\Kernel\Core\HCalendar\SlotDateFilter;
     * this localized wrapper adds human-readable reason strings via ForegroundI18n.
     */
    class SlotDateFilter extends SlotDateFilterLocalized {
    }
}
