import * as React from 'react';
import {useState, useEffect, useCallback} from 'react';
import {useSending} from '@common/hooks/useSending';
import {useBodyScrollLock} from '@common/hooks/useBodyScrollLock';
import SendButton from '@common/Components/SendButton';
import {sendPost} from '@common/Api/sendPost';
import {Portal} from '@common/Components/Portal';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {canActNow, isActionable} from '../../Common/bookingAction';
import {SlotCancelForm} from './SlotCancelForm';
import {SlotItem, ExpertMap} from './types';
import QuickChat from '../../Common/QuickChat';
import {SlotDateTimeBlock, SlotExpertBlock, SlotFormatBlock, SlotPriceBlock} from './SlotDetailSections';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {formatTime as fmtTime, formatDateLong as fmtFullDate} from '@common/Utils/DateUtils';
import {appUrl} from '@common/Utils/appUrl';

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

                {/* Scrollable content */}
                <div className="overflow-y-auto flex-1 p-4 space-y-4">
                    <SlotDateTimeBlock startAt={slot.start_at} endTs={endTs} durationMin={slot.duration_min || 60} />
                    <SlotPriceBlock cost={slot.cost} />
                    <SlotFormatBlock slot={slot} />
                    {expert && <SlotExpertBlock expertId={slot.expert_id} expert={expert} />}

                    {/* Quick Chat section */}
                    {quickChatUrl && sendUrl && currentAccountId && expert && (
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
                    )}

                    {/* Cancellation reason (if slot was cancelled) */}
                    {cancelReason && (
                        <div className="px-3 py-2 rounded-lg bg-surface-alt border border-default" data-test-id="slot-detail-cancel-reason">
                            <div className="text-sm text-muted mb-1">{t.Slot_CancelReason()}</div>
                            <div className="text-sm">{cancelReason}</div>
                        </div>
                    )}

                    {/* Cancel booking form */}
                    {canCancel && !showCancelForm && (
                        <button
                            type="button"
                            className="w-full btn btn-outline-warning"
                            onClick={() => setShowCancelForm(true)}
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
                            onReasonChange={v => { setReason(v); setReasonError(''); }}
                            onSubmit={handleCancelSubmit}
                            onDismiss={() => { setShowCancelForm(false); setReason(''); setReasonError(''); }}
                        />
                    )}
                </div>
            </div>
        </div></Portal>
    );
}
