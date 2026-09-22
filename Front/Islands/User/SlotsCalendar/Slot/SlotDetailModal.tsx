import * as React from 'react';
import {useState, useEffect, useCallback} from 'react';
import {useSending} from '@common/hooks/data/useSending';
import {useBodyScrollLock} from '@common/hooks/ui/useBodyScrollLock';
import SendButton from '@common/Components/Controls/SendButton';
import {sendPost} from '@common/Api/Send/sendPost';
import {Portal} from '@common/Components/Layout/Portal';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {canActNow, isActionable} from '../../../../Common/booking/bookingAction';
import {SlotCancelForm} from '../Booking/SlotCancelForm';
import {SlotItem, ExpertMap} from '../types';
import QuickChat from '../../../../Common/people/QuickChat';
import {SlotDateTimeBlock} from './Blocks/SlotDateTimeBlock';
import {SlotExpertBlock} from './Blocks/SlotExpertBlock';
import {SlotFormatBlock} from './Blocks/SlotFormatBlock';
import {SlotPriceBlock} from './Blocks/SlotPriceBlock';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {formatTime as fmtTime, formatDateLong as fmtFullDate} from '@common/Utils/Time/DateUtils';
import {appUrl} from '@common/Utils/Url/appUrl';

interface Props {
    slot: SlotItem;
    experts: ExpertMap;
    bookingStatus: string;
    bookingId: number;
    csrf: string;
    cancelReason?: string;
    quickChatUrl?: string;
    sendUrl?: string;
    currentAccountId?: number;
    onClose: () => void;
    onCancelled: (slotId: number) => void;
}

function statusBadgeClass(status: string): string {
    switch (status) {
        case 'confirmed': return 'status-success';
        case 'pending': return 'status-notice';
        case 'cancelled': return 'status-danger';
        default: return 'status-info';
    }
}

function statusText(status: string): string {
    switch (status) {
        case 'confirmed': return t.Booking_Status_Confirmed();
        case 'pending': return t.Booking_Status_Pending();
        case 'cancelled': return t.Booking_Status_Cancelled();
        default: return status;
    }
}

function ModalHeader({bookingStatus, onClose}: {bookingStatus: string; onClose: () => void}) {
    return (
        <div className="flex justify-between items-center p-4 border-b border-default sticky top-0 bg-surface rounded-t-lg z-10">
            <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">{t.Slot_Details()}</h3>
                <span className={`inline-block text-xs px-2 py-0.5 rounded font-medium ${statusBadgeClass(bookingStatus)}`}>
                    {statusText(bookingStatus)}
                </span>
            </div>
            <button
                type="button"
                className="fg-modal-close-x"
                title={t.Action_Close()}
                aria-label={t.Action_Close()}
                onClick={onClose}
                data-test-id="slot-detail-close"
            >
                &times;
            </button>
        </div>
    );
}

function QuickChatSection({slot, quickChatUrl, sendUrl, currentAccountId}: {slot: SlotItem; quickChatUrl: string; sendUrl: string; currentAccountId: number}) {
    return (
        <div className="border border-default rounded-lg overflow-hidden" data-test-id="slot-detail-quickchat">
            <div className="px-3 py-2 border-b border-default bg-surface-alt text-sm font-medium">
                {t.QuickChat_Title()}
            </div>
            <QuickChat
                partnerId={slot.expert_id}
                quickChatUrl={quickChatUrl}
                sendUrl={sendUrl}
                currentAccountId={currentAccountId}
                maxMessages={5}
            />
        </div>
    );
}

function CancelReasonNotice({reason}: {reason: string}) {
    return (
        <div className="px-3 py-2 rounded-lg bg-surface-alt border border-default" data-test-id="slot-detail-cancel-reason">
            <div className="text-sm text-muted mb-1">{t.Slot_CancelReason()}</div>
            <div className="text-sm">{reason}</div>
        </div>
    );
}

