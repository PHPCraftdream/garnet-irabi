import {weekStartTs} from '@common/Utils/Time/DateUtils/week/weekStartTs';
import {addDaysTs} from '@common/Utils/Time/DateUtils/week/addDaysTs';
import {tsToInputDate} from '@common/Utils/Time/DateUtils/input/tsToInputDate';
import type {DayInfo, SlotItem} from '@/Islands/User/SlotsCalendar/State/view/types';
import {sortByStart} from './sortByStart';

/** Builds the visible calendar week and groups its slots by date. */
export function getCalendarWeek(
    filteredSlots: readonly SlotItem[],
    weekOffset: number,
) {
    const nowSec = Math.floor(Date.now() / 1000);
    const currentWeekStart = weekStartTs(nowSec);
    const wsUnix = addDaysTs(currentWeekStart, weekOffset * 7);
    const weekEndUnix = addDaysTs(wsUnix, 7);
    const todayStr = tsToInputDate(nowSec);
    const days: DayInfo[] = [];
    for (let i = 0; i < 7; i++) {
        const dayTs = addDaysTs(wsUnix, i);
        const dateStr = tsToInputDate(dayTs);
        days.push({
            dayTs,
            dayOfWeek: i,
            dateStr,
            dayNum: dateStr.slice(8, 10),
            isToday: dateStr === todayStr,
            isPast: dateStr < todayStr,
        });
    }

    const slotsByDay = new Map<string, SlotItem[]>();
    for (const day of days) slotsByDay.set(day.dateStr, []);
    for (const slot of filteredSlots) {
        if (slot.start_at >= wsUnix && slot.start_at < weekEndUnix) {
            const key = tsToInputDate(slot.start_at);
            const arr = slotsByDay.get(key);
            if (arr) arr.push(slot);
        }
    }
    let weekSlotCount = 0;
    for (const [key, arr] of slotsByDay) {
        slotsByDay.set(key, sortByStart(arr));
        weekSlotCount += arr.length;
    }
    return {
        weekStartUnix: wsUnix,
        weekEndUnix,
        days,
        slotsByDay,
        weekSlotCount,
    };
}
