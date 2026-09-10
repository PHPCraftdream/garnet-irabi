import * as React from 'react';
import {D} from '@common/Debug/D';

import {useConfirm} from '@common/hooks/useConfirm';
import {useSending} from '@common/hooks/useSending';
import {useBodyScrollLock} from '@common/hooks/useBodyScrollLock';
import {showToast} from '@common/Components/GlobalToast';
import {ConfirmModal} from '@common/Components/ConfirmModal';
import {Portal} from '@common/Components/Portal';
import {sendPost} from '@common/Api/sendPost';
import {appUrl} from '@common/Utils/appUrl';
import {tsToInputTime} from '@common/Utils/DateUtils';
import {TimezoneNotice} from '@common/Components/TimezoneNotice';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {
    actionImpact,
    actionReasonLabel,
    actionReasonPlaceholder,
    actionSubmitLabel,
    actionTitle,
} from '../../Common/bookingAction';
import {ReasonModal} from '../../Common/Components/ReasonModal';
import {EditSlotModal} from './components/EditSlotModal';
import {Slot, ExpertSlotsProps} from './types';
import {CreateSlotForm} from './components/CreateSlotForm';
import {BatchSlotWizard} from './components/BatchSlotWizard';
import {ExpertCalendar} from './components/ExpertCalendar';
import {IrabiPreviewProvider} from '../../Common/IrabiPreviewProvider';
import {usePreview} from '@common/Components/UserPreviewModal/PreviewContext';
import {PageHeader} from '@common/Components/PageHeader';
import {CalendarClock} from 'lucide-react';

