import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {resolvedUserTz} from '@common/Utils/Time/DateUtils';
import {
    CalendarPagerCounts,
    PagerCountItem,
} from '../../../../Common/booking/formatting/CalendarPagerCounts';
import {WeekTodayChip} from './WeekTodayChip';

const slotsPrevWeek = t.Slots_PrevWeek;
const slotsNextWeek = t.Slots_NextWeek;

interface WeekNavigationProps {
    weekStartUnix: number;
    weekEndUnix: number;
    onPrev: () => void;
    onNext: () => void;
    onToday: () => void;
    /** Slot counts (by kind) in the weeks before / after the current one. */
    prevCounts?: PagerCountItem[];
    nextCounts?: PagerCountItem[];
    /** Slot stats for the currently shown week — rendered above the date. */
    weekCounts?: PagerCountItem[];
}

/** Выбирает язык форматирования дат приложения. */
function appLocale(): string {
    const lang =
        (typeof window !== 'undefined' &&
            (window as Window & {__GARNET_UI_LANG__?: string})
                .__GARNET_UI_LANG__) ||
        'RU';
    return lang === 'RU' ? 'ru-RU' : 'en-US';
}

/** Разбирает дату недели на локализованные части. */
function fmtRangeParts(
    ts: number,
    opts: Intl.DateTimeFormatOptions,
): {day: string; month: string; year: string} {
    const tz = resolvedUserTz();
    const parts = new Intl.DateTimeFormat(appLocale(), {
        timeZone: tz,
        ...opts,
    }).formatToParts(new Date(ts * 1000));
    const get = (type: string): string =>
        parts.find((p) => p.type === type)?.value ?? '';
    return {day: get('day'), month: get('month'), year: get('year')};
}

/** Форматирует диапазон дат текущей недели. */
function formatRange(startUnix: number, endUnix: number): string {
    const s = fmtRangeParts(startUnix, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
    const e = fmtRangeParts(endUnix - 1, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
    if (s.year === e.year && s.month === e.month) {
        return `${s.day}–${e.day} ${e.month} ${e.year}`;
    }
    if (s.year === e.year) {
        return `${s.day} ${s.month} – ${e.day} ${e.month} ${e.year}`;
    }
    return `${s.day} ${s.month} ${s.year} – ${e.day} ${e.month} ${e.year}`;
}

/** Рисует навигацию по неделям календаря. */
export const WeekNavigation: React.FC<WeekNavigationProps> = ({
    weekStartUnix,
    weekEndUnix,
    onPrev,
    onNext,
    onToday,
    prevCounts,
    nextCounts,
    weekCounts,
}) => {
    return (
        <div className="calendar-week-pager" data-test-id="week-navigation">
            <div className="calendar-pager-side">
                <button
                    className="calendar-pager-arrow"
                    onClick={onPrev}
                    title={slotsPrevWeek()}
                    aria-label={slotsPrevWeek()}
                    data-test-id="week-prev"
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <polyline points="10 12 6 8 10 4" />
                    </svg>
                </button>
                {prevCounts && (
                    <CalendarPagerCounts items={prevCounts} side="prev" />
                )}
            </div>

            <div className="calendar-pager-center">
                {weekCounts && (
                    <CalendarPagerCounts items={weekCounts} side="now" />
                )}
                <div className="calendar-pager-range">
                    <span className="calendar-week-title">
                        {formatRange(weekStartUnix, weekEndUnix)}
                    </span>
                    <WeekTodayChip
                        weekStartUnix={weekStartUnix}
                        weekEndUnix={weekEndUnix}
                        onToday={onToday}
                    />
                </div>
            </div>

            <div className="calendar-pager-next">
                {nextCounts && (
                    <CalendarPagerCounts items={nextCounts} side="next" />
                )}
                <button
                    className="calendar-pager-arrow"
                    onClick={onNext}
                    title={slotsNextWeek()}
                    aria-label={slotsNextWeek()}
                    data-test-id="week-next"
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <polyline points="6 4 10 8 6 12" />
                    </svg>
                </button>
            </div>
        </div>
    );
};
