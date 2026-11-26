import * as React from 'react';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {translateStatus} from '@/Common/booking/status/statusHelpers';
import {CalendarPagerCounts, PagerCountItem} from '@/Common/booking/formatting/CalendarPagerCounts';
import {PAGER_KINDS} from './logic/calendarHelpers';

const slotsPrevWeek = t.Slots_PrevWeek;
const slotsToday = t.Slots_Today;
const slotsNextWeek = t.Slots_NextWeek;

export type PagerKind = typeof PAGER_KINDS[number];
export type PagerCounts = Record<PagerKind, number>;

const pagerItems = (counts: PagerCounts): PagerCountItem[] =>
    PAGER_KINDS.map(k => ({
        key: k,
        count: counts[k],
        label: k === 'pending' ? t.Slot_Filter_Pending() : translateStatus(k),
        kind: k,
    }));

const Chevron: React.FC<{points: string}> = ({points}) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round">
        <polyline points={points} />
    </svg>
);

interface Props {
    rangeLabel: string;
    weekOffset: number;
    prevCounts: PagerCounts;
    nextCounts: PagerCounts;
    windowCounts: PagerCounts;
    onPrev: () => void;
    onNext: () => void;
    onToday: () => void;
    /** Вид, подсвечиваемый активным фильтром списка (см. CalendarPagerCounts). */
    activeKind?: PagerKind;
}

/**
 * Перелистывание окна недель. Счётчики по бокам говорят, сколько занятий
 * осталось за пределами видимого окна, — иначе непонятно, есть ли смысл
 * листать дальше.
 */
export const CalendarPager: React.FC<Props> = ({
    rangeLabel,
    weekOffset,
    prevCounts,
    nextCounts,
    windowCounts,
    onPrev,
    onNext,
    onToday,
    activeKind,
}) => (
    <div className="calendar-expert-pager" data-test-id="expert-week-nav">
        <div className="calendar-pager-side">
            <button
                className="calendar-pager-arrow"
                onClick={onPrev}
                title={slotsPrevWeek()}
                aria-label={slotsPrevWeek()}
                data-test-id="expert-week-prev"
            >
                <Chevron points="10 12 6 8 10 4" />
            </button>
            <CalendarPagerCounts items={pagerItems(prevCounts)} side="prev" activeKey={activeKind} />
        </div>

        <div className="calendar-pager-center">
            <CalendarPagerCounts items={pagerItems(windowCounts)} side="now" activeKey={activeKind} />
            <div className="calendar-pager-range">
                <span className="calendar-expert-title">{rangeLabel}</span>
                {weekOffset !== 0 && (
                    <button className="slot-filter-chip" onClick={onToday} data-test-id="expert-week-today">
                        {slotsToday()}
                    </button>
                )}
            </div>
        </div>

        <div className="calendar-pager-next">
            <CalendarPagerCounts items={pagerItems(nextCounts)} side="next" activeKey={activeKind} />
            <button
                className="calendar-pager-arrow"
                onClick={onNext}
                title={slotsNextWeek()}
                aria-label={slotsNextWeek()}
                data-test-id="expert-week-next"
            >
                <Chevron points="6 4 10 8 6 12" />
            </button>
        </div>
    </div>
);
