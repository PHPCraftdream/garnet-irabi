import * as React from 'react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {sendPost} from '@common/Api/sendPost';
import {useSending} from '@common/hooks/useSending';
import {showToast} from '@common/Components/GlobalToast';
import {D} from '@common/Debug/D';
import {appUrl} from '@common/Utils/appUrl';
import {
    actionImpact,
    actionReasonLabel,
    actionReasonPlaceholder,
    actionSubmitLabel,
    actionTitle,
} from '../../Common/booking/bookingAction';
import {ReasonModal} from '../../Common/Components/ReasonModal';
import {PendingBookingItem, PendingBookingRow} from './PendingBookingRow';

export type {PendingBookingItem} from './PendingBookingRow';

interface Props {
    bookings: PendingBookingItem[];
    /**
     * Подтверждение раньше убирало карточку из ЭТОГО списка и не говорило
     * никому больше. Список подтверждённых и счётчик держали свои копии того
     * же факта и продолжали показывать старую — три места на одной странице
     * расходились, пока страницу не перезагружали руками.
     *
     * Список теперь живёт у родителя; эти два — сообщения о том, что с ним
     * произошло.
     */
    onConfirmed: (booking: PendingBookingItem) => void;
    onRejected: (bookingId: number) => void;
}

/** Заявки, ждущие решения преподавателя. */
export const ExpertPendingBookings: React.FC<Props> = ({bookings, onConfirmed, onRejected}) => {
    const {sending: confirmSending, withSending: withConfirmSending} = useSending();
    const {sending: rejectSending, withSending: withRejectSending} = useSending();
    const [activeId, setActiveId] = React.useState<number | null>(null);
    const [rejectId, setRejectId] = React.useState<number | null>(null);

    const handleConfirm = (bookingId: number) => {
        setActiveId(bookingId);
        withConfirmSending(async () => {
            D('teaching.pendingBookings.confirm', {bookingId});
            try {
                const csrf = (window as any).__GARNET_CSRF__ ?? '';
                await sendPost(appUrl('/expert/~confirmBooking'), {CSRF_TOKEN: csrf, booking_id: bookingId});
                const confirmed = bookings.find(b => b.booking_id === bookingId);
                if (confirmed) onConfirmed(confirmed);
            } catch (e: any) {
                D('teaching.pendingBookings.error', {action: 'confirm', bookingId, error: e?.message});
                showToast(e?.message || t.General_Error(), 'danger');
            } finally {
                setActiveId(null);
            }
        });
    };

    const handleReject = (reason: string) => {
        if (rejectId === null) return;
        const bookingId = rejectId;
        setActiveId(bookingId);
        withRejectSending(async () => {
            D('teaching.pendingBookings.reject', {bookingId, reason});
            try {
                const csrf = (window as any).__GARNET_CSRF__ ?? '';
                await sendPost(appUrl('/expert/~cancelBooking'), {CSRF_TOKEN: csrf, booking_id: bookingId, reason});
                onRejected(bookingId);
                setRejectId(null);
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
                    {bookings.length > 0 && <span className="ms-2 count-badge-warning">{bookings.length}</span>}
                </h2>
            </div>

            {bookings.length === 0 && (
                <div className="empty-state-card">
                    <p className="text-muted font-medium">{t.Teaching_NoPendingBookings()}</p>
                </div>
            )}
            {bookings.length > 0 && (
                <div className="space-y-2">
                    {bookings.map(b => (
                        <PendingBookingRow
                            key={b.booking_id}
                            booking={b}
                            confirming={confirmSending && activeId === b.booking_id}
                            rejecting={rejectSending && activeId === b.booking_id}
                            onConfirm={handleConfirm}
                            onReject={setRejectId}
                        />
                    ))}
                </div>
            )}

            {/*
              * Пятая копия окна «действие с причиной», найденная при разборе.
              * Прежняя жила здесь со своим состоянием, своим Escape и своим
              * заголовком — и говорила «Отклонить бронь» там, где остальные
              * экраны уже говорили «Отклонить заявку».
              */}
            <ReasonModal
                open={rejectId !== null}
                title={actionTitle('expert', 'pending')}
                impact={actionImpact('expert', 'pending')}
                reasonLabel={actionReasonLabel('expert', 'pending')}
                reasonPlaceholder={actionReasonPlaceholder('expert', 'pending')}
                submitLabel={actionSubmitLabel('expert', 'pending')}
                sending={rejectSending}
                testId="reject-modal"
                onSubmit={handleReject}
                onClose={() => setRejectId(null)}
            />
        </div>
    );
};
