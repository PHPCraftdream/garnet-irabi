import * as React from 'react';
import {D} from '@common/Debug/D';

import {useConfirm} from '@common/hooks/useConfirm';
import {useSending} from '@common/hooks/useSending';
import {useBodyScrollLock} from '@common/hooks/useBodyScrollLock';
import {showToast} from '@common/Components/GlobalToast';
import {ConfirmModal} from '@common/Components/ConfirmModal';
import SendButton from '@common/Components/SendButton';
import {Portal} from '@common/Components/Portal';
import {sendPost} from '@common/Api/sendPost';
import {appUrl} from '@common/Utils/appUrl';
import {DateInput} from '@common/Components/ui/DateInput';
import {tsToInputDate, tsToInputTime} from '@common/Utils/DateUtils';
import {TimezoneNotice} from '@common/Components/TimezoneNotice';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {Slot, ExpertSlotsProps} from './types';
import {CreateSlotForm} from './components/CreateSlotForm';
import {BatchSlotWizard} from './components/BatchSlotWizard';
import {ExpertCalendar} from './components/ExpertCalendar';
import {IrabiPreviewProvider} from '../../Common/IrabiPreviewProvider';
import {usePreview} from '@common/Components/UserPreviewModal/PreviewContext';
import {PageHeader} from '@common/Components/PageHeader';
import {CalendarClock} from 'lucide-react';

interface EditSlotModalProps {
    slot: Slot;
    onClose: () => void;
    onSaved: (updated: Slot) => void;
    onError: (msg: string) => void;
}

