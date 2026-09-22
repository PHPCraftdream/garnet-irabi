import {useMemo} from 'react';
import {formatDateShort, weekStartTs, addDaysTs, tsToInputDate} from '@common/Utils/Time/DateUtils';
import {Slot} from '../../types';
import {CalendarDay} from './CalendarDayColumn';
import {PagerCounts} from './CalendarPager';
import {emptyCounts, slotKind} from './calendarHelpers';

export const PAGE_WEEKS = 4;

export interface CalendarWeek {
    days: CalendarDay[];
    slotsByDay: Map<string, Slot[]>;
}

interface Result {
    weeks: CalendarWeek[];
    rangeLabel: string;
    prevCounts: PagerCounts;
    nextCounts: PagerCounts;
    windowCounts: PagerCounts;
}

/**
 * Окно из PAGE_WEEKS недель, начиная со смещения, и подсчёт того, что осталось
 * за его пределами.
 *
 * Все недели окна строятся всегда, даже пустые: так перелистывание
 * предсказуемо, и ни одно занятие не оказывается недостижимым — включая
 * забронированные, попавшие за границу исходного окна.
 */
export const useCalendarWeeks = (
    slots: Slot[],
    filteredSlots: Slot[],
    weekOffset: number,
    nowSec: number,
): Result => {
    const todayIso = tsToInputDate(nowSec);

    const {weeks, rangeLabel, windowStartUnix, windowEndUnix} = useMemo(() => {
        const baseWeekStart = addDaysTs(weekStartTs(nowSec), weekOffset * 7);
        const result: CalendarWeek[] = [];

        for (let w = 0; w < PAGE_WEEKS; w++) {
            const wsUnix = addDaysTs(baseWeekStart, w * 7);
            const weekEndUnix = addDaysTs(wsUnix, 7);

            const days: CalendarDay[] = [];
            for (let i = 0; i < 7; i++) {
                const dayTs = addDaysTs(wsUnix, i);
                const dayIso = tsToInputDate(dayTs);
                days.push({
                    dateStr: dayIso,
                    dayLabelStr: formatDateShort(dayTs),
                    dayOfWeek: i,
                    isToday: dayIso === todayIso,
                    dayIso,
                });
            }

            const map = new Map<string, Slot[]>();
            for (const day of days) map.set(day.dateStr, []);

            for (const slot of filteredSlots) {
                if (slot.start_at >= wsUnix && slot.start_at < weekEndUnix) {
                    map.get(tsToInputDate(slot.start_at))?.push(slot);
                }
            }
            for (const arr of map.values()) arr.sort((a, b) => a.start_at - b.start_at);

            result.push({days, slotsByDay: map});
        }

        const first = result[0].days[0];
        const last = result[result.length - 1].days[6];

        return {
            weeks: result,
            rangeLabel: `${first.dayLabelStr} – ${last.dayLabelStr}`,
            windowStartUnix: baseWeekStart,
            windowEndUnix: addDaysTs(baseWeekStart, PAGE_WEEKS * 7),
        };
    }, [filteredSlots, nowSec, todayIso, weekOffset]);

    // Счёт ведётся по всем занятиям, а не по отфильтрованным: подсказка должна
    // говорить, что вообще есть за окном, а не что осталось после фильтра.
    const {prevCounts, nextCounts, windowCounts} = useMemo(() => {
        const prev = emptyCounts();
        const next = emptyCounts();
        const win = emptyCounts();

        for (const s of slots) {
            const k = slotKind(s);
            if (!k) continue;
            if (s.start_at < windowStartUnix) prev[k]++;
            else if (s.start_at >= windowEndUnix) next[k]++;
            else win[k]++;
        }

        return {prevCounts: prev, nextCounts: next, windowCounts: win};
    }, [slots, windowStartUnix, windowEndUnix]);

    return {weeks, rangeLabel, prevCounts, nextCounts, windowCounts};
};
