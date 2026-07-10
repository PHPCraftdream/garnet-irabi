import * as React from 'react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/DateUtils';
import {sendPost} from '@common/Api/sendPost';
import {useSending} from '@common/hooks/useSending';
import {useBodyScrollLock} from '@common/hooks/useBodyScrollLock';

import {showToast} from '@common/Components/GlobalToast';
import {Portal} from '@common/Components/Portal';
import {D} from '@common/Debug/D';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {appUrl} from '@common/Utils/appUrl';

export interface PendingBookingItem {
    booking_id: number;
    user_id: number;
    user_name: string;
    slot_id: number;
    start_at: number;
    duration_min: number;
    cost: number;
    created_at: number;
}

interface Props {
    bookings: PendingBookingItem[];
}

function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (name[0] || '?').toUpperCase();
}

export const ExpertPendingBookings: React.FC<Props> = ({bookings: initialBookings}) => {
    const [bookings, setBookings] = React.useState<PendingBookingItem[]>(initialBookings);
    const {sending: confirmSending, withSending: withConfirmSending} = useSending();
    const {sending: rejectSending, withSending: withRejectSending} = useSending();
    
    const [activeId, setActiveId] = React.useState<number | null>(null);
    const [rejectId, setRejectId] = React.useState<number | null>(null);
    const [rejectReason, setRejectReason] = React.useState('');
    const reasonRef = React.useRef<HTMLTextAreaElement>(null);

    useBodyScrollLock(rejectId !== null);

    React.useEffect(() => {
        if (rejectId !== null && reasonRef.current) {
            reasonRef.current.focus();
        }
    }, [rejectId]);

    React.useEffect(() => {
        if (rejectId === null) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setRejectId(null);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [rejectId]);

    const handleConfirm = (bookingId: number) => {
        setActiveId(bookingId);
        withConfirmSending(async () => {
            D('teaching.pendingBookings.confirm', {bookingId});
            try {
                await sendPost(appUrl('/expert/~confirmBooking'), {booking_id: bookingId});
                setBookings(prev => prev.filter(b => b.booking_id !== bookingId));
            } catch (e: any) {
                D('teaching.pendingBookings.error', {action: 'confirm', bookingId, error: e?.message});
                showToast(e?.message || t.General_Error(), 'danger');
            } finally {
                setActiveId(null);
            }
        });
    };

    const openRejectModal = (bookingId: number) => {
        setRejectId(bookingId);
        setRejectReason('');
    };

    const handleReject = () => {
        if (rejectId === null || !rejectReason.trim()) return;
        const bookingId = rejectId;
        setActiveId(bookingId);
        withRejectSending(async () => {
            D('teaching.pendingBookings.reject', {bookingId, reason: rejectReason});
            try {
                await sendPost(appUrl('/expert/~cancelBooking'), {booking_id: bookingId, reason: rejectReason.trim()});
                setBookings(prev => prev.filter(b => b.booking_id !== bookingId));
                setRejectId(null);
                setRejectReason('');
            } catch (e: any) {
                D('teaching.pendingBookings.error', {action: 'reject', bookingId, error: e?.message});
                showToast(e?.message || t.General_Error(), 'danger');
            } finally {
                setActiveId(null);
            }
        });
    };

    return (
        <div data-test-id="expert-pending-bookings">
            
            <div className="section-header-row">
                <h2 className="section-heading mb-0">
                    {t.Teaching_PendingBookingsTitle()}
                    {bookings.length > 0 && (
                        <span className="ms-2 count-badge-warning">
                            {bookings.length}
                        </span>
                    )}
                </h2>
            </div>

            {bookings.length === 0 ? (
                <div className="empty-state-card">
                    <p className="text-muted font-medium">{t.Teaching_NoPendingBookings()}</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {bookings.map(b => (
                        <div
                            key={b.booking_id}
                            className="booking-row"
                            data-test-id={`pending-booking-${b.booking_id}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className="avatar-circle">
                                    {getInitials(b.user_name)}
                                </div>
                                <div>
                                    <div className="text-sm font-medium text-on-surface" data-test-id={`pending-user-link-${b.booking_id}`}>
                                        <UserLink
                                            id={b.user_id}
                                            name={b.user_name}
                                            className="text-accent hover:underline"
                                        />
                                    </div>
                                    <div className="text-xs text-muted">
                                        {formatTs(b.start_at)} &middot; {b.duration_min} {t.Slot_Duration_Min()}
                                        {b.cost > 0 && <> &middot; {b.cost} &#8381;</>}
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2 flex-shrink-0">
                                <button
                                    className="btn btn-sm btn-success"
                                    disabled={confirmSending && activeId === b.booking_id}
                                    onClick={() => handleConfirm(b.booking_id)}
                                    data-test-id={`pending-confirm-${b.booking_id}`}
                                >
                                    {confirmSending && activeId === b.booking_id ? '...' : t.Booking_Confirm()}
                                </button>
                                <button
                                    className="btn btn-sm btn-outline-danger"
                                    disabled={rejectSending && activeId === b.booking_id}
                                    onClick={() => openRejectModal(b.booking_id)}
                                    data-test-id={`pending-reject-${b.booking_id}`}
                                >
                                    {t.Teaching_RejectBooking()}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {rejectId !== null && (
                <Portal><div
                    className="fg-modal-overlay"
                    onClick={(e) => { if (e.target === e.currentTarget) { setRejectId(null); } }}
                    data-test-id="reject-modal-overlay"
                >
                    <div
                        className="fg-modal-card fg-modal-card-md"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="fg-modal-header-row">
                            <h5 className="fg-modal-title">{t.Teaching_RejectBooking()}</h5>
                            <button
                                type="button"
                                className="fg-modal-close-x"
                                onClick={() => setRejectId(null)}
                                title={t.Action_Close()}
                                data-test-id="reject-modal-close"
                            >
                                &times;
                            </button>
                        </div>
                        <div className="mb-3 text-sm text-warning" data-test-id="reject-impact">{t.Booking_DeclineImpact()}</div>
                        <div className="mb-4">
                            <label className="text-sm text-secondary mb-1 block">{t.Cancel_ReasonLabel()}</label>
                            <textarea
                                ref={reasonRef}
                                className="form-control"
                                rows={3}
                                placeholder={t.Cancel_ReasonPlaceholder()}
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                data-test-id="reject-reason-input"
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                className="btn btn-secondary"
                                onClick={() => setRejectId(null)}
                                data-test-id="reject-modal-cancel"
                            >
                                {t.Action_Cancel()}
                            </button>
                            <button
                                className="btn btn-danger"
                                disabled={!rejectReason.trim() || (rejectSending && activeId === rejectId)}
                                onClick={handleReject}
                                data-test-id="reject-modal-confirm"
                            >
                                {rejectSending && activeId === rejectId ? '...' : t.Teaching_RejectBooking()}
                            </button>
                        </div>
                    </div>
                </div></Portal>
            )}
        </div>
    );
};