const EditSlotModal: React.FC<EditSlotModalProps> = ({slot, onClose, onSaved, onError}) => {
    useBodyScrollLock(true);
    const {sending, withSending} = useSending();

    const [editDate, setEditDate] = React.useState(() => tsToInputDate(slot.start_at));
    const [editTime, setEditTime] = React.useState(() => tsToInputTime(slot.start_at));
    const [editDuration, setEditDuration] = React.useState(slot.duration_min ?? 60);
    const [editCost, setEditCost] = React.useState(slot.cost);
    const [editPenaltyPercent, setEditPenaltyPercent] = React.useState(slot.cancellation_penalty_percent ?? 0);
    const [validationError, setValidationError] = React.useState('');

    // Close on Escape
    React.useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onClose();
    };

    const handleSave = () => {
        setValidationError('');

        // Past-time validation is performed on the backend in the expert's TZ
        // (see ExpertSlotsService::editSlot → DateUtils::parseUserDateTime). The
        // server rejects with "Cannot reschedule to a past time" and that error
        // surfaces via onError → showToast, so no client-side wall-clock check
        // is needed (and a client-side `new Date(date+T+time)` would parse in
        // the browser's TZ, violating AGENTS.md §12).

        withSending(async () => {
            D('teaching.slot.edit', {slotId: slot.id, date: editDate, time: editTime});
            try {
                const resp = await sendPost(appUrl('/expert/~editSlot'), {
                    slot_id: slot.id,
                    date: editDate,
                    time: editTime,
                    duration: editDuration,
                    cost: editCost,
                    cancellation_penalty_percent: editPenaltyPercent,
                });
                const updated = (resp as any)?.slot ?? slot;
                onSaved(updated);
            } catch (e: any) {
                D('teaching.error', {action: 'editSlot', slotId: slot.id, error: e?.message});
                // Show overlap errors inline instead of toast
                const resp = e?.response;
                if (resp && typeof resp === 'object' && resp.overlap) {
                    setValidationError(resp.error || t.Slot_OverlapError());
                } else {
                    const msg = (resp && typeof resp === 'object' && resp.error) ? resp.error : (e?.message || t.General_Error());
                    onError(msg);
                }
            }
        });
    };

    return (
        <Portal><div
            className="fg-modal-overlay"
            onClick={handleOverlayClick}
            data-test-id="edit-slot-modal"
        >
            <div className="fg-modal-card fg-modal-card-md">
                {/* Header */}
                <div className="fg-modal-header-row">
                    <h3 className="fg-modal-title">{t.Slot_EditTitle()}</h3>
                    <button
                        type="button"
                        className="fg-modal-close-x"
                        onClick={onClose}
                        title={t.Action_Close()}
                        data-test-id="edit-slot-close"
                    >
                        &times;
                    </button>
                </div>

                {/* Validation error */}
                {validationError && (
                    <div className="mb-3 text-sm text-danger">{validationError}</div>
                )}

                {/* Form fields */}
                <div className="space-y-3 mb-4">
                    <div>
                        <label className="text-sm text-secondary mb-1 block">{t.Slot_Date()}</label>
                        <DateInput
                            value={editDate}
                            onChange={e => setEditDate(e.target.value)}
                            data-test-id="edit-slot-date"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-secondary mb-1 block">{t.Slot_Time()}</label>
                        <DateInput
                            type="time"
                            value={editTime}
                            onChange={e => setEditTime(e.target.value)}
                            data-test-id="edit-slot-time"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-secondary mb-1 block">{t.Slot_Duration()}</label>
                        <input
                            type="number"
                            className="form-control"
                            value={editDuration}
                            onChange={e => setEditDuration(Number(e.target.value))}
                            min={15}
                            data-test-id="edit-slot-duration"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-secondary mb-1 block">{t.Slot_Cost()}</label>
                        <input
                            type="number"
                            className="form-control"
                            value={editCost}
                            onChange={e => setEditCost(Number(e.target.value))}
                            min={0}
                            data-test-id="edit-slot-cost"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-secondary mb-1 block">{t.Slot_PenaltyPercent()}</label>
                        <input
                            type="number"
                            className="form-control"
                            value={editPenaltyPercent}
                            onChange={e => setEditPenaltyPercent(Number(e.target.value))}
                            min={0}
                            max={100}
                            data-test-id="edit-slot-penalty-percent"
                        />
                        <div className="text-xs text-muted mt-1">{t.Slot_PenaltyHelp()}</div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 justify-end">
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={onClose}
                        disabled={sending}
                        data-test-id="edit-slot-cancel"
                    >
                        {t.Batch_Cancel()}
                    </button>
                    <SendButton
                        onClick={handleSave}
                        sending={sending}
                        label={t.Slot_Save()}
                        testId="edit-slot-save"
                    />
                </div>
            </div>
        </div></Portal>
    );
};

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
        showToast(t.Batch_Created(), 'success');
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
            await sendPost(appUrl('/expert/~cancelSlot'), {slot_id: id});
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
            await sendPost(appUrl('/expert/~deleteSlot'), {slot_id: id});
            setSlots(prev => prev.filter(s => s.id !== id));
        } catch (e: any) {
            D('teaching.error', {action: 'deleteSlot', slotId: id, error: e?.message});
            showToast(e?.message || t.General_Error(), 'danger');
        }
    };

    // Cancel booking modal state
    const [cancelBookingSlotId, setCancelBookingSlotId] = React.useState<number | null>(null);
    const [cancelReason, setCancelReason] = React.useState('');
    const [cancelReasonError, setCancelReasonError] = React.useState('');
    const {sending: cancelSending, withSending: withCancelSending} = useSending();
    useBodyScrollLock(cancelBookingSlotId !== null);

    const handleConfirmBooking = async (slot: Slot) => {
        if (!slot.booking_id) return;
        D('teaching.slot.confirmBooking', {slotId: slot.id, bookingId: slot.booking_id});
        try {
            await sendPost(appUrl('/expert/~confirmBooking'), {booking_id: slot.booking_id});
            setSlots(prev => prev.map(s => s.id === slot.id ? {...s, booking_status: 'confirmed'} : s));
            showToast(t.Booking_Status_Confirmed(), 'success');
        } catch (e: any) {
            D('teaching.error', {action: 'confirmBooking', slotId: slot.id, error: e?.message});
            showToast(e?.message || t.General_Error(), 'danger');
        }
    };

    const handleCancelBookingOpen = (id: number) => {
        setCancelBookingSlotId(id);
        setCancelReason('');
        setCancelReasonError('');
    };

    const handleCancelBookingClose = () => {
        setCancelBookingSlotId(null);
        setCancelReason('');
        setCancelReasonError('');
    };

    // Close cancel booking modal on Escape
    React.useEffect(() => {
        if (cancelBookingSlotId === null) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleCancelBookingClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [cancelBookingSlotId]);

    const handleCancelBookingSubmit = () => {
        if (!cancelReason.trim()) {
            setCancelReasonError(t.Cancel_ReasonRequired());
            return;
        }
        withCancelSending(async () => {
            D('teaching.slot.cancelBooking', {slotId: cancelBookingSlotId, reason: cancelReason});
            try {
                await sendPost(appUrl('/expert/~cancelBookedSlot'), {
                    slot_id: cancelBookingSlotId,
                    reason: cancelReason.trim(),
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
        setSlots(prev => prev.map(s => s.id === updated.id ? updated : s));
        setEditingSlot(null);
        showToast(t.Slot_Rescheduled(), 'success');
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
            const resp = await sendPost(appUrl('/expert/~editSlot'), {
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

{/* Cancel booking modal */}
            {cancelBookingSlotId !== null && (
                <Portal><div
                    className="fg-modal-overlay"
                    onClick={(e) => { if (e.target === e.currentTarget) handleCancelBookingClose(); }}
                    data-test-id="cancel-booking-modal"
                >
                    <div className="fg-modal-card fg-modal-card-md">
                        <div className="fg-modal-header-row">
                            <h3 className="fg-modal-title">{t.Cancel_BookedSlotTitle()}</h3>
                            <button
                                type="button"
                                className="fg-modal-close-x"
                                onClick={handleCancelBookingClose}
                                title={t.Action_Close()}
                                data-test-id="cancel-booking-close"
                            >
                                &times;
                            </button>
                        </div>

                        {(() => {
                            const cs = slots.find(s => s.id === cancelBookingSlotId);
                            const impact = cs?.booking_status === 'confirmed' ? t.Booking_CancelImpact() : t.Booking_DeclineImpact();
                            return <div className="mb-3 text-sm text-warning" data-test-id="cancel-booking-impact">{impact}</div>;
                        })()}

                        {cancelReasonError && (
                            <div className="mb-3 text-sm text-danger">{cancelReasonError}</div>
                        )}

                        <div className="mb-4">
                            <label className="text-sm text-secondary mb-1 block">{t.Cancel_ReasonLabel()}</label>
                            <textarea
                                className="form-control"
                                rows={3}
                                value={cancelReason}
                                onChange={e => { setCancelReason(e.target.value); setCancelReasonError(''); }}
                                placeholder={t.Cancel_ReasonPlaceholder()}
                                data-test-id="cancel-booking-reason"
                            />
                        </div>

                        <div className="flex gap-2 justify-end">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={handleCancelBookingClose}
                                disabled={cancelSending}
                                data-test-id="cancel-booking-dismiss"
                            >
                                {t.Batch_Cancel()}
                            </button>
                            <SendButton
                                onClick={handleCancelBookingSubmit}
                                sending={cancelSending}
                                label={t.Cancel_Submit()}
                                testId="cancel-booking-submit"
                                variant="outline-warning"
                            />
                        </div>
                    </div>
                </div></Portal>
            )}


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
