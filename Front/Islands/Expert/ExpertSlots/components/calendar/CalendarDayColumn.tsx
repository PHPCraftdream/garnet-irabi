import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {Slot} from '../../types';
import {CalendarSlotCell} from './CalendarSlotCell';

export interface CalendarDay {
    dateStr: string;
    dayLabelStr: string;
    dayOfWeek: number;
    isToday: boolean;
    dayIso: string;
}

const dayLabel = (dow: number): string => {
    const labels = [t.Cal_Sun, t.Cal_Mon, t.Cal_Tue, t.Cal_Wed, t.Cal_Thu, t.Cal_Fri, t.Cal_Sat];
    return labels[dow]?.() || '';
};

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
export const CalendarDayColumn: React.FC<Props> = ({
    day,
    slots,
    isDropTarget,
    draggingSlotId,
    canDrag,
    onDragEnter,
    onDragLeave,
    onDragOver,
    onDrop,
    onSlotDragStart,
    onSlotDragEnd,
    onEdit,
    onDelete,
    onCancelBooking,
    onConfirmBooking,
    onUserClick,
}) => (
    <div
        className={`flex flex-col min-w-0 transition-colors ${day.isToday ? 'bg-accent-subtle' : ''} ${isDropTarget ? 'bg-accent-subtle' : ''}`}
        onDragEnter={(e) => onDragEnter(e, day.dayIso)}
        onDragLeave={(e) => onDragLeave(e, day.dayIso)}
        onDragOver={onDragOver}
        onDrop={(e) => onDrop(e, day.dayIso)}
        data-test-id={`calendar-day-${day.dayIso}`}
    >
        <div className={`expert-cal-day-head ${day.isToday ? 'text-accent font-bold' : 'text-muted'}`}>
            {dayLabel(day.dayOfWeek)} {day.dayLabelStr}
        </div>
        <div className="flex-1 p-1 overflow-y-auto" style={{maxHeight: '50vh'}}>
            {slots.length === 0 ? (
                <div className="text-center text-[10px] text-muted py-3">—</div>
            ) : slots.map(slot => (
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
            ))}
        </div>
    </div>
);