function CancelBookingSection({
    canCancel, showCancelForm, bookingStatus, slot, reason, reasonError, cancelError, sending,
    onShow, onReasonChange, onSubmit, onDismiss,
}: {
    canCancel: boolean;
    showCancelForm: boolean;
    bookingStatus: string;
    slot: SlotItem;
    reason: string;
    reasonError: string;
    cancelError: string;
    sending: boolean;
    onShow: () => void;
    onReasonChange: (v: string) => void;
    onSubmit: () => void;
    onDismiss: () => void;
}) {
    return (
        <>
            {canCancel && !showCancelForm && (
                <button
                    type="button"
                    className="w-full btn btn-outline-warning"
                    onClick={onShow}
                    data-test-id="slot-detail-cancel-btn"
                >
                    {t.Slot_CancelBooking()}
                </button>
            )}

            {canCancel && showCancelForm && (
                <SlotCancelForm
                    bookingStatus={bookingStatus}
                    cost={slot.cost}
                    penaltyPercent={slot.cancellation_penalty_percent}
                    startAt={slot.start_at}
                    reason={reason}
                    reasonError={reasonError}
                    cancelError={cancelError}
                    sending={sending}
                    onReasonChange={onReasonChange}
                    onSubmit={onSubmit}
                    onDismiss={onDismiss}
                />
            )}
        </>
    );
}

export default function SlotDetailModal({
    slot, experts, bookingStatus, bookingId, csrf: _csrf, cancelReason,
    quickChatUrl, sendUrl, currentAccountId,
    onClose, onCancelled,
}: Props) {
    useBodyScrollLock(true);
    const [showCancelForm, setShowCancelForm] = useState(false);
    const [reason, setReason] = useState('');
    const [reasonError, setReasonError] = useState('');
    const [cancelError, setCancelError] = useState('');
    const {sending, withSending} = useSending();

    const expert = experts[slot.expert_id];
    const endTs = slot.end_at || (slot.start_at + (slot.duration_min || 60) * 60);
    // D-195: время решает наравне со статусом. Подтверждённую бронь после
    // начала занятия сервер отменять отказывается, и предлагать это действие
    // здесь значило бы вести человека к гарантированному отказу.
    const canCancel = canActNow(bookingStatus, slot.start_at);
    const startedAndLocked = isActionable(bookingStatus) && !canCancel;

    const handleEscape = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
    }, [onClose]);

    useEffect(() => {
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [handleEscape]);

    const handleCancelSubmit = () => {
        if (!reason.trim()) {
            setReasonError(t.User_Cancel_ReasonRequired());
            return;
        }
        withSending(async () => {
            setCancelError('');
            try {
                const res = await sendPost(appUrl(`/bookings/id~${bookingId}/~cancel`), {
                    reason: reason.trim(),
                }) as any;
                if (res?.error) {
                    setCancelError(res.error);
                } else {
                    onCancelled(slot.id);
                    onClose();
                }
            } catch {
                setCancelError(t.General_Error());
            }
        });
    };

    return (
        <Portal><div
            className="fg-modal-overlay-high"
            onClick={onClose}
            data-test-id="slot-detail-overlay"
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={t.Slot_Details()}
                className="fg-modal-card-flush fg-modal-card-lg"
                onClick={e => e.stopPropagation()}
                data-test-id="slot-detail-modal"
            >
                {/* Sticky header */}
                <ModalHeader bookingStatus={bookingStatus} onClose={onClose} />

                {/* Scrollable content */}
                <div className="overflow-y-auto flex-1 p-4 space-y-4">
                    <SlotDateTimeBlock startAt={slot.start_at} endTs={endTs} durationMin={slot.duration_min || 60} />
                    <SlotPriceBlock cost={slot.cost} />
                    <SlotFormatBlock slot={slot} />
                    {expert && <SlotExpertBlock expertId={slot.expert_id} expert={expert} />}

                    {/* Quick Chat section */}
                    {quickChatUrl && sendUrl && currentAccountId && expert && (<QuickChatSection slot={slot} quickChatUrl={quickChatUrl} sendUrl={sendUrl} currentAccountId={currentAccountId} />)}

                    {/* Cancellation reason (if slot was cancelled) */}
                    {cancelReason && <CancelReasonNotice reason={cancelReason} />}

                    {/* Cancel booking form */}
                    <CancelBookingSection
                        canCancel={canCancel}
                        showCancelForm={showCancelForm}
                        bookingStatus={bookingStatus}
                        slot={slot}
                        reason={reason}
                        reasonError={reasonError}
                        cancelError={cancelError}
                        sending={sending}
                        onShow={() => setShowCancelForm(true)}
                        onReasonChange={v => { setReason(v); setReasonError(''); }}
                        onSubmit={handleCancelSubmit}
                        onDismiss={() => { setShowCancelForm(false); setReason(''); setReasonError(''); }}
                    />
                </div>
            </div>
        </div></Portal>
    );
}
