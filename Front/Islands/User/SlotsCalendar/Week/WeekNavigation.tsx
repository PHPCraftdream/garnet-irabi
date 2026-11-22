import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {resolvedUserTz} from '@common/Utils/Time/DateUtils';
import {CalendarPagerCounts, PagerCountItem} from '../../../../Common/booking/CalendarPagerCounts';

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

function appLocale(): string {
    const lang = (typeof window !== 'undefined' && (window as Window & {__GARNET_UI_LANG__?: string}).__GARNET_UI_LANG__) || 'RU';
    return lang === 'RU' ? 'ru-RU' : 'en-US';
}

function fmtRangeParts(ts: number, opts: Intl.DateTimeFormatOptions): {day: string; month: string; year: string} {
    const tz = resolvedUserTz();
    const parts = new Intl.DateTimeFormat(appLocale(), {timeZone: tz, ...opts}).formatToParts(new Date(ts * 1000));
    const get = (type: string): string => parts.find(p => p.type === type)?.value ?? '';
    return {day: get('day'), month: get('month'), year: get('year')};
}

function formatRange(startUnix: number, endUnix: number): string {
    const s = fmtRangeParts(startUnix, {day: 'numeric', month: 'long', year: 'numeric'});
    const e = fmtRangeParts(endUnix - 1, {day: 'numeric', month: 'long', year: 'numeric'});
    if (s.year === e.year && s.month === e.month) {
        return `${s.day}–${e.day} ${e.month} ${e.year}`;
    }
    if (s.year === e.year) {
        return `${s.day} ${s.month} – ${e.day} ${e.month} ${e.year}`;
    }
    return `${s.day} ${s.month} ${s.year} – ${e.day} ${e.month} ${e.year}`;
}

export const WeekNavigation: React.FC<WeekNavigationProps> = ({weekStartUnix, weekEndUnix, onPrev, onNext, onToday, prevCounts, nextCounts, weekCounts}) => {
    const nowSec = Math.floor(Date.now() / 1000);
    const isCurrentWeek = nowSec >= weekStartUnix && nowSec < weekEndUnix;

    return (
        <div className="calendar-week-pager" data-test-id="week-navigation">
            <div className="calendar-pager-side">
                <button
                    className="calendar-pager-arrow"
                    onClick={onPrev}
                    title={t.Slots_PrevWeek()}
                    aria-label={t.Slots_PrevWeek()}
                    data-test-id="week-prev"
                >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="10 12 6 8 10 4"/></svg>
                </button>
                {prevCounts && <CalendarPagerCounts items={prevCounts} side="prev" />}
            </div>

            <div className="calendar-pager-center">
                {weekCounts && <CalendarPagerCounts items={weekCounts} side="now" />}
                <div className="calendar-pager-range">
                    <span className="calendar-week-title">
                        {formatRange(weekStartUnix, weekEndUnix)}
                    </span>
                    {!isCurrentWeek && (
                        <button
                            className="slot-filter-chip"
                            onClick={onToday}
                            title={t.Slots_Today()}
                            data-test-id="week-today"
                        >
                            {t.Slots_Today()}
                        </button>
                    )}
                </div>
            </div>

            <div className="calendar-pager-next">
                {nextCounts && <CalendarPagerCounts items={nextCounts} side="next" />}
                <button
                    className="calendar-pager-arrow"
                    onClick={onNext}
                    title={t.Slots_NextWeek()}
                    aria-label={t.Slots_NextWeek()}
                    data-test-id="week-next"
                >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 4 10 8 6 12"/></svg>
                </button>
            </div>
        </div>
    );
};
