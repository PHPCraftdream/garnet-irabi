import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {translateStatus} from '../../../../Common/statusHelpers';
import {CalendarPagerCounts, PagerCountItem} from '../../../../Common/CalendarPagerCounts';
import {Slot} from '../../types';

export const PAGER_KINDS = ['free', 'pending', 'booked', 'completed'] as const;
export type PagerKind = typeof PAGER_KINDS[number];
export type PagerCounts = Record<PagerKind, number>;

/** Отнести слот к виду для подсказки пагинатора; отменённые не считаются. */
export const slotKind = (s: Slot): PagerKind | null => {
    if (s.status === 'free') return 'free';
    if (s.status === 'completed') return 'completed';
    if (s.status === 'booked') return s.booking_status === 'pending' ? 'pending' : 'booked';
    return null;
};

export const emptyCounts = (): PagerCounts => ({free: 0, pending: 0, booked: 0, completed: 0});

const pagerItems = (counts: PagerCounts): PagerCountItem[] =>
    PAGER_KINDS.map(k => ({
        key: k,
        count: counts[k],
        label: k === 'pending' ? t.Slot_Filter_Pending() : translateStatus(k),
        cls: `cal-nav-badge--${k}`,
    }));

const Chevron: React.FC<{points: string}> = ({points}) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    <div className="grid grid-cols-3 items-center gap-3 mb-2" data-test-id="expert-week-nav">
        <div className="flex items-center gap-2 min-w-0">
            <button
                className="btn-icon-round"
                onClick={onPrev}
                title={t.Slots_PrevWeek()}
                aria-label={t.Slots_PrevWeek()}
                data-test-id="expert-week-prev"
            >
                <Chevron points="10 12 6 8 10 4" />
            </button>
            <CalendarPagerCounts items={pagerItems(prevCounts)} side="prev" activeKey={activeKind} />
        </div>

        <div className="flex flex-col items-center gap-1 min-w-0">
            <CalendarPagerCounts items={pagerItems(windowCounts)} side="now" activeKey={activeKind} />
            <div className="flex items-center gap-2 flex-wrap justify-center">
                <span className="text-sm font-semibold text-on-surface">{rangeLabel}</span>
                {weekOffset !== 0 && (
                    <button className="chip" onClick={onToday} data-test-id="expert-week-today">
                        {t.Slots_Today()}
                    </button>
                )}
            </div>
        </div>

        <div className="flex items-center gap-2 min-w-0 justify-end">
            <CalendarPagerCounts items={pagerItems(nextCounts)} side="next" activeKey={activeKind} />
            <button
                className="btn-icon-round"
                onClick={onNext}
                title={t.Slots_NextWeek()}
                aria-label={t.Slots_NextWeek()}
                data-test-id="expert-week-next"
            >
                <Chevron points="6 4 10 8 6 12" />
            </button>
        </div>
    </div>
);
