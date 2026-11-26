import * as React from 'react';
import {Slot} from '@/Islands/Expert/ExpertSlots/types';
import {CalendarDay, CalendarDayColumn} from '@/Islands/Expert/ExpertSlots/components/calendar/Days/index';
import {CalendarDragController} from '@/Islands/Expert/ExpertSlots/components/calendar/CalendarDragController';
import type {CalendarWeek} from './CalendarWeek';

interface Props {
    weeks: CalendarWeek[];
    drag: CalendarDragController;
    dragOverDay: string | null;
    draggingSlotId: number | null;
    canDrag: boolean;
    onEdit?: (slot: Slot) => void;
    onDelete?: (id: number) => void;
    onCancelBooking?: (id: number) => void;
    onConfirmBooking?: (slot: Slot) => void;
    onUserClick?: (userId: number, userName: string) => void;
}

class ExpertCalendarWeek extends React.Component<Omit<Props, 'weeks'> & {week: CalendarWeek; index: number}> {
    /** Отобразить соответствующую часть интерфейса. */
    private readonly renderDay = (day: CalendarDay) => {
        const {week, drag, dragOverDay, draggingSlotId, canDrag, onEdit, onDelete, onCancelBooking,
        onConfirmBooking, onUserClick} = this.props;
        return (
            <CalendarDayColumn
                key={day.dateStr}
                day={day}
                slots={week.slotsByDay.get(day.dateStr) || []}
                isDropTarget={dragOverDay === day.dayIso && draggingSlotId !== null}
                draggingSlotId={draggingSlotId}
                canDrag={canDrag}
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
        );
    };

    /** Отобразить соответствующую часть интерфейса. */
    public render() {
        return (
            <div className="expert-calendar-week" data-test-id={`expert-week-${this.props.index}`}>
                {this.props.week.days.map(this.renderDay)}
            </div>
        );
    }
}

export class ExpertCalendarWeeks extends React.Component<Props> {
    /** Отобразить соответствующую часть интерфейса. */
    private readonly renderWeek = (week: CalendarWeek, index: number) => (
        <ExpertCalendarWeek {...this.props} key={index} week={week} index={index} />
    );

    /** Отобразить соответствующую часть интерфейса. */
    public render() {
        return this.props.weeks.map(this.renderWeek);
    }
}
