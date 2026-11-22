import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {D} from '@common/Support/Debug/D';

import {useConfirm} from '@common/hooks/ui/useConfirm';
import {useSending} from '@common/hooks/data/useSending';
import {useBodyScrollLock} from '@common/hooks/ui/useBodyScrollLock';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {ConfirmModal} from '@common/Components/Feedback/ConfirmModal';
import {sendPost} from '@common/Api/Send/sendPost';
import {appUrl} from '@common/Utils/Url/appUrl';
import {tsToInputTime} from '@common/Utils/Time/DateUtils';
import {TimezoneNotice} from '@common/Components/Feedback/TimezoneNotice';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {
    actionImpact,
    actionReasonLabel,
    actionReasonPlaceholder,
    actionSubmitLabel,
    actionTitle,
} from '../../../Common/booking/bookingAction';
import {ReasonModal} from '../../../Common/Components/ReasonModal';
import {EditSlotModal} from './components/Slot/EditSlotModal';
import {Slot, ExpertSlotsProps} from './types';
import {CreateSlotModal} from './components/Slot/CreateSlotModal';
import {BatchSlotModal} from './components/Batch/BatchSlotModal';
import {ExpertCalendar} from './components/ExpertCalendar';
import {IrabiPreviewProvider} from '../../../Common/people/IrabiPreviewProvider';
import {usePreview} from '@common/Components/UserPreviewModal/PreviewContext';
import {PageHeader} from '@common/Components/Layout/PageHeader';
import {CalendarClock} from 'lucide-react';
import {ExpertSlotsUIState} from './ExpertSlotsUIState';

function findSlot(slots: Slot[], id: number | null): Slot | undefined {
    return slots.find(slot => slot.id === id);
}

function showSlotError(message: string): void {
    showToast(message, 'danger');
}

