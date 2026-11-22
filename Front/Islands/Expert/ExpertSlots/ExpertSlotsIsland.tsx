import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {D} from '@common/Support/Debug/D';

import {useConfirm} from '@common/hooks/ui/useConfirm';
import type {ConfirmOptions, ConfirmState} from '@common/hooks/ui/useConfirm';
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
import {ExpertSlotsUIState, type State} from './ExpertSlotsUIState';

function findSlot(slots: Slot[], id: number | null): Slot | undefined {
    return slots.find(slot => slot.id === id);
}

// Копия слота читает каждое поле прокси в render острова — см. render().
function copySlot(slot: Slot): Slot {
    return {...slot};
}

function showSlotError(message: string): void {
    showToast(message, 'danger');
}

const BodyScrollLock: React.FC<{locked: boolean}> = ({locked}) => {
    useBodyScrollLock(locked);
    return null;
};

const ExpertSlotsIslandInner: React.FC<ExpertSlotsProps> = (props) => {
    const preview = usePreview();
    const confirmation = useConfirm();
    const {sending: cancelSending, withSending: withCancelSending} = useSending();
    const {confirmState, confirm, handleConfirm, handleCancel} = confirmation;

    return (
        <ExpertSlotsView
            {...props}
            preview={preview}
            confirmState={confirmState}
            confirm={confirm}
            handleConfirm={handleConfirm}
            handleCancel={handleCancel}
            cancelSending={cancelSending}
            withCancelSending={withCancelSending}
        />
    );
};

interface ViewProps extends ExpertSlotsProps {
    preview: ReturnType<typeof usePreview>;
    confirmState: ConfirmState;
    confirm: (message: string, opts?: string[] | ConfirmOptions) => Promise<boolean>;
    handleConfirm: () => void;
    handleCancel: () => void;
    cancelSending: boolean;
    withCancelSending: ReturnType<typeof useSending>['withSending'];
}

const PAGE_ICON = <CalendarClock size={22} aria-hidden="true" />;

const selectShowCreateModal = (state: State) => state.showCreateModal;
const selectShowBatchModal = (state: State) => state.showBatchModal;

class ExpertSlotsView extends AntiHookComponent<ViewProps> {
    private readonly ui = new ExpertSlotsUIState(this.props.slots || []);

    protected useEffects(): void {
        this.useStoreEffect('escapeCreate', this.ui, selectShowCreateModal, this.escapeCreate);
        this.useStoreEffect('escapeBatch', this.ui, selectShowBatchModal, this.escapeBatch);
    }

    // Close create modal on Escape
    private readonly detachCreateKey = () => document.removeEventListener('keydown', this.escapeCreateKey);

    private readonly escapeCreate = (open: boolean) => {
        if (!open) return;
        document.addEventListener('keydown', this.escapeCreateKey);
        return this.detachCreateKey;
    };

