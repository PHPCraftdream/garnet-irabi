import * as React from 'react';
import {Slot} from '../types';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {formatTs, formatTime} from '@common/Utils/Time/DateUtils';

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
        // Несостоявшееся занятие — не достижение и не беда: приглушённый серый,
        // как у снятого, но отдельно от него.
        case 'expired': return 'status-muted';
        case 'cancelled': return 'bg-secondary';
        default: return 'status-muted';
    }
}

function statusText(status: string): string {
    switch (status) {
        case 'free': return t.Slot_Status_Free();
        case 'booked': return t.Slot_Status_Booked();
        case 'completed': return t.Slot_Status_Completed();
        case 'expired': return t.Slot_Status_Expired();
        case 'cancelled': return t.Slot_Status_Cancelled();
        default: return status;
    }
}

function borderClass(status: string): string {
    switch (status) {
        case 'free': return 'border-success';
        case 'booked': return 'border-warning';
        case 'completed': return 'border-info';
        case 'expired': return 'border-secondary';
        case 'cancelled': return 'border-secondary';
        default: return '';
    }
}

interface ActionsProps {
    slot: Slot;
    canComplete: boolean;
    onCancel?: (id: number) => void;
    onEdit?: (slot: Slot) => void;
    onComplete?: (id: number) => void;
    onDelete?: (id: number) => void;
}

const ActionButton: React.FC<{cls: string; testId: string; label: string; onClick: () => void}> = ({
    cls,
    testId,
    label,
    onClick,
}) => (
    <button className={`btn btn-sm ${cls}`} data-test-id={testId} onClick={onClick}>
        {label}
    </button>
);

/**
 * Что можно сделать с занятием — зависит от его состояния.
 *
 * Свободное правят, снимают и удаляют. Забронированное удалять нельзя: за ним
 * стоит человек, который записался. Завершить можно только то, что уже
 * началось, — иначе занятие «состоялось» до того, как состоялось.
 */
const SlotActions: React.FC<ActionsProps> = ({slot, canComplete, onCancel, onEdit, onComplete, onDelete}) => {
    if (slot.status === 'free') {
        if (!onEdit && !onCancel && !onDelete) return null;

        return (
            <div className="mt-3 flex gap-2">
                {onEdit && <ActionButton cls="btn-outline-primary" testId={`slot-edit-${slot.id}`} label={t.Slot_Edit()} onClick={() => onEdit(slot)} />}
                {onCancel && <ActionButton cls="btn-outline-warning" testId={`slot-cancel-${slot.id}`} label={t.Slot_Cancel()} onClick={() => onCancel(slot.id)} />}
                {onDelete && <ActionButton cls="btn-outline-danger" testId={`slot-delete-${slot.id}`} label={t.Slot_Delete()} onClick={() => onDelete(slot.id)} />}
            </div>
        );
    }

    if (slot.status !== 'booked') return null;
    if (!onCancel && !(onComplete && canComplete)) return null;

    return (
        <div className="mt-3 flex gap-2">
            {onCancel && <ActionButton cls="btn-outline-warning" testId={`slot-cancel-${slot.id}`} label={t.Slot_Cancel()} onClick={() => onCancel(slot.id)} />}
            {onComplete && canComplete && (
                <ActionButton cls="btn-success" testId={`slot-complete-${slot.id}`} label={t.Slot_Complete()} onClick={() => onComplete(slot.id)} />
            )}
        </div>
    );
};

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
                    {/*
                      * Only for group slots. A single-seat slot is the norm,
                      * so "seats: 1" on every card would be noise; a slot with
                      * room for several people looked identical to a private
                      * one, and its capacity appeared nowhere at all.
                      */}
                    {(slot.max_users ?? 1) > 1 && (
                        <p className="card-text mb-2" data-test-id="slot-seats">
                            <strong>{t.Slot_MaxUsers()}:</strong>{' '}
                            {slot.booked_count ?? 0} / {slot.max_users}
                        </p>
                    )}
                    <p className="card-text mb-0">
                        <strong>{t.Slot_Status()}:</strong>{' '}
                        <span className={`badge ${statusBadgeClass(slot.status)}`}>
                            {statusText(slot.status)}
                        </span>
                    </p>

                    <SlotActions
                        slot={slot}
                        canComplete={canComplete}
                        onCancel={onCancel}
                        onEdit={onEdit}
                        onComplete={onComplete}
                        onDelete={onDelete}
                    />
                </div>
            </div>
        </div>
    );
};
