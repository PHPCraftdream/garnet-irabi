import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {weekStartTs, addDaysTs, tsToInputDate, tsToHour} from '@common/Utils/Time/DateUtils';
import type {DayInfo, FiltersState, SlotItem, SlotStatusFilter} from './types';
import type {PagerCountItem} from '../../../Common/booking/CalendarPagerCounts';

function compareStart(left: SlotItem, right: SlotItem): number {
    return left.start_at - right.start_at;
}

function emptyCounts() {
    return {free: 0, mine: 0};
}

function toItems(c: {free: number; mine: number}): PagerCountItem[] {
    return [
        {key: 'free', count: c.free, label: t.Slots_FilterFree(), kind: 'free'},
        {key: 'mine', count: c.mine, label: t.Slots_FilterMine(), kind: 'mine'},
    ];
}

function buildWeekDays(weekStartUnix: number, nowSec: number): DayInfo[] {
    const todayStr = tsToInputDate(nowSec);
    const days: DayInfo[] = [];
    for (let i = 0; i < 7; i++) {
        const dayTs = addDaysTs(weekStartUnix, i);
        const dateStr = tsToInputDate(dayTs);
        const dayNum = dateStr.slice(8, 10);
        days.push({
            dayTs,
            dayOfWeek: i, // 0 = Sun, deterministic since week starts Sunday
            dateStr,
            dayNum,
            isToday: dateStr === todayStr,
            isPast: dateStr < todayStr,
        });
    }
    return days;
}

export function indexSlotStatuses(slots: SlotItem[]) {
    const m = new Map<number, string>();
    for (const s of slots) m.set(s.id, s.status);
    return m;
}

export function getEffectiveBookedIds(bookedIds: number[], slotStatuses: Record<string, string>, slotStatusById: Map<number, string>) {
    const result = new Set<number>();
    for (const id of bookedIds) {
        const bookingStatus = slotStatuses[String(id)];
        if (bookingStatus === 'cancelled' && slotStatusById.get(id) === 'free') continue;
        result.add(id);
    }
    return result;
}

export function applyCalendarFilters(slots: SlotItem[], filters: FiltersState) {
    return slots.filter(slot => {
        if (filters.expertIds.size > 0 && !filters.expertIds.has(String(slot.expert_id))) return false;
        if (filters.priceMin !== '') { const min = Number(filters.priceMin); if (!isNaN(min) && slot.cost < min) return false; }
        if (filters.priceMax !== '') { const max = Number(filters.priceMax); if (!isNaN(max) && slot.cost > max) return false; }
        if (filters.timeOfDay !== 'all') {
            const hour = tsToHour(slot.start_at);
            if (filters.timeOfDay === 'morning' && hour >= 12) return false;
            if (filters.timeOfDay === 'day' && (hour < 12 || hour >= 17)) return false;
            if (filters.timeOfDay === 'evening' && hour < 17) return false;
        }
        // onlineFilter: 'all', 'online', or 'offline'
        if (filters.onlineFilter !== 'all') {
            if (filters.onlineFilter === 'online' && !slot.is_online) return false;
            if (filters.onlineFilter === 'offline' && slot.is_online) return false;
        }
        // D-149: the "Тип" filter existed on screen but never actually
        // filtered anything — a group option wasn't even offered.
        if (filters.slotType !== 'all') {
            const isGroup = (slot.max_users || 1) > 1;
            if (filters.slotType === 'individual' && isGroup) return false;
            if (filters.slotType === 'group' && !isGroup) return false;
        }
        return true;
    });
}

export function applyStatusFilter(propertyFilteredSlots: SlotItem[], statusFilter: SlotStatusFilter, effectiveBookedIds: Set<number>, slotStatuses: Record<string, string>) {
    if (statusFilter === 'all') return propertyFilteredSlots;
    const nowSec = Math.floor(Date.now() / 1000);
    return propertyFilteredSlots.filter(slot => {
        const isBooked = effectiveBookedIds.has(slot.id);
        if (statusFilter === 'free') return !isBooked;
        if (statusFilter === 'mine') return isBooked;
        if (!isBooked) return false;
        const bookingStatus = slotStatuses[String(slot.id)] || '';
        if (statusFilter === 'past') {
            return slot.start_at < nowSec && bookingStatus !== 'cancelled';
        }
        return bookingStatus === statusFilter;
    });
}

export function getCalendarWeek(filteredSlots: SlotItem[], weekOffset: number) {
    const nowSec = Math.floor(Date.now() / 1000);
    const currentWeekStart = weekStartTs(nowSec);
    const wsUnix = addDaysTs(currentWeekStart, weekOffset * 7);
    const weekEndUnix = addDaysTs(wsUnix, 7);
    const days = buildWeekDays(wsUnix, nowSec);

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
    for (const arr of slotsByDay.values()) {
        // Каждый массив создан здесь, исходный список не меняется.
        // oxlint-disable-next-line unicorn/no-array-sort
        arr.sort(compareStart);
        weekSlotCount += arr.length;
    }

    return { weekStartUnix: wsUnix, weekEndUnix, days, slotsByDay, weekSlotCount };
}

export function getPagerCounts(propertyFilteredSlots: SlotItem[], ws: number, we: number, effectiveBookedIds: Set<number>, slotStatuses: Record<string, string>) {
    const prev = emptyCounts(), next = emptyCounts(), now = emptyCounts();
    for (const s of propertyFilteredSlots) {
        const mine = effectiveBookedIds.has(s.id) && (slotStatuses[String(s.id)] || '') !== 'cancelled';
        const free = !effectiveBookedIds.has(s.id) && s.status === 'free';
        if (!mine && !free) continue;
        const bucket = s.start_at < ws ? prev : (s.start_at >= we ? next : now);
        if (mine) bucket.mine++; else bucket.free++;
    }
    return {prev: toItems(prev), next: toItems(next), now: toItems(now)};
}