    private readonly escapeCreateKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') this.ui.closeCreateModal();
    };

    // Close batch modal on Escape
    private readonly detachBatchKey = () => document.removeEventListener('keydown', this.escapeBatchKey);

    private readonly escapeBatch = (open: boolean) => {
        if (!open) return;
        document.addEventListener('keydown', this.escapeBatchKey);
        return this.detachBatchKey;
    };

    private readonly escapeBatchKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') this.ui.closeBatchModal();
    };

    private readonly handleUserClick = (userId: number, userName: string) => {
        this.props.preview?.openPreview(userId, userName);
    };

    private readonly handleSlotCreated = (newSlot?: Slot) => {
        if (newSlot) {
            this.ui.appendSlots([newSlot]);
        }
        this.ui.closeCreateModal();
        // Batch_Created is a counter label ("Slots created: ") meant to be
        // followed by a number, as the batch wizard does. Creating one slot
        // has no number to append, so it showed as a dangling "Created:".
        showToast(t.Slot_Created(), 'success');
    };

    private readonly handleBatchSuccess = (msg: string, newSlots?: Slot[]) => {
        showToast(msg, 'success');
        if (newSlots && newSlots.length > 0) {
            this.ui.appendSlots(newSlots);
        }
        this.ui.closeBatchModal();
    };

    private readonly handleCancelSlot = async (id: number) => {
        const ok = await this.props.confirm(t.Slot_CancelConfirm(), {confirmLabel: t.Action_Cancel(), variant: 'danger'});
        if (!ok) return;
        D('teaching.slot.cancel', {slotId: id});
        try {
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            await sendPost(appUrl('/expert/~cancelSlot'), {CSRF_TOKEN: csrf, slot_id: id});
            this.ui.cancelSlot(id);
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
            this.ui.removeSlot(id);
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
            this.ui.confirmBooking(slot.id);
            showToast(t.Booking_Status_Confirmed(), 'success');
        } catch (e: any) {
            D('teaching.error', {action: 'confirmBooking', slotId: slot.id, error: e?.message});
            showToast(e?.message || t.General_Error(), 'danger');
        }
    };

    private readonly handleCancelBookingOpen = (id: number) => this.ui.setCancelBookingSlotId(id);
    private readonly handleCancelBookingClose = () => this.ui.setCancelBookingSlotId(null);

    private readonly handleCancelBookingSubmit = (reason: string) => {
        const {slots, cancelBookingSlotId} = this.ui.getData();
        const {withCancelSending} = this.props;
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
                this.ui.cancelSlot(cancelBookingSlotId);
                showToast(t.Cancel_Success(), 'success');
                this.handleCancelBookingClose();
            } catch (e: any) {
                D('teaching.error', {action: 'cancelBookedSlot', slotId: cancelBookingSlotId, error: e?.message});
                showToast(e?.message || t.General_Error(), 'danger');
            }
        });
    };

    private readonly handleEditSlot = (slot: Slot) => {
        this.ui.setEditingSlot(slot);
    };

    private readonly handleEditSaved = (updated: Slot, original: Slot) => {
        // Сервер отдаёт сырую строку слота — без имени записавшегося и без
        // статуса его брони, которые подмешиваются при выборке списка. Если
        // подставить её целиком, карточка на миг теряет бронь и показывает
        // «Ждёт подтверждения» вместо «Подтверждено» (заметил expert-3).
        this.ui.replaceSlot(updated, true);
        this.ui.setEditingSlot(null);
        // На забронированном слоте меняется только место встречи — так и
        // говорим. Прежний текст обещал перенос занятия и обновление страницы,
        // хотя ни того, ни другого не происходило.
        showToast(original.status === 'booked' ? t.Slot_PlaceUpdated() : t.Slot_Saved(), 'success');
    };

    private readonly handleEditClose = () => {
        this.ui.setEditingSlot(null);
    };

    private readonly handleSlotDrop = async (slotId: number, newDateStr: string) => {
        const slot = this.ui.getData().slots.find(s => s.id === slotId);
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
            this.ui.replaceSlot(updated);
            showToast(t.Slot_Moved(), 'success');
        } catch (e: any) {
            D('teaching.error', {action: 'dropSlot', slotId, error: e?.message});
            const resp = e?.response;
            const msg = (resp && typeof resp === 'object' && resp.error) ? resp.error : (e?.message || t.General_Error());
            showToast(msg, 'danger');
        }
    };

    private renderHeading() {
        const props = this.props;
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
        const ui = this.ui;
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

    private renderCreateModals(state: State) {
        const props = this.props;
        const confirm = this.props.confirm;
        const {showCreateModal, showBatchModal} = state;
        const {closeCreateModal, closeBatchModal} = this.ui;
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

    private renderCalendar(slots: Slot[]) {
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

    private renderEditModal(editingSlot: Slot | null) {
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

    private renderConfirmations(state: State, slots: Slot[]) {
        const {cancelBookingSlotId} = state;
        const {confirmState, handleConfirm, handleCancel, cancelSending} = this.props;
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
        // Вид из useCarburetor — TReadonly; детям нужны прежние мутабельные типы.
        const state = this.useCarburetor(this.ui) as State;
        // Дети рисуют поля слотов в своих render — их чтения библиотека записывает
        // только владельцу (buildTrackedView.mjs). Спреад копирует слоты и читает
        // каждое поле: остров подписывается на изменения полей, дети получают
        // обычные объекты со свежей ссылкой.
        const slots = state.slots.map(copySlot);
        // Модалка правит поля черновика в своём render — прокси туда не отдаём.
        const editingSlot = state.editingSlot ? copySlot(state.editingSlot) : null;
        return (
            <>
                {this.renderHeading()}
                {this.renderActions()}
                {this.renderCreateModals(state)}
                {this.renderCalendar(slots)}
                {this.renderEditModal(editingSlot)}
                {this.renderConfirmations(state, slots)}
                <BodyScrollLock locked={state.showCreateModal || state.showBatchModal} />
            </>
        );
    }
}

export class ExpertSlotsIsland extends AntiHookComponent<ExpertSlotsProps> {
    render() {
        return (
            <IrabiPreviewProvider currentAccountId={this.props.currentAccountId}>
                <ExpertSlotsIslandInner {...this.props} />
            </IrabiPreviewProvider>
        );
    }
}
