import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {Slot} from '../../types';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {formatTs, formatTime} from '@common/Utils/Time/DateUtils';

interface Props {
    slot: Slot;
    onCancel?: (id: number) => void;
    onEdit?: (slot: Slot) => void;
    onComplete?: (id: number) => void;
    onDelete?: (id: number) => void;
}

/** Получить или вычислить соответствующие данные. */
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

interface ActionsProps {
    slot: Slot;
    canComplete: boolean;
    onCancel?: (id: number) => void;
    onEdit?: (slot: Slot) => void;
    onComplete?: (id: number) => void;
    onDelete?: (id: number) => void;
}

interface ActionProps {
    action: 'edit' | 'cancel' | 'delete' | 'complete';
    testId: string;
    label: string;
    onClick: () => void;
}

/** Подготовить данные для соответствующего интерфейса. */
function ActionButton({action, testId, label, onClick}: ActionProps) {
    return (
        <button
            className={action === 'edit' ? 'compact-outline-action' : action === 'cancel' ? 'btn-outline-warning-full'
            : action === 'delete' ? 'slot-remove-btn' : 'compact-success-action'}
            data-slot-card-action="compact"
            data-test-id={testId}
            onClick={onClick}
        >
            {label}
        </button>
    );
}

/**
 * Что можно сделать с занятием — зависит от его состояния.
 *
 * Свободное правят, снимают и удаляют. Забронированное удалять нельзя: за ним
 * стоит человек, который записался. Завершить можно только то, что уже
 * началось, — иначе занятие «состоялось» до того, как состоялось.
 */
class SlotActions extends AntiHookComponent<ActionsProps> {
    /** Обработать соответствующее действие пользователя. */
    private readonly edit = () => this.props.onEdit?.(this.props.slot);
    /** Обработать соответствующее действие пользователя. */
    private readonly cancel = () => this.props.onCancel?.(this.props.slot.id);
    /** Обработать соответствующее действие пользователя. */
    private readonly remove = () => this.props.onDelete?.(this.props.slot.id);
    /** Подготовить данные для соответствующего интерфейса. */
    private readonly complete = () => this.props.onComplete?.(this.props.slot.id);

    /** Отобразить соответствующую часть интерфейса. */
    private renderCancel() {
        const {slot, onCancel} = this.props;
        if (!onCancel) return null;
        return <ActionButton action="cancel" testId={`slot-cancel-${slot.id}`} label={t.Slot_Cancel()}
        onClick={this.cancel} />;
    }

    /** Отобразить соответствующую часть интерфейса. */
    render() {
        const {slot, canComplete, onCancel, onEdit, onComplete, onDelete} = this.props;
        if (slot.status === 'free') {
            if (!onEdit && !onCancel && !onDelete) return null;
            return (
                <div className="expert-slot-card-actions">
                    {onEdit && <ActionButton action="edit" testId={`slot-edit-${slot.id}`} label={t.Slot_Edit()}
                    onClick={this.edit} />}
                    {this.renderCancel()}
                    {onDelete && <ActionButton action="delete" testId={`slot-delete-${slot.id}`} label={t.Slot_Delete()}
                    onClick={this.remove} />}
                </div>
            );
        }

        if (slot.status !== 'booked' || (!onCancel && !(onComplete && canComplete))) return null;
        return (
            <div className="expert-slot-card-actions">
                {this.renderCancel()}
                {onComplete && canComplete && (
                    <ActionButton action="complete" testId={`slot-complete-${slot.id}`} label={t.Slot_Complete()}
                    onClick={this.complete} />
                )}
            </div>
        );
    }
}

export class SlotCard extends AntiHookComponent<Props> {
    /** Отобразить соответствующую часть интерфейса. */
    private renderDetails() {
        const {slot} = this.props;
        const formattedDate = formatTs(slot.start_at, {dateOnly: true});
        const formattedTime = formatTime(slot.start_at);
        return (
            <>
                <h5 className="expert-slot-card-title">{formattedDate} {formattedTime}</h5>
                <p className="expert-slot-card-meta">
                    <strong>{t.Slot_Duration()}:</strong> {slot.duration_min ?? 60} {t.Slot_Duration_Min()}
                </p>
                <p className="expert-slot-card-meta">
                    <strong>{t.Slot_Cost()}:</strong> {slot.cost} &#8381;
                </p>
                {(slot.max_users ?? 1) > 1 && (
                    <p className="expert-slot-card-meta" data-test-id="slot-seats">
                        <strong>{t.Slot_MaxUsers()}:</strong>{' '}
                        {slot.booked_count ?? 0} / {slot.max_users}
                    </p>
                )}
                <p className="expert-slot-card-meta">
                    <strong>{t.Slot_Status()}:</strong>{' '}
                    <span className="expert-slot-card-status" data-slot-state={slot.status}>
                        {statusText(slot.status)}
                    </span>
                </p>
            </>
        );
    }

    /** Отобразить соответствующую часть интерфейса. */
    render() {
        const {slot, onCancel, onEdit, onComplete, onDelete} = this.props;
        const canComplete = slot.status === 'booked' && slot.start_at <= Date.now() / 1000;

        return (
            <div>
                <div className="booking-card-shell" data-test-id="slot-item" data-slot-id={slot.id}
                data-slot-status={slot.status}>
                    <div className="expert-slot-card-body">
                        {this.renderDetails()}
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
    }
}
