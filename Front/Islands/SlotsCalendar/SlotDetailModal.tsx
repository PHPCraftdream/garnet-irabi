import * as React from 'react';
import {useState, useEffect, useCallback} from 'react';
import {useSending} from '@common/hooks/useSending';
import {useBodyScrollLock} from '@common/hooks/useBodyScrollLock';
import SendButton from '@common/Components/SendButton';
import {sendPost} from '@common/Api/sendPost';
import {Portal} from '@common/Components/Portal';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {SlotItem, ExpertMap} from './types';
import QuickChat from '../../Common/QuickChat';
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
    const canCancel = bookingStatus === 'pending' || bookingStatus === 'confirmed';

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
                    {/* Date & time section */}
                    <div className="p-3 rounded-lg bg-accent-subtle" data-test-id="slot-detail-datetime">
                        <div className="text-sm text-muted mb-1">{t.Slot_DateLabel()}</div>
                        <div className="font-semibold">{fmtFullDate(slot.start_at)}</div>
                        <div className="text-sm font-medium mt-0.5">
                            {fmtTime(slot.start_at)} — {fmtTime(endTs)}
                        </div>
                        <div className="text-xs text-muted mt-1">
                            {t.Slot_Duration()}: {slot.duration_min || 60} {t.Slot_Duration_Min()}
                        </div>
                    </div>

                    {/* Price */}
                    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-alt" data-test-id="slot-detail-price">
                        <span className="text-sm text-muted">{t.Slot_PricePaid()}</span>
                        <span className="font-semibold text-lg">{slot.cost} &#8381;</span>
                    </div>

                    {/* Format: online/offline */}
                    <div className="px-3 py-2 rounded-lg bg-surface-alt" data-test-id="slot-detail-format">
                        <span className={`inline-block text-xs px-2 py-0.5 rounded ${slot.is_online ? 'status-success' : 'status-notice'}`}>
                            {slot.is_online ? t.Slot_Online() : t.Slot_Offline()}
                        </span>
                        {!slot.is_online && slot.location && (
                            <div className="text-sm mt-1.5">
                                <span className="text-muted">{t.Slot_Location()}:</span> {slot.location}
                            </div>
                        )}
                    </div>

                    {/* Expert section */}
                    {expert && (
                        <div className="px-3 py-2 rounded-lg border border-default" data-test-id="slot-detail-expert">
                            <div className="text-sm text-muted mb-1">{t.Slot_Expert()}</div>
                            <div className="flex items-center justify-between">
                                <span data-test-id="slot-detail-expert-link">
                                    <UserLink
                                        id={slot.expert_id}
                                        name={expert.display_name}
                                        isExpert
                                        className="text-accent hover:underline font-medium"
                                    />
                                </span>
                                <a
                                    href={appUrl(`/im/#to=${slot.expert_id}`)}
                                    className="text-sm text-accent hover:underline"
                                    data-test-id="slot-detail-message-expert"
                                >
                                    {t.Im_GoToDialogs()}
                                </a>
                            </div>
                        </div>
                    )}

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

                    {canCancel && showCancelForm && (() => {
                        const nowSec = Math.floor(Date.now() / 1000);
                        const penaltyApplies =
                            bookingStatus === 'confirmed'
                            && slot.start_at > nowSec
                            && slot.cancellation_penalty_percent > 0
                            && slot.cost > 0;
                        const penaltyAmount = penaltyApplies
                            ? Math.floor(slot.cost * slot.cancellation_penalty_percent / 100)
                            : 0;
                        const refundAmount = slot.cost - penaltyAmount;

                        return (
                        <div className="p-3 rounded-lg border border-default bg-surface-alt space-y-3" data-test-id="slot-detail-cancel-form">
                            <div className="text-sm font-medium">{t.User_Cancel_Title()}</div>

                            {slot.cost > 0 && !penaltyApplies && (
                                <div className="text-xs text-muted" data-test-id="slot-detail-refund-full">
                                    {t.Booking_RefundInfo()}: {slot.cost} &#8381;
                                </div>
                            )}

                            {penaltyApplies && (
                                <div className="space-y-1" data-test-id="slot-detail-penalty-preview">
                                    <div className="text-xs text-warning">
                                        {t.Booking_PenaltyKeptByExpert([slot.cancellation_penalty_percent, penaltyAmount])}
                                    </div>
                                    <div className="text-xs text-muted">
                                        {t.Booking_RefundAmount([refundAmount])}
                                    </div>
                                </div>
                            )}

                            {reasonError && (
                                <div className="text-sm text-danger">{reasonError}</div>
                            )}
                            {cancelError && (
                                <div className="text-sm text-danger">{cancelError}</div>
                            )}

                            <div>
                                <label className="text-sm text-secondary mb-1 block">{t.User_Cancel_ReasonLabel()}</label>
                                <textarea
                                    className="form-control text-sm"
                                    rows={3}
                                    value={reason}
                                    onChange={e => { setReason(e.target.value); setReasonError(''); }}
                                    placeholder={t.User_Cancel_ReasonPlaceholder()}
                                    data-test-id="slot-detail-cancel-reason-input"
                                />
                            </div>

                            <div className="flex gap-2 justify-end">
                                <button
                                    type="button"
                                    className="btn btn-sm btn-outline-secondary"
                                    onClick={() => { setShowCancelForm(false); setReason(''); setReasonError(''); }}
                                >
                                    {t.Action_Cancel()}
                                </button>
                                <SendButton
                                    onClick={handleCancelSubmit}
                                    sending={sending}
                                    label={t.User_Cancel_Submit()}
                                    testId="slot-detail-cancel-submit"
                                    variant="outline-warning"
                                />
                            </div>
                        </div>
                        );
                    })()}
                </div>
            </div>
        </div></Portal>
    );
}
