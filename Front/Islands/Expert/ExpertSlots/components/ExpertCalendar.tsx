import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {tsToInputDate} from '@common/Utils/Time/DateUtils';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {Slot} from '../types';
import {CalendarStatusFilter, StatusFilter} from './calendar/CalendarStatusFilter';
import {CalendarPager, PagerKind} from './calendar/CalendarPager';
import {ExpertCalendarWeeks} from './calendar/ExpertCalendarWeeks';
import {CalendarDragController} from './calendar/CalendarDragController';
import {buildCalendarWindow, countCalendarSlots, PAGE_WEEKS} from './calendar/calendarWeeks';

interface Props {
    slots: Slot[];
    onCancel?: (id: number) => void;
    onEdit?: (slot: Slot) => void;
    onCancelBooking?: (id: number) => void;
    onConfirmBooking?: (slot: Slot) => void;
    onDelete?: (id: number) => void;
    onUserClick?: (userId: number, userName: string) => void;
    onSlotDrop?: (slotId: number, newDateStr: string) => void;
}

const hasFreeSlot = (slot: Slot) => slot.status === 'free';
const isPendingSlot = (slot: Slot) => slot.booking_status === 'pending';
const filterSlots = (slots: Slot[], statusFilter: StatusFilter) => {
    if (statusFilter === 'all') return slots;
    if (statusFilter === 'pending') return slots.filter(isPendingSlot);
    return slots.filter(slot => slot.status === statusFilter);
};

/**
 * Календарь занятий преподавателя — сборка из четырёх частей: фильтр,
 * пагинатор, недели из колонок-дней и ячейки занятий.
 *
 * Раньше всё это лежало одним куском, и ячейка занятия оказывалась на
 * семнадцатом уровне вложенности внутри двух `map` и трёх условий: любая
 * правка ветки «что показывать на забронированном слоте» начиналась со счёта
 * отступов.
 */
export class ExpertCalendar extends AntiHookComponent<Props> {
    private readonly calendarState = new Carburetor<{statusFilter: StatusFilter; weekOffset: number}>({statusFilter: 'all', weekOffset: 0});
    private readonly drag = new CalendarDragController(() => this.props);
    private filteredCache?: {slots: Slot[]; statusFilter: StatusFilter; value: Slot[]};
    private windowCache?: {slots: Slot[]; nowSec: number; todayIso: string; weekOffset: number; value: ReturnType<typeof buildCalendarWindow>};
    private countsCache?: {slots: Slot[]; start: number; end: number; value: ReturnType<typeof countCalendarSlots>};

    private getFilteredSlots(slots: Slot[], statusFilter: StatusFilter) {
        if (!this.filteredCache || this.filteredCache.slots !== slots || this.filteredCache.statusFilter !== statusFilter) {
            this.filteredCache = {slots, statusFilter, value: filterSlots(slots, statusFilter)};
        }
        return this.filteredCache.value;
    }

    private getWindow(slots: Slot[], nowSec: number, todayIso: string, weekOffset: number) {
        const cache = this.windowCache;
        if (!cache || cache.slots !== slots || cache.nowSec !== nowSec || cache.todayIso !== todayIso || cache.weekOffset !== weekOffset) {
            this.windowCache = {slots, nowSec, todayIso, weekOffset, value: buildCalendarWindow(slots, weekOffset, nowSec, todayIso)};
        }
        return this.windowCache!.value;
    }

    private getCounts(slots: Slot[], start: number, end: number) {
        const cache = this.countsCache;
        if (!cache || cache.slots !== slots || cache.start !== start || cache.end !== end) {
            this.countsCache = {slots, start, end, value: countCalendarSlots(slots, start, end)};
        }
        return this.countsCache!.value;
    }

    private readonly setStatusFilter = (statusFilter: StatusFilter) => {
        this.calendarState.setData({...this.calendarState.getData(), statusFilter});
    };
    private readonly handlePrevPage = () => {
        const state = this.calendarState.getData();
        this.calendarState.setData({...state, weekOffset: state.weekOffset - PAGE_WEEKS});
    };
    private readonly handleNextPage = () => {
        const state = this.calendarState.getData();
        this.calendarState.setData({...state, weekOffset: state.weekOffset + PAGE_WEEKS});
    };
    private readonly handleToday = () => {
        this.calendarState.setData({...this.calendarState.getData(), weekOffset: 0});
    };

    private renderPager(rangeLabel: string, weekOffset: number, counts: ReturnType<typeof countCalendarSlots>, activeKind: PagerKind | undefined) {
        return (
            <CalendarPager
                rangeLabel={rangeLabel}
                weekOffset={weekOffset}
                prevCounts={counts.prevCounts}
                nextCounts={counts.nextCounts}
                windowCounts={counts.windowCounts}
                onPrev={this.handlePrevPage}
                onNext={this.handleNextPage}
                onToday={this.handleToday}
                activeKind={activeKind}
            />
        );
    }

    private renderWeeks(weeks: ReturnType<typeof buildCalendarWindow>['weeks'], dragOverDay: string | null, draggingSlotId: number | null) {
        const {onEdit, onCancelBooking, onConfirmBooking, onDelete, onUserClick, onSlotDrop} = this.props;
        return (
            <ExpertCalendarWeeks
                weeks={weeks}
                drag={this.drag}
                dragOverDay={dragOverDay}
                draggingSlotId={draggingSlotId}
                canDrag={!!onSlotDrop}
                onEdit={onEdit}
                onDelete={onDelete}
                onCancelBooking={onCancelBooking}
                onConfirmBooking={onConfirmBooking}
                onUserClick={onUserClick}
            />
        );
    }

    public render() {
        const {slots, onSlotDrop} = this.props;
        const {statusFilter, weekOffset} = this.useCarburetor(this.calendarState);
        const {dragOverDay, draggingSlotId} = this.useCarburetor(this.drag.state);
        const nowSec = Math.floor(Date.now() / 1000);
        const filteredSlots = this.getFilteredSlots(slots, statusFilter);
        const {weeks, rangeLabel, windowStartUnix, windowEndUnix} =
            this.getWindow(filteredSlots, nowSec, tsToInputDate(nowSec), weekOffset);
        const counts = this.getCounts(slots, windowStartUnix, windowEndUnix);

        const hasFreeSlots = slots.some(hasFreeSlot);
        const activeKind: PagerKind | undefined =
            statusFilter === 'free' || statusFilter === 'pending' || statusFilter === 'booked' || statusFilter === 'completed'
                ? statusFilter
                : undefined;

        return (
            <div className="expert-calendar">
                <CalendarStatusFilter slots={slots} value={statusFilter} onChange={this.setStatusFilter} />

                {hasFreeSlots && onSlotDrop && (
                    <div className="expert-calendar-hint" data-test-id="slot-drag-hint">
                        {t.Slot_DragHint()}
                    </div>
                )}

                {this.renderPager(rangeLabel, weekOffset, counts, activeKind)}

                {this.renderWeeks(weeks, dragOverDay, draggingSlotId)}
            </div>
        );
    }
}
