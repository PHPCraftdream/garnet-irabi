import type {SlotItem, SlotStatusFilter} from './types';
import {applyCalendarFilters} from '@/Islands/User/SlotsCalendar/State/filters/applyCalendarFilters';
import {applyStatusFilter} from '@/Islands/User/SlotsCalendar/State/filters/applyStatusFilter';
import {getCalendarWeek} from '@/Islands/User/SlotsCalendar/State/calendar/getCalendarWeek';
import {getEffectiveBookedIds} from '@/Islands/User/SlotsCalendar/State/calendar/getEffectiveBookedIds';
import {getPagerCounts} from '@/Islands/User/SlotsCalendar/State/calendar/getPagerCounts';
import {indexSlotStatuses} from '@/Islands/User/SlotsCalendar/State/calendar/indexSlotStatuses';
import type {ReadonlyFiltersState} from '@/Islands/User/SlotsCalendar/State/filters/slotsCalendarSelectors';

type SlotStatusesView = Readonly<Record<string, string>>;
type WeekData = ReturnType<typeof getCalendarWeek>;
type PagerCounts = ReturnType<typeof getPagerCounts>;

export interface CalendarDerived {
    slotStatusById: Map<number, string>;
    effectiveBookedIds: Set<number>;
    propertyFilteredSlots: SlotItem[];
    filteredSlots: readonly SlotItem[];
    weekData: WeekData;
    pagerCounts: PagerCounts;
    hasAnyFilteredSlots: boolean;
}

/**
  * Производные значения календаря с кэшем по входам: повторный расчёт с теми же
  * ссылками возвращает прежний результат, как это делал прежний набор useMemo.
  */
export class SlotsCalendarView {
    private statuses?: { slots: readonly SlotItem[]; value: Map<number, string> };
    private booked?: {
        bookedIds: readonly number[];
        slotStatuses: SlotStatusesView;
        slotStatusById: Map<number, string>;
        value: Set<number>;
    };
    private propertyFiltered?: {
        slots: readonly SlotItem[];
        filters: ReadonlyFiltersState;
        value: SlotItem[];
    };
    private filtered?: {
        propertyFilteredSlots: readonly SlotItem[];
        statusFilter: SlotStatusFilter;
        effectiveBookedIds: ReadonlySet<number>;
        slotStatuses: SlotStatusesView;
        value: readonly SlotItem[];
    };
    private week?: {
        filteredSlots: readonly SlotItem[];
        weekOffset: number;
        value: WeekData;
    };
    private pager?: {
        propertyFilteredSlots: readonly SlotItem[];
        weekStartUnix: number;
        weekEndUnix: number;
        effectiveBookedIds: ReadonlySet<number>;
        slotStatuses: SlotStatusesView;
        value: PagerCounts;
    };

    /** Обновляет данные календаря. */
    private resolveStatuses(slots: readonly SlotItem[]): Map<number, string> {
        if (this.statuses && this.statuses.slots === slots)
            return this.statuses.value;
        const value = indexSlotStatuses(slots);
        this.statuses = { slots, value };
        return value;
    }

    /** Обновляет данные календаря. */
    private resolveBookedIds(
        bookedIds: readonly number[],
        slotStatuses: SlotStatusesView,
        slotStatusById: Map<number, string>,
    ): Set<number> {
        if (
            this.booked &&
            this.booked.bookedIds === bookedIds &&
            this.booked.slotStatuses === slotStatuses &&
            this.booked.slotStatusById === slotStatusById
        )
            return this.booked.value;
        const value = getEffectiveBookedIds(
            bookedIds,
            slotStatuses,
            slotStatusById,
        );
        this.booked = { bookedIds, slotStatuses, slotStatusById, value };
        return value;
    }

    /** Обновляет данные календаря. */
    private resolvePropertyFiltered(
        slots: readonly SlotItem[],
        filters: ReadonlyFiltersState,
    ): SlotItem[] {
        if (
            this.propertyFiltered &&
            this.propertyFiltered.slots === slots &&
            this.propertyFiltered.filters === filters
        ) {
            return this.propertyFiltered.value;
        }
        const value = applyCalendarFilters(slots, filters);
        this.propertyFiltered = { slots, filters, value };
        return value;
    }