const ExpertSlotsIslandInner: React.FC<ExpertSlotsProps> = (props) => {
    const preview = usePreview();

    const confirmation = useConfirm();
    const {sending: cancelSending, withSending: withCancelSending} = useSending();

    const [ui] = React.useState(() => new ExpertSlotsUIState(props.slots || []));
    const state = React.useSyncExternalStore(ui.subscribeSnapshot, ui.snapshot, ui.snapshot);
    const {showCreateModal, showBatchModal} = state;
    const {closeCreateModal, closeBatchModal} = ui;
    useBodyScrollLock(showCreateModal);
    useBodyScrollLock(showBatchModal);

    // Close create modal on Escape
    React.useEffect(() => {
        if (!showCreateModal) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeCreateModal();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [showCreateModal, closeCreateModal]);

    // Close batch modal on Escape
    React.useEffect(() => {
        if (!showBatchModal) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeBatchModal();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [showBatchModal, closeBatchModal]);

    return <ExpertSlotsView source={props} ui={ui} state={state} preview={preview}
        {...confirmation} cancelSending={cancelSending} withCancelSending={withCancelSending} />;
};

interface ViewProps extends ReturnType<typeof useConfirm> {
    source: ExpertSlotsProps;
    ui: ExpertSlotsUIState;
    state: ReturnType<ExpertSlotsUIState['snapshot']>;
    preview: ReturnType<typeof usePreview>;
    cancelSending: boolean;
    withCancelSending: ReturnType<typeof useSending>['withSending'];
}

const PAGE_ICON = <CalendarClock size={22} aria-hidden="true" />;

class ExpertSlotsView extends AntiHookComponent<ViewProps> {
    private readonly handleUserClick = (userId: number, userName: string) => {
        this.props.preview?.openPreview(userId, userName);
    };

    private readonly handleSlotCreated = (newSlot?: Slot) => {
        if (newSlot) {
            this.props.ui.appendSlots([newSlot]);
        }
        this.props.ui.closeCreateModal();
        // Batch_Created is a counter label ("Slots created: ") meant to be
        // followed by a number, as the batch wizard does. Creating one slot
        // has no number to append, so it showed as a dangling "Created:".
        showToast(t.Slot_Created(), 'success');
    };

    private readonly handleBatchSuccess = (msg: string, newSlots?: Slot[]) => {
        showToast(msg, 'success');
        if (newSlots && newSlots.length > 0) {
            this.props.ui.appendSlots(newSlots);
        }
        this.props.ui.closeBatchModal();
    };

    private readonly handleCancelSlot = async (id: number) => {
        const ok = await this.props.confirm(t.Slot_CancelConfirm(), {confirmLabel: t.Action_Cancel(), variant: 'danger'});
        if (!ok) return;
        D('teaching.slot.cancel', {slotId: id});
        try {
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            await sendPost(appUrl('/expert/~cancelSlot'), {CSRF_TOKEN: csrf, slot_id: id});
            this.props.ui.cancelSlot(id);
            showToast(t.Cancel_Success(), 'success');
        } catch (e: any) {
            D('teaching.error', {action: 'cancelSlot', slotId: id, error: e?.message});
            showToast(e?.message || t.General_Error(), 'danger');
        }
    };

    private readonly handleDeleteSlot = async (id: number) => {
        const ok = await this.props.confirm(t.Slot_DeleteConfirm(), {confirmLabel: t.Action_Delete(), variant: 'danger'});
        if (!ok) return;
        D('teaching.slot.delete', {slotId: id});
        try {
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            await sendPost(appUrl('/expert/~deleteSlot'), {CSRF_TOKEN: csrf, slot_id: id});
            this.props.ui.removeSlot(id);
        } catch (e: any) {
            D('teaching.error', {action: 'deleteSlot', slotId: id, error: e?.message});
            showToast(e?.message || t.General_Error(), 'danger');
        }
    };

    private readonly handleConfirmBooking = async (slot: Slot) => {
        if (!slot.booking_id) return;
        D('teaching.slot.confirmBooking', {slotId: slot.id, bookingId: slot.booking_id});
        try {
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            await sendPost(appUrl('/expert/~confirmBooking'), {CSRF_TOKEN: csrf, booking_id: slot.booking_id});
            this.props.ui.confirmBooking(slot.id);
            showToast(t.Booking_Status_Confirmed(), 'success');
        } catch (e: any) {
            D('teaching.error', {action: 'confirmBooking', slotId: slot.id, error: e?.message});
            showToast(e?.message || t.General_Error(), 'danger');
        }
    };

    private readonly handleCancelBookingOpen = (id: number) => this.props.ui.setCancelBookingSlotId(id);
    private readonly handleCancelBookingClose = () => this.props.ui.setCancelBookingSlotId(null);

    private readonly handleCancelBookingSubmit = (reason: string) => {
        const {state: {slots, cancelBookingSlotId}, withCancelSending} = this.props;
        withCancelSending(async () => {
            D('teaching.slot.cancelBooking', {slotId: cancelBookingSlotId, reason});
            try {
                const csrf = (window as any).__GARNET_CSRF__ ?? '';
                // D-130: a group slot with open seats stays status='free'
                // even with active bookings on it (fills to 'booked' only
                // once max_users is reached) — cancelBookedSlot() refuses
                // anything but a full slot, so this path needs the other
                // endpoint. Both now collect and store the same reason.
                const targetStatus = findSlot(slots, cancelBookingSlotId)?.status;
                const endpoint = targetStatus === 'free' ? '/expert/~cancelSlot' : '/expert/~cancelBookedSlot';
                await sendPost(appUrl(endpoint), {
                    CSRF_TOKEN: csrf,
                    slot_id: cancelBookingSlotId,
                    reason,
                });
                this.props.ui.cancelSlot(cancelBookingSlotId);
                showToast(t.Cancel_Success(), 'success');
                this.handleCancelBookingClose();
            } catch (e: any) {
                D('teaching.error', {action: 'cancelBookedSlot', slotId: cancelBookingSlotId, error: e?.message});
                showToast(e?.message || t.General_Error(), 'danger');
            }
        });
    };

    private readonly handleEditSlot = (slot: Slot) => {
        this.props.ui.setEditingSlot(slot);
    };

    private readonly handleEditSaved = (updated: Slot, original: Slot) => {
        // Сервер отдаёт сырую строку слота — без имени записавшегося и без
        // статуса его брони, которые подмешиваются при выборке списка. Если
        // подставить её целиком, карточка на миг теряет бронь и показывает
        // «Ждёт подтверждения» вместо «Подтверждено» (заметил expert-3).
        this.props.ui.replaceSlot(updated, true);
        this.props.ui.setEditingSlot(null);
        // На забронированном слоте меняется только место встречи — так и
        // говорим. Прежний текст обещал перенос занятия и обновление страницы,
        // хотя ни того, ни другого не происходило.
        showToast(original.status === 'booked' ? t.Slot_PlaceUpdated() : t.Slot_Saved(), 'success');
    };

    private readonly handleEditClose = () => {
        this.props.ui.setEditingSlot(null);
    };

    private readonly handleSlotDrop = async (slotId: number, newDateStr: string) => {
        const slot = this.props.state.slots.find(s => s.id === slotId);
        if (!slot || slot.status !== 'free') return;

        // Cannot drop onto a past date
        const dropDate = new Date(newDateStr + 'T00:00:00');
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        if (dropDate.getTime() < todayStart.getTime()) {
            showToast(t.Slot_CannotDropPast(), 'danger');
            return;
        }

        // Extract original time from the slot (in the user's TZ).
        const time = tsToInputTime(slot.start_at);

        D('teaching.slot.drop', {slotId, from: slot.start_at, newDate: newDateStr, time});

        try {
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            const resp = await sendPost(appUrl('/expert/~editSlot'), {
                CSRF_TOKEN: csrf,
                slot_id: slotId,
                date: newDateStr,
                time,
                duration_min: slot.duration_min,
                cost: slot.cost,
                cancellation_penalty_percent: slot.cancellation_penalty_percent ?? 0,
            });
            const updated = (resp as any)?.slot ?? slot;
            this.props.ui.replaceSlot(updated);
            showToast(t.Slot_Moved(), 'success');
        } catch (e: any) {
            D('teaching.error', {action: 'dropSlot', slotId, error: e?.message});
            const resp = e?.response;
            const msg = (resp && typeof resp === 'object' && resp.error) ? resp.error : (e?.message || t.General_Error());
            showToast(msg, 'danger');
        }
    };

    private renderHeading() {
        const {source: props} = this.props;
        return (
            <>
                <PageHeader title={t.Teaching_Slots_Title()} icon={PAGE_ICON} />

                {props.isApproved === false && (
                    <div className="section-soft" data-expert-slots="pending" data-test-id="expert-pending-approval">
                        {t.Expert_PendingApproval()}
                    </div>
                )}
            </>
        );
    }

    private renderActions() {
        const {ui} = this.props;
        return (
            <>
                <div className="expert-slots-actions">
                    <button
                        type="button"
                        className="confirm-modal-success"
                        onClick={ui.openCreateModal}
                        data-test-id="open-create-slot-modal"
                    >
                        + {t.Slot_Create()}
                    </button>
                    <button
                        type="button"
                        className="primary-action-button"
                        onClick={ui.openBatchModal}
                        data-test-id="open-batch-slot-modal"
                    >
                        {t.Batch_CreateBtn()}
                    </button>
                </div>
            </>
        );
    }

    private renderCreateModals() {
        const {source: props, ui, confirm, state: {showCreateModal, showBatchModal}} = this.props;
        const {closeCreateModal, closeBatchModal} = ui;
        return (
            <>
                <CreateSlotModal
                    open={showCreateModal}
                    onClose={closeCreateModal}
                    onSuccess={this.handleSlotCreated}
                    onError={showSlotError}
                    fieldsInfo={props.slotFieldsInfo}
                    defaultPenaltyPercent={props.defaultPenaltyPercent ?? 0}
                />

                {/* Batch slot modal */}
                <BatchSlotModal
                    open={showBatchModal}
                    onClose={closeBatchModal}
                    onSuccess={this.handleBatchSuccess}
                    onError={showSlotError}
                    onConfirm={confirm}
                    defaultPenaltyPercent={props.defaultPenaltyPercent ?? 0}
                />
            </>
        );
    }

    private renderCalendar() {
        const {slots} = this.props.state;
        return (
            <>
                <div className="section-soft" data-expert-slots="calendar">
                    <TimezoneNotice infoOnly />

                    <ExpertCalendar
                        slots={slots}
                        onCancel={this.handleCancelSlot}
                        onEdit={this.handleEditSlot}
                        onCancelBooking={this.handleCancelBookingOpen}
                        onConfirmBooking={this.handleConfirmBooking}
                        onDelete={this.handleDeleteSlot}
                        onUserClick={this.handleUserClick}
                        onSlotDrop={this.handleSlotDrop}
                    />
                </div>
            </>
        );
    }

    private renderEditModal() {
        const {editingSlot} = this.props.state;
        return (
            <>
                {editingSlot && (
                    <EditSlotModal
                        slot={editingSlot}
                        onClose={this.handleEditClose}
                        onSaved={this.handleEditSaved}
                        onError={showSlotError}
                    />
                )}
            </>
        );
    }

    private renderConfirmations() {
        const {state: {cancelBookingSlotId, slots}, confirmState, handleConfirm, handleCancel, cancelSending} = this.props;
        const cancelSlotStatus = findSlot(slots, cancelBookingSlotId)?.booking_status;
        return (
            <>
                <ReasonModal
                    open={cancelBookingSlotId !== null}
                    title={actionTitle('expert', cancelSlotStatus)}
                    impact={actionImpact('expert', cancelSlotStatus)}
                    reasonLabel={actionReasonLabel('expert', cancelSlotStatus)}
                    reasonPlaceholder={actionReasonPlaceholder('expert', cancelSlotStatus)}
                    submitLabel={actionSubmitLabel('expert', cancelSlotStatus)}
                    sending={cancelSending}
                    testId="cancel-booking-modal"
                    onSubmit={this.handleCancelBookingSubmit}
                    onClose={this.handleCancelBookingClose}
                />

                <ConfirmModal
                    state={confirmState}
                    onConfirm={handleConfirm}
                    onCancel={handleCancel}
                    confirmLabel={t.Batch_CreateAll()}
                    cancelLabel={t.Batch_Cancel()}
                />
            </>
        );
    }

    render() {
        return (
            <>
                {this.renderHeading()}
                {this.renderActions()}
                {this.renderCreateModals()}
                {this.renderCalendar()}
                {this.renderEditModal()}
                {this.renderConfirmations()}
            </>
        );
    }
}

export const ExpertSlotsIsland: React.FC<ExpertSlotsProps> = (props) => (
    <IrabiPreviewProvider currentAccountId={props.currentAccountId}>
        <ExpertSlotsIslandInner {...props} />
    </IrabiPreviewProvider>
);
