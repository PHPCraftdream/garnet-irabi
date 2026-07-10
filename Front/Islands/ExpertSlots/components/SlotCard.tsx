import * as React from 'react';
import {Slot} from '../types';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {formatTs, formatTime} from '@common/Utils/DateUtils';

interface Props {
    slot: Slot;
    onCancel?: (id: number) => void;
    onEdit?: (slot: Slot) => void;
    onComplete?: (id: number) => void;
    onDelete?: (id: number) => void;
}

function statusBadgeClass(status: string): string {
    switch (status) {
        case 'free': return 'bg-success';
        case 'booked': return 'status-warning';
        case 'completed': return 'status-info';
        case 'cancelled': return 'bg-secondary';
        default: return 'status-muted';
    }
}

function statusText(status: string): string {
    switch (status) {
        case 'free': return t.Slot_Status_Free();
        case 'booked': return t.Slot_Status_Booked();
        case 'completed': return t.Slot_Status_Completed();
        case 'cancelled': return t.Slot_Status_Cancelled();
        default: return status;
    }
}

function borderClass(status: string): string {
    switch (status) {
        case 'free': return 'border-success';
        case 'booked': return 'border-warning';
        case 'completed': return 'border-info';
        case 'cancelled': return 'border-secondary';
        default: return '';
    }
}

export const SlotCard: React.FC<Props> = ({slot, onCancel, onEdit, onComplete, onDelete}) => {
    const formattedDate = formatTs(slot.start_at, {dateOnly: true});
    const formattedTime = formatTime(slot.start_at);
    const canComplete = slot.status === 'booked' && slot.start_at <= Date.now() / 1000;

    return (
        <div>
            <div className={`card slot-item ${borderClass(slot.status)}`} data-test-id="slot-item" data-slot-id={slot.id} data-slot-status={slot.status}>
                <div className="card-body">
                    <h5 className="card-title">{formattedDate} {formattedTime}</h5>
                    <p className="card-text mb-2">
                        <strong>{t.Slot_Duration()}:</strong> {slot.duration_min ?? 60} {t.Slot_Duration_Min()}
                    </p>
                    <p className="card-text mb-2">
                        <strong>{t.Slot_Cost()}:</strong> {slot.cost} &#8381;
                    </p>
                    <p className="card-text mb-0">
                        <strong>{t.Slot_Status()}:</strong>{' '}
                        <span className={`badge ${statusBadgeClass(slot.status)}`}>
                            {statusText(slot.status)}
                        </span>
                    </p>

                    {slot.status === 'free' && (onEdit || onCancel || onDelete) && (
                        <div className="mt-3 flex gap-2">
                            {onEdit && (
                                <button
                                    className="btn btn-sm btn-outline-primary"
                                    data-test-id={`slot-edit-${slot.id}`}
                                    onClick={() => onEdit(slot)}
                                >
                                    {t.Slot_Edit()}
                                </button>
                            )}
                            {onCancel && (
                                <button
                                    className="btn btn-sm btn-outline-warning"
                                    data-test-id={`slot-cancel-${slot.id}`}
                                    onClick={() => onCancel(slot.id)}
                                >
                                    {t.Slot_Cancel()}
                                </button>
                            )}
                            {onDelete && (
                                <button
                                    className="btn btn-sm btn-outline-danger"
                                    data-test-id={`slot-delete-${slot.id}`}
                                    onClick={() => onDelete(slot.id)}
                                >
                                    {t.Slot_Delete()}
                                </button>
                            )}
                        </div>
                    )}

                    {slot.status === 'booked' && (onCancel || (onComplete && canComplete)) && (
                        <div className="mt-3 flex gap-2">
                            {onCancel && (
                                <button
                                    className="btn btn-sm btn-outline-warning"
                                    data-test-id={`slot-cancel-${slot.id}`}
                                    onClick={() => onCancel(slot.id)}
                                >
                                    {t.Slot_Cancel()}
                                </button>
                            )}
                            {onComplete && canComplete && (
                                <button
                                    className="btn btn-sm btn-success"
                                    data-test-id={`slot-complete-${slot.id}`}
                                    onClick={() => onComplete(slot.id)}
                                >
                                    {t.Slot_Complete()}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