const ExpertSlotsIslandInner: React.FC<ExpertSlotsProps> = (props) => {
    const preview = usePreview();
    
    const {confirmState, confirm, handleConfirm, handleCancel} = useConfirm();

    const [slots, setSlots] = React.useState<Slot[]>(props.slots || []);
    const [editingSlot, setEditingSlot] = React.useState<Slot | null>(null);

    // Create slot modal state
    const [showCreateModal, setShowCreateModal] = React.useState(false);
    useBodyScrollLock(showCreateModal);

    // Batch slot modal state
    const [showBatchModal, setShowBatchModal] = React.useState(false);
    useBodyScrollLock(showBatchModal);

    const handleUserClick = (userId: number, userName: string) => {
        preview?.openPreview(userId, userName);
    };

    const handleSlotCreated = (newSlot?: Slot) => {
        if (newSlot) {
            setSlots(prev => [...prev, newSlot]);
        }
        setShowCreateModal(false);
        // Batch_Created is a counter label ("Slots created: ") meant to be
        // followed by a number, as the batch wizard does. Creating one slot
        // has no number to append, so it showed as a dangling "Created:".
        showToast(t.Slot_Created(), 'success');
    };

    const handleBatchSuccess = (msg: string, newSlots?: Slot[]) => {
        showToast(msg, 'success');
        if (newSlots && newSlots.length > 0) {
            setSlots(prev => [...prev, ...newSlots]);
        }
        setShowBatchModal(false);
    };

    const handleCancelSlot = async (id: number) => {
        const ok = await confirm(t.Slot_CancelConfirm(), {confirmLabel: t.Action_Cancel(), variant: 'danger'});
        if (!ok) return;
        D('teaching.slot.cancel', {slotId: id});
        try {
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            await sendPost(appUrl('/expert/~cancelSlot'), {CSRF_TOKEN: csrf, slot_id: id});
            setSlots(prev => prev.map(s => s.id === id ? {...s, status: 'cancelled'} : s));
            showToast(t.Cancel_Success(), 'success');
        } catch (e: any) {
            D('teaching.error', {action: 'cancelSlot', slotId: id, error: e?.message});
            showToast(e?.message || t.General_Error(), 'danger');
        }
    };

    const handleDeleteSlot = async (id: number) => {
        const ok = await confirm(t.Slot_DeleteConfirm(), {confirmLabel: t.Action_Delete(), variant: 'danger'});
        if (!ok) return;
        D('teaching.slot.delete', {slotId: id});
        try {
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            await sendPost(appUrl('/expert/~deleteSlot'), {CSRF_TOKEN: csrf, slot_id: id});
            setSlots(prev => prev.filter(s => s.id !== id));
        } catch (e: any) {
            D('teaching.error', {action: 'deleteSlot', slotId: id, error: e?.message});
            showToast(e?.message || t.General_Error(), 'danger');
        }
    };

    // Снаружи остаётся только «какая бронь открыта»: текст причины, его
    // проверка, Escape и блокировка прокрутки живут внутри ReasonModal.
    const [cancelBookingSlotId, setCancelBookingSlotId] = React.useState<number | null>(null);
    const {sending: cancelSending, withSending: withCancelSending} = useSending();
    const cancelSlotStatus = slots.find(s => s.id === cancelBookingSlotId)?.booking_status;

    const handleConfirmBooking = async (slot: Slot) => {
        if (!slot.booking_id) return;
        D('teaching.slot.confirmBooking', {slotId: slot.id, bookingId: slot.booking_id});
        try {
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            await sendPost(appUrl('/expert/~confirmBooking'), {CSRF_TOKEN: csrf, booking_id: slot.booking_id});
            setSlots(prev => prev.map(s => s.id === slot.id ? {...s, booking_status: 'confirmed'} : s));
            showToast(t.Booking_Status_Confirmed(), 'success');
        } catch (e: any) {
            D('teaching.error', {action: 'confirmBooking', slotId: slot.id, error: e?.message});
            showToast(e?.message || t.General_Error(), 'danger');
        }
    };

    const handleCancelBookingOpen = (id: number) => setCancelBookingSlotId(id);
    const handleCancelBookingClose = () => setCancelBookingSlotId(null);

    const handleCancelBookingSubmit = (reason: string) => {
        withCancelSending(async () => {
            D('teaching.slot.cancelBooking', {slotId: cancelBookingSlotId, reason});
            try {
                const csrf = (window as any).__GARNET_CSRF__ ?? '';
                // D-130: a group slot with open seats stays status='free'
                // even with active bookings on it (fills to 'booked' only
                // once max_users is reached) — cancelBookedSlot() refuses
                // anything but a full slot, so this path needs the other
                // endpoint. Both now collect and store the same reason.
                const targetStatus = slots.find(s => s.id === cancelBookingSlotId)?.status;
                const endpoint = targetStatus === 'free' ? '/expert/~cancelSlot' : '/expert/~cancelBookedSlot';
                await sendPost(appUrl(endpoint), {
                    CSRF_TOKEN: csrf,
                    slot_id: cancelBookingSlotId,
                    reason,
                });
                setSlots(prev => prev.map(s => s.id === cancelBookingSlotId ? {...s, status: 'cancelled'} : s));
                showToast(t.Cancel_Success(), 'success');
                handleCancelBookingClose();
            } catch (e: any) {
                D('teaching.error', {action: 'cancelBookedSlot', slotId: cancelBookingSlotId, error: e?.message});
                showToast(e?.message || t.General_Error(), 'danger');
            }
        });
    };

    const handleEditSlot = (slot: Slot) => {
        setEditingSlot(slot);
    };

    const handleEditSaved = (updated: Slot) => {
        // Сервер отдаёт сырую строку слота — без имени записавшегося и без
        // статуса его брони, которые подмешиваются при выборке списка. Если
        // подставить её целиком, карточка на миг теряет бронь и показывает
        // «Ждёт подтверждения» вместо «Подтверждено» (заметил expert-3).
        setSlots(prev => prev.map(s => s.id === updated.id
            ? {...s, ...updated, user_id: s.user_id, user_name: s.user_name, booking_id: s.booking_id, booking_status: s.booking_status}
            : s));
        setEditingSlot(null);
        // На забронированном слоте меняется только место встречи — так и
        // говорим. Прежний текст обещал перенос занятия и обновление страницы,
        // хотя ни того, ни другого не происходило.
        showToast(editingSlot?.status === 'booked' ? t.Slot_PlaceUpdated() : t.Slot_Saved(), 'success');
    };

    const handleEditError = (msg: string) => {
        showToast(msg, 'danger');
    };

    const handleEditClose = () => {
        setEditingSlot(null);
    };

    const handleSlotDrop = async (slotId: number, newDateStr: string) => {
        const slot = slots.find(s => s.id === slotId);
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
            setSlots(prev => prev.map(s => s.id === updated.id ? updated : s));
            showToast(t.Slot_Moved(), 'success');
        } catch (e: any) {
            D('teaching.error', {action: 'dropSlot', slotId, error: e?.message});
            const resp = e?.response;
            const msg = (resp && typeof resp === 'object' && resp.error) ? resp.error : (e?.message || t.General_Error());
            showToast(msg, 'danger');
        }
    };

    // Close create modal on Escape
    React.useEffect(() => {
        if (!showCreateModal) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setShowCreateModal(false);
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [showCreateModal]);

    // Close batch modal on Escape
    React.useEffect(() => {
        if (!showBatchModal) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setShowBatchModal(false);
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [showBatchModal]);

    return (
        <>
            <PageHeader title={t.Teaching_Slots_Title()} icon={<CalendarClock size={22} aria-hidden="true" />} />

            {props.isApproved === false && (
                <div className="section-soft mb-4 p-4 border border-warning text-sm" data-test-id="expert-pending-approval">
                    {t.Expert_PendingApproval()}
                </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 mb-4">
                <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => setShowCreateModal(true)}
                    data-test-id="open-create-slot-modal"
                >
                    + {t.Slot_Create()}
                </button>
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setShowBatchModal(true)}
                    data-test-id="open-batch-slot-modal"
                >
                    {t.Batch_CreateBtn()}
                </button>
            </div>

            {/* Create slot modal */}
            {showCreateModal && (
                <Portal><div
                    className="fg-modal-overlay"
                    onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false); }}
                    data-test-id="create-slot-modal"
                >
                    <div className="fg-modal-card-flush fg-modal-card-lg">
                        <div className="fg-modal-flush-header">
                            <h3 className="fg-modal-title">{t.Slot_Create()}</h3>
                            <button
                                type="button"
                                className="fg-modal-close-x"
                                onClick={() => setShowCreateModal(false)}
                                title={t.Action_Close()}
                                data-test-id="create-slot-modal-close"
                            >
                                &times;
                            </button>
                        </div>
                        <div className="fg-modal-flush-body">
                            <CreateSlotForm
                                onSuccess={handleSlotCreated}
                                onError={msg => showToast(msg, 'danger')}
                                fieldsInfo={props.slotFieldsInfo}
                                defaultPenaltyPercent={props.defaultPenaltyPercent ?? 0}
                                onCancel={() => setShowCreateModal(false)}
                            />
                        </div>
                    </div>
                </div></Portal>
            )}

            {/* Batch slot modal */}
            {showBatchModal && (
                <Portal><div
                    className="fg-modal-overlay"
                    onClick={(e) => { if (e.target === e.currentTarget) setShowBatchModal(false); }}
                    data-test-id="batch-slot-modal"
                >
                    <div className="fg-modal-card-flush fg-modal-card-3xl">
                        <div className="fg-modal-flush-header">
                            <h3 className="fg-modal-title">{t.Batch_Title()}</h3>
                            <button
                                type="button"
                                className="fg-modal-close-x"
                                onClick={() => setShowBatchModal(false)}
                                title={t.Action_Close()}
                                data-test-id="batch-slot-modal-close"
                            >
                                &times;
                            </button>
                        </div>
                        <div className="fg-modal-flush-body">
                            <BatchSlotWizard
                                onSuccess={handleBatchSuccess}
                                onError={msg => showToast(msg, 'danger')}
                                onConfirm={confirm}
                                onCancel={() => setShowBatchModal(false)}
                            />
                        </div>
                    </div>
                </div></Portal>
            )}

            {/* Soft panel background — same treatment as the user slots calendar. */}
            <div className="section-soft space-y-5">
                <TimezoneNotice infoOnly />

                <ExpertCalendar
                    slots={slots}
                    onCancel={handleCancelSlot}
                    onEdit={handleEditSlot}
                    onCancelBooking={handleCancelBookingOpen}
                    onConfirmBooking={handleConfirmBooking}
                    onDelete={handleDeleteSlot}
                    onUserClick={handleUserClick}
                    onSlotDrop={handleSlotDrop}
                />
            </div>

            {editingSlot && (
                <EditSlotModal
                    slot={editingSlot}
                    onClose={handleEditClose}
                    onSaved={handleEditSaved}
                    onError={handleEditError}
                />
            )}

            {/*
              * Отказ по брони и отмена занятия — одно окно с разными словами.
              * Раньше здесь стояла собственная копия со своим состоянием: она
              * и осталась нетронутой, когда названия действий развели на
              * соседнем экране (нашёл expert-3).
              */}
            <ReasonModal
                open={cancelBookingSlotId !== null}
                title={actionTitle('expert', cancelSlotStatus)}
                impact={actionImpact('expert', cancelSlotStatus)}
                reasonLabel={actionReasonLabel('expert', cancelSlotStatus)}
                reasonPlaceholder={actionReasonPlaceholder('expert', cancelSlotStatus)}
                submitLabel={actionSubmitLabel('expert', cancelSlotStatus)}
                sending={cancelSending}
                testId="cancel-booking-modal"
                onSubmit={handleCancelBookingSubmit}
                onClose={handleCancelBookingClose}
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
};

export const ExpertSlotsIsland: React.FC<ExpertSlotsProps> = (props) => (
    <IrabiPreviewProvider currentAccountId={props.currentAccountId}>
        <ExpertSlotsIslandInner {...props} />
    </IrabiPreviewProvider>
);