    /** Обновляет данные календаря. */
    private resolveFiltered(
        propertyFilteredSlots: readonly SlotItem[],
        statusFilter: SlotStatusFilter,
        effectiveBookedIds: ReadonlySet<number>,
        slotStatuses: SlotStatusesView,
    ): readonly SlotItem[] {
        if (
            this.filtered &&
            this.filtered.propertyFilteredSlots === propertyFilteredSlots &&
            this.filtered.statusFilter === statusFilter &&
            this.filtered.effectiveBookedIds === effectiveBookedIds &&
            this.filtered.slotStatuses === slotStatuses
        )
            return this.filtered.value;
        const value: readonly SlotItem[] = applyStatusFilter(
            propertyFilteredSlots,
            statusFilter,
            effectiveBookedIds,
            slotStatuses,
        );
        this.filtered = {
            propertyFilteredSlots,
            statusFilter,
            effectiveBookedIds,
            slotStatuses,
            value,
        };
        return value;
    }

    /** Обновляет данные календаря. */
    private resolveWeek(
        filteredSlots: readonly SlotItem[],
        weekOffset: number,
    ): WeekData {
        if (
            this.week &&
            this.week.filteredSlots === filteredSlots &&
            this.week.weekOffset === weekOffset
        ) {
            return this.week.value;
        }
        const value = getCalendarWeek(filteredSlots, weekOffset);
        this.week = { filteredSlots, weekOffset, value };
        return value;
    }

    /** Обновляет данные календаря. */
    private resolvePager(
        propertyFilteredSlots: readonly SlotItem[],
        weekStartUnix: number,
        weekEndUnix: number,
        effectiveBookedIds: ReadonlySet<number>,
        slotStatuses: SlotStatusesView,
    ): PagerCounts {
        if (
            this.pager &&
            this.pager.propertyFilteredSlots === propertyFilteredSlots &&
            this.pager.weekStartUnix === weekStartUnix &&
            this.pager.weekEndUnix === weekEndUnix &&
            this.pager.effectiveBookedIds === effectiveBookedIds &&
            this.pager.slotStatuses === slotStatuses
        )
            return this.pager.value;
        const value = getPagerCounts(
            propertyFilteredSlots,
            weekStartUnix,
            weekEndUnix,
            effectiveBookedIds,
            slotStatuses,
        );
        this.pager = {
            propertyFilteredSlots,
            weekStartUnix,
            weekEndUnix,
            effectiveBookedIds,
            slotStatuses,
            value,
        };
        return value;
    }

    /** Собирает отображаемые данные календаря. */
    public derive(
        slots: readonly SlotItem[],
        bookedIds: readonly number[],
        slotStatuses: SlotStatusesView,
        filters: ReadonlyFiltersState,
        statusFilter: SlotStatusFilter,
        weekOffset: number,
    ): CalendarDerived {
        const slotStatusById = this.resolveStatuses(slots);
        const effectiveBookedIds = this.resolveBookedIds(
            bookedIds,
            slotStatuses,
            slotStatusById,
        );
        const propertyFilteredSlots = this.resolvePropertyFiltered(slots, filters);
        const filteredSlots = this.resolveFiltered(
            propertyFilteredSlots,
            statusFilter,
            effectiveBookedIds,
            slotStatuses,
        );
        const weekData = this.resolveWeek(filteredSlots, weekOffset);
        const pagerCounts = this.resolvePager(
            propertyFilteredSlots,
            weekData.weekStartUnix,
            weekData.weekEndUnix,
            effectiveBookedIds,
            slotStatuses,
        );
        return {
            slotStatusById,
            effectiveBookedIds,
            propertyFilteredSlots,
            filteredSlots,
            weekData,
            pagerCounts,
            hasAnyFilteredSlots: filteredSlots.length > 0,
        };
    }
}
