import * as React from 'react';
import {Pencil, Trash2} from 'lucide-react';
import {I18nForeground as t} from '../../../../../../I18nGen/I18nForeground';
import {UniversalBadge} from '../../../../../../Common/booking/status/StatusBadge';
import {statusClass} from '../../../../../../Common/booking/status/statusClass';
import {translateStatus} from '../../../../../../Common/booking/status/statusHelpers';
import {actionLabel} from '../../../../../../Common/booking/actions/labels/actionLabel';
import {Slot} from '../../../types';
import {CalendarSlotSummary} from './CalendarSlotSummary';
import {CalendarSlotUser} from './CalendarSlotUser';
import {CalendarSlotCostHint} from './CalendarSlotCostHint';

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

/** Одна ячейка занятия в календаре преподавателя. */
export class CalendarSlotCell extends React.Component<Props> {
    /** Подготовить данные для соответствующего интерфейса. */
    private readonly startDrag = (event: React.DragEvent<HTMLDivElement>) => this.props.onDragStart(event,
    this.props.slot);
    /** Обработать соответствующее действие пользователя. */
    private readonly edit = () => this.props.onEdit?.(this.props.slot);
    /** Обработать соответствующее действие пользователя. */
    private readonly remove = () => this.props.onDelete?.(this.props.slot.id);
    /** Обработать соответствующее действие пользователя. */
    private readonly cancelBooking = () => this.props.onCancelBooking?.(this.props.slot.id);
    /** Обработать соответствующее действие пользователя. */
    private readonly confirmBooking = () => this.props.onConfirmBooking?.(this.props.slot);

    /** Отобразить соответствующую часть интерфейса. */
    private renderStatus() {
        const {slot} = this.props;
        const isBooked = slot.status === 'booked';
        return (
            <div className="expert-slot-status-row">
                {isBooked ? (
                    <span className="expert-slot-booked-status" data-status={statusClass(slot.booking_status ||
                    'pending')}>
                        {translateStatus(slot.booking_status || 'pending')}
                    </span>
                ) : (
                    <UniversalBadge status={slot.status} label={translateStatus(slot.status)} />
                )}
            </div>
        );
    }

    /** Отобразить соответствующую часть интерфейса. */
    private renderFreeActions() {
        const {slot, onEdit, onDelete, onCancelBooking} = this.props;
        if (slot.status !== 'free') return null;
        // A group slot can remain free while already holding bookings (D-130).
        const hasOpenSeatsWithBookings = (slot.booked_count ?? 0) > 0;
        return (
            <div className="expert-slot-actions">
                {onEdit && (
                    <button
                        type="button"
                        className="expert-slot-edit-action"
                        title={t.Action_Edit()}
                        onClick={this.edit}
                        data-test-id={`edit-slot-${slot.id}`}
                    >
                        <Pencil size={14} aria-hidden="true" />
                    </button>
                )}
                {!hasOpenSeatsWithBookings && onDelete && (
                    <button
                        type="button"
                        className="expert-slot-danger-action"
                        title={t.Action_Delete()}
                        onClick={this.remove}
                        data-test-id={`delete-slot-${slot.id}`}
                    >
                        <Trash2 size={14} aria-hidden="true" />
                    </button>
                )}
                {hasOpenSeatsWithBookings && onCancelBooking && (
                    <button type="button" className="expert-slot-danger-action" title={actionLabel('expert',
                    slot.booking_status)} onClick={this.cancelBooking} data-test-id={`cancel-booking-${slot.id}`}>
                        <Trash2 size={14} aria-hidden="true" />
                    </button>
                )}
            </div>
        );
    }

    /** Отобразить соответствующую часть интерфейса. */
    private renderBookedActions() {
        const {slot, onEdit, onCancelBooking, onConfirmBooking} = this.props;
        if (slot.status !== 'booked') return null;
        return (
            <div className="expert-slot-actions">
                {slot.booking_status === 'pending' && onConfirmBooking && (
                    <button
                        type="button"
                        className="compact-success-action"
                        onClick={this.confirmBooking}
                        data-test-id={`confirm-booking-${slot.id}`}
                    >
                        {t.Booking_Confirm()}
                    </button>
                )}
                {onCancelBooking && (
                    <button type="button" className="expert-slot-danger-action" onClick={this.cancelBooking}
                    data-test-id={`cancel-booking-${slot.id}`}>
                        {actionLabel('expert', slot.booking_status)}
                    </button>
                )}
                {/* Место встречи можно исправить и после записи. */}
                {onEdit && (
                    <button type="button" className="expert-slot-edit-action" title={t.Slot_EditPlaceOnly()}
                    onClick={this.edit} data-test-id={`edit-slot-${slot.id}`}>
                        <Pencil size={14} aria-hidden="true" />
                    </button>
                )}
            </div>
        );
    }

    /** Отобразить соответствующую часть интерфейса. */
    public render() {
        const {slot, isDraggable, isDragging, onDragEnd, onUserClick, onCancelBooking} = this.props;
        const isBooked = slot.status === 'booked';
        return (
            <div
                className={isDraggable ? (isDragging ? 'expert-slot-grab-dragging' : 'expert-slot-grab') : (isDragging ?
                'expert-slot-dragging' : undefined)}
                draggable={isDraggable}
                onDragStart={isDraggable ? this.startDrag : undefined}
                onDragEnd={isDraggable ? onDragEnd : undefined}
                data-test-id={`expert-slot-${slot.id}`}
            >
                <CalendarSlotSummary slot={slot} />
                {this.renderStatus()}
                {isBooked && slot.user_name && <CalendarSlotUser slot={slot} onUserClick={onUserClick} />}
                {this.renderFreeActions()}
                {this.renderBookedActions()}
                {isBooked && onCancelBooking && <CalendarSlotCostHint slot={slot} />}
            </div>
        );
    }
}
