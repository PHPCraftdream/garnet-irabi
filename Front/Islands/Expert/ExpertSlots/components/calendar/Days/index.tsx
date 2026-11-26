import * as React from 'react';
import {Slot} from '@/Islands/Expert/ExpertSlots/types';
import {CalendarSlotCell} from '@/Islands/Expert/ExpertSlots/components/calendar/Slots/index';
import {CalendarDayHeading} from './CalendarDayHeading';
import {CalendarEmptyDay} from './CalendarEmptyDay';

export interface CalendarDay {
    dateStr: string;
    dayLabelStr: string;
    dayOfWeek: number;
    isToday: boolean;
    dayIso: string;
}

interface Props {
    day: CalendarDay;
    slots: Slot[];
    isDropTarget: boolean;
    draggingSlotId: number | null;
    canDrag: boolean;
    onDragEnter: (e: React.DragEvent<HTMLDivElement>, dayIso: string) => void;
    onDragLeave: (e: React.DragEvent<HTMLDivElement>, dayIso: string) => void;
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
    onDrop: (e: React.DragEvent<HTMLDivElement>, dayIso: string) => void;
    onSlotDragStart: (e: React.DragEvent<HTMLDivElement>, slot: Slot) => void;
    onSlotDragEnd: () => void;
    onEdit?: (slot: Slot) => void;
    onDelete?: (id: number) => void;
    onCancelBooking?: (id: number) => void;
    onConfirmBooking?: (slot: Slot) => void;
    onUserClick?: (userId: number, userName: string) => void;
}

/** Один день недели: заголовок и колонка занятий, принимающая перетаскивание. */
export class CalendarDayColumn extends React.Component<Props> {
    /** Обработать соответствующее действие пользователя. */
    private readonly dragEnter = (event: React.DragEvent<HTMLDivElement>) => this.props.onDragEnter(event,
    this.props.day.dayIso);
    /** Обработать соответствующее действие пользователя. */
    private readonly dragLeave = (event: React.DragEvent<HTMLDivElement>) => this.props.onDragLeave(event,
    this.props.day.dayIso);
    /** Обработать соответствующее действие пользователя. */
    private readonly drop = (event: React.DragEvent<HTMLDivElement>) => this.props.onDrop(event, this.props.day.dayIso);

    /** Отобразить соответствующую часть интерфейса. */
    private readonly renderSlot = (slot: Slot) => {
        const {draggingSlotId, canDrag, onSlotDragStart, onSlotDragEnd, onEdit, onDelete, onCancelBooking,
        onConfirmBooking, onUserClick} = this.props;
        return (
            <CalendarSlotCell
                key={slot.id}
                slot={slot}
                isDraggable={slot.status === 'free' && canDrag}
                isDragging={draggingSlotId === slot.id}
                onDragStart={onSlotDragStart}
                onDragEnd={onSlotDragEnd}
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
        const {day, slots, isDropTarget, onDragOver} = this.props;
        return (
            <div
                className={day.isToday || isDropTarget ? 'expert-calendar-day-highlight' : 'expert-calendar-day'}
                onDragEnter={this.dragEnter}
                onDragLeave={this.dragLeave}
                onDragOver={onDragOver}
                onDrop={this.drop}
                data-test-id={`calendar-day-${day.dayIso}`}
            >
                <CalendarDayHeading dayOfWeek={day.dayOfWeek} label={day.dayLabelStr} isToday={day.isToday} />
                <div className="expert-day-slots" style={{maxHeight: '50vh'}}>
                    {slots.length === 0 ? <CalendarEmptyDay /> : slots.map(this.renderSlot)}
                </div>
            </div>
        );
    }
}
