import {formatDateShort, weekStartTs, addDaysTs, tsToInputDate} from '@common/Utils/Time/DateUtils';
import type {Slot} from '../../../types';
import type {CalendarWeek} from './CalendarWeek';
import {PAGE_WEEKS} from './PAGE_WEEKS';

/** Сравнить занятия по времени начала. */
function compareSlotStart(a: Slot, b: Slot): number {
    return a.start_at - b.start_at;
}

/** Построить окно календарных недель и сгруппировать занятия по дате. */
export function buildCalendarWindow(
    filteredSlots: readonly Slot[],
    weekOffset: number,
    nowSec: number,
    todayIso: string,
) {
    const baseWeekStart = addDaysTs(weekStartTs(nowSec), weekOffset * 7);
    const result: CalendarWeek[] = [];

    for (let week = 0; week < PAGE_WEEKS; week++) {
        const wsUnix = addDaysTs(baseWeekStart, week * 7);
        const weekEndUnix = addDaysTs(wsUnix, 7);
        const days: CalendarWeek['days'] = [];
        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
            const dayTs = addDaysTs(wsUnix, dayIndex);
            const dayIso = tsToInputDate(dayTs);
            days.push({
                dateStr: dayIso,
                dayLabelStr: formatDateShort(dayTs),
                dayOfWeek: dayIndex,
                isToday: dayIso === todayIso,
                dayIso,
            });
        }

        const slotsByDay = new Map<string, Slot[]>();
        for (const day of days) slotsByDay.set(day.dateStr, []);
        for (const slot of filteredSlots) {
            if (slot.start_at >= wsUnix && slot.start_at < weekEndUnix) {
                slotsByDay.get(tsToInputDate(slot.start_at))?.push(slot);
            }
        }
        for (const daySlots of slotsByDay.values()) daySlots.sort(compareSlotStart);
        result.push({days, slotsByDay});
    }

    const first = result[0].days[0];
    const last = result[result.length - 1].days[6];
    return {
        weeks: result,
        rangeLabel: `${first.dayLabelStr} – ${last.dayLabelStr}`,
        windowStartUnix: baseWeekStart,
        windowEndUnix: addDaysTs(baseWeekStart, PAGE_WEEKS * 7),
    };
}
