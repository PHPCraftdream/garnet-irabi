import * as React from 'react';
import {Pencil, Trash2} from 'lucide-react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {UniversalBadge} from '../../../../../Common/booking/StatusBadge';
import {statusClass} from '../../../../../Common/booking/statusClass';
import {translateStatus} from '../../../../../Common/booking/statusHelpers';
import {actionCostHint, actionLabel} from '../../../../../Common/booking/bookingAction';
import {Slot} from '../../types';
import {formatTime} from '@common/Utils/Time/DateUtils';

interface Props {
    slot: Slot;
    isDraggable: boolean;
    isDragging: boolean;
    onDragStart: (e: React.DragEvent<HTMLDivElement>, slot: Slot) => void;
    onDragEnd: () => void;
    onEdit?: (slot: Slot) => void;
    onDelete?: (id: number) => void;
    onCancelBooking?: (id: number) => void;
    onConfirmBooking?: (slot: Slot) => void;
    onUserClick?: (userId: number, userName: string) => void;
}

const slotEnd = (slot: Slot): number =>
    slot.end_at || (slot.start_at + (slot.duration_min || 60) * 60);

/**
 * Одна ячейка занятия в календаре преподавателя.
 *
 * Вынесена из `ExpertCalendar` целиком: там она жила на семнадцатом уровне
 * вложенности внутри двух `map` и трёх условий, и любая правка ветки «что
 * показывать на забронированном слоте» требовала считать отступы.
 */
export const CalendarSlotCell: React.FC<Props> = ({
    slot,
    isDraggable,
    isDragging,
    onDragStart,
    onDragEnd,
    onEdit,
    onDelete,
    onCancelBooking,
    onConfirmBooking,
    onUserClick,
}) => {
    const isBooked = slot.status === 'booked';
    const isPendingBooking = slot.booking_status === 'pending';
    // A group slot with open seats stays 'free' even with real bookings on
    // it — it only flips to 'booked' once max_users is reached. Without this
    // it had no cancel action reachable at all: Delete refuses a slot with
    // active bookings, and the booked-only cancel button never showed (D-130).
    const hasOpenSeatsWithBookings = slot.status === 'free' && (slot.booked_count ?? 0) > 0;

    return (
        <div
            className={`expert-cal-slot ${isDraggable ? 'cursor-grab' : ''} ${isDragging ? 'opacity-40' : ''}`}
            draggable={isDraggable}
            onDragStart={isDraggable ? (e) => onDragStart(e, slot) : undefined}
            onDragEnd={isDraggable ? onDragEnd : undefined}
            data-test-id={`expert-slot-${slot.id}`}
        >
            <div className="font-semibold">{formatTime(slot.start_at)} — {formatTime(slotEnd(slot))}</div>
            <div className="text-muted">{slot.cost} ₽ · {slot.duration_min} {t.Slot_Duration_Min()}</div>

            <div className="mt-1">
                {isBooked ? (
                    <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded ${statusClass(slot.booking_status || 'pending')}`}>
                        {translateStatus(slot.booking_status || 'pending')}
                    </span>
                ) : (
                    <UniversalBadge status={slot.status} label={translateStatus(slot.status)} />
                )}
            </div>

            {isBooked && slot.user_name && (
                <div className="mt-1 text-[10px]">
                    <span className="text-muted">{t.Slot_User()}: </span>
                    <button
                        type="button"
                        className="text-accent hover:underline font-medium"
                        onClick={(e) => {
                            e.stopPropagation();
                            onUserClick?.(slot.user_id!, slot.user_name!);
                        }}
                        data-test-id={`user-link-${slot.id}`}
                    >
                        {slot.user_name}
                    </button>
                </div>
            )}

            {slot.status === 'free' && (
                <div className="flex gap-1.5 mt-1.5">
                    {onEdit && (
                        <button
                            type="button"
                            className="expert-cal-icon-btn text-accent hover:bg-accent-subtle"
                            title={t.Action_Edit()}
                            onClick={() => onEdit(slot)}
                            data-test-id={`edit-slot-${slot.id}`}
                        >
                            <Pencil size={14} aria-hidden="true" />
                        </button>
                    )}
                    {!hasOpenSeatsWithBookings && onDelete && (
                        <button
                            type="button"
                            className="expert-cal-icon-btn text-danger hover:bg-danger-subtle"
                            title={t.Action_Delete()}
                            onClick={() => onDelete(slot.id)}
                            data-test-id={`delete-slot-${slot.id}`}
                        >
                            <Trash2 size={14} aria-hidden="true" />
                        </button>
                    )}
                    {hasOpenSeatsWithBookings && onCancelBooking && (
                        <button
                            type="button"
                            className="expert-cal-icon-btn text-danger hover:bg-danger-subtle"
                            title={actionLabel('expert', slot.booking_status)}
                            onClick={() => onCancelBooking(slot.id)}
                            data-test-id={`cancel-booking-${slot.id}`}
                        >
                            <Trash2 size={14} aria-hidden="true" />
                        </button>
                    )}
                </div>
            )}

            {isBooked && (
                <div className="flex gap-1.5 mt-1.5">
                    {isPendingBooking && onConfirmBooking && (
                        <button
                            type="button"
                            className="text-sm px-1.5 py-0.5 rounded btn btn-sm btn-success"
                            onClick={() => onConfirmBooking(slot)}
                            data-test-id={`confirm-booking-${slot.id}`}
                        >
                            {t.Booking_Confirm()}
                        </button>
                    )}
                    {onCancelBooking && (
                        <button
                            type="button"
                            className="expert-cal-icon-btn text-danger hover:bg-danger-subtle"
                            onClick={() => onCancelBooking(slot.id)}
                            data-test-id={`cancel-booking-${slot.id}`}
                        >
                            {actionLabel('expert', slot.booking_status)}
                        </button>
                    )}
                    {/*
                      * Место встречи правится и после записи — это
                      * единственное поле, которое ещё можно исправить.
                      * Онлайн-занятие, созданное без ссылки, иначе не
                      * починить вовсе (нашёл expert-3).
                      */}
                    {onEdit && (
                        <button
                            type="button"
                            className="expert-cal-icon-btn text-accent hover:bg-accent-subtle"
                            title={t.Slot_EditPlaceOnly()}
                            onClick={() => onEdit(slot)}
                            data-test-id={`edit-slot-${slot.id}`}
                        >
                            <Pencil size={14} aria-hidden="true" />
                        </button>
                    )}
                </div>
            )}

            {/*
              * «Мои слоты» — рабочий экран преподавателя, брони он
              * подтверждает отсюда. Пока цена действия жила только внутри
              * окна, решение принималось вслепую именно здесь (нашёл
              * expert-3).
              */}
            {isBooked && onCancelBooking && (
                <div className="mt-1 text-xs text-muted" data-test-id={`booking-cost-hint-${slot.id}`}>
                    {actionCostHint('expert', slot.booking_status)}
                </div>
            )}
        </div>
    );
};
