import * as React from 'react';
import {useState, useMemo, useCallback} from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {Slot} from '../types';
import {CalendarStatusFilter, StatusFilter} from './calendar/CalendarStatusFilter';
import {CalendarPager, PagerKind} from './calendar/CalendarPager';
import {CalendarDayColumn} from './calendar/CalendarDayColumn';
import {useCalendarDrag} from './calendar/useCalendarDrag';
import {useCalendarWeeks, PAGE_WEEKS} from './calendar/useCalendarWeeks';

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

/**
 * Календарь занятий преподавателя — сборка из четырёх частей: фильтр,
 * пагинатор, недели из колонок-дней и ячейки занятий.
 *
 * Раньше всё это лежало одним куском, и ячейка занятия оказывалась на
 * семнадцатом уровне вложенности внутри двух `map` и трёх условий: любая
 * правка ветки «что показывать на забронированном слоте» начиналась со счёта
 * отступов.
 */
export const ExpertCalendar: React.FC<Props> = ({
    slots,
    onCancel: _onCancel,
    onEdit,
    onCancelBooking,
    onConfirmBooking,
    onDelete,
    onUserClick,
    onSlotDrop,
}) => {
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    // Смещение окна в неделях. Позволяет уйти назад в прошлое и вперёд за
    // пределы окна по умолчанию, чтобы достижимо было КАЖДОЕ занятие.
    const [weekOffset, setWeekOffset] = useState(0);
    const nowSec = Math.floor(Date.now() / 1000);

    const drag = useCalendarDrag(slots, onSlotDrop);

    const filteredSlots = useMemo(() => {
        if (statusFilter === 'all') return slots;
        if (statusFilter === 'pending') return slots.filter(s => s.booking_status === 'pending');
        return slots.filter(s => s.status === statusFilter);
    }, [slots, statusFilter]);

    const {weeks, rangeLabel, prevCounts, nextCounts, windowCounts} =
        useCalendarWeeks(slots, filteredSlots, weekOffset, nowSec);

    const handlePrevPage = useCallback(() => setWeekOffset(o => o - PAGE_WEEKS), []);
    const handleNextPage = useCallback(() => setWeekOffset(o => o + PAGE_WEEKS), []);
    const handleToday = useCallback(() => setWeekOffset(0), []);

    const hasFreeSlots = slots.some(s => s.status === 'free');
    const activeKind: PagerKind | undefined =
        statusFilter === 'free' || statusFilter === 'pending' || statusFilter === 'booked' || statusFilter === 'completed'
            ? statusFilter
            : undefined;

    return (
        <div className="space-y-4">
            <CalendarStatusFilter slots={slots} value={statusFilter} onChange={setStatusFilter} />

            {hasFreeSlots && onSlotDrop && (
                <div className="text-xs text-muted" data-test-id="slot-drag-hint">
                    {t.Slot_DragHint()}
                </div>
            )}

            <CalendarPager
                rangeLabel={rangeLabel}
                weekOffset={weekOffset}
                prevCounts={prevCounts}
                nextCounts={nextCounts}
                windowCounts={windowCounts}
                onPrev={handlePrevPage}
                onNext={handleNextPage}
                onToday={handleToday}
                activeKind={activeKind}
            />

            {weeks.map((week, wi) => (
                <div
                    key={wi}
                    className="grid grid-cols-7 gap-0 border border-default rounded-lg overflow-hidden"
                    data-test-id={`expert-week-${wi}`}
                >
                    {week.days.map(day => (
                        <CalendarDayColumn
                            key={day.dateStr}
                            day={day}
                            slots={week.slotsByDay.get(day.dateStr) || []}
                            isDropTarget={drag.dragOverDay === day.dayIso && drag.draggingSlotId !== null}
                            draggingSlotId={drag.draggingSlotId}
                            canDrag={!!onSlotDrop}
                            onDragEnter={drag.handleDragEnter}
                            onDragLeave={drag.handleDragLeave}
                            onDragOver={drag.handleDragOver}
                            onDrop={drag.handleDrop}
                            onSlotDragStart={drag.handleDragStart}
                            onSlotDragEnd={drag.handleDragEnd}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            onCancelBooking={onCancelBooking}
                            onConfirmBooking={onConfirmBooking}
                            onUserClick={onUserClick}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
};
