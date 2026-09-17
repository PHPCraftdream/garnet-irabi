import * as React from 'react';
import {D} from '@common/Support/Debug/D';
import {useConfirm} from '@common/hooks/ui/useConfirm';

import {ConfirmModal} from '@common/Components/Feedback/ConfirmModal';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {sendPost} from '@common/Api/Send/sendPost';
import {appUrl} from '@common/Utils/Url/appUrl';
import {UniversalBadge} from '../../../Common/booking/StatusBadge';
import {translateStatus} from '../../../Common/booking/statusHelpers';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {actionCostHint, actionImpact, actionLabel, isActionable, outcomeLabel} from '../../../Common/booking/bookingAction';
import {IrabiPreviewProvider} from '../../../Common/people/IrabiPreviewProvider';
import {PageHeader} from '@common/Components/Layout/PageHeader';
import {CalendarCheck} from 'lucide-react';

interface Booking {
    id: number;
    bookable_id: number;
    bookable_type: string;
    status: string;
    created_at: number;
    /** Пусто — бронь так и не подтвердили: её сняли или отклонили, а не отменили (D-135). */
    confirmed_at?: number | null;
    cancelled_role?: string | null;
    user_id?: number;
    user_name?: string;
}

interface SlotMap {
    [slotId: string]: {
        start_at: number;
    };
}

interface ExpertBookingsProps {
    bookings: Booking[];
    slots: SlotMap;
    title: string;
    csrf: string;
}

interface CardProps {
    booking: Booking;
    slot?: {start_at: number};
    busy: boolean;
    onConfirm: (id: number) => void;
    onCancel: (id: number) => void;
}

/**
 * Входящая бронь глазами преподавателя.
 *
 * Тот же экран, что и «Брони», только вход с другой стороны: преподаватель
 * чаще подтверждает именно отсюда. Названия действий и подпись цены берутся из
 * общего `bookingAction` — одно и то же действие над одной и той же бронью не
 * должно называться по-разному в двух местах кабинета (нашла expert-2).
 */
const ExpertBookingCard: React.FC<CardProps> = ({booking, slot, busy, onConfirm, onCancel}) => (
    <div className="card" data-test-id={`booking-card-${booking.id}`}>
        <div className="card-body">
            <h5 className="card-title">
                {t.Booking_Slot()}: {slot ? formatTs(slot.start_at) : t.Booking_NA()}
            </h5>
            {booking.user_name && (
                <p className="card-text mb-2">
                    <strong>{t.Booking_UserName()}:</strong>{' '}
                    {booking.user_id
                        ? <UserLink id={booking.user_id} name={booking.user_name} className="text-accent hover:underline" />
                        : booking.user_name}
                </p>
            )}
            <p className="card-text mb-2">
                <strong>{t.Slot_Status()}:</strong>{' '}
                <UniversalBadge
                    status={booking.status}
                    label={outcomeLabel(booking) || translateStatus(booking.status)}
                />
            </p>
            <p className="card-text mb-0">
                <strong>{t.Booking_Created()}:</strong> {formatTs(booking.created_at)}
            </p>
            {isActionable(booking.status) && (
                <div className="mt-3 flex gap-2">
                    {booking.status === 'pending' && (
                        <button
                            className="btn btn-sm btn-success"
                            data-test-id={`confirm-btn-${booking.id}`}
                            disabled={busy}
                            onClick={() => onConfirm(booking.id)}
                        >
                            {busy ? '...' : t.Booking_Confirm()}
                        </button>
                    )}
                    <button
                        className="btn btn-sm btn-outline-danger"
                        data-test-id={`expert-cancel-btn-${booking.id}`}
                        disabled={busy}
                        onClick={() => onCancel(booking.id)}
                    >
                        {busy ? '...' : actionLabel('expert', booking.status)}
                    </button>
                </div>
            )}
            {isActionable(booking.status) && (
                <p className="mt-2 mb-0 text-xs text-muted" data-test-id={`booking-cost-hint-${booking.id}`}>
                    {actionCostHint('expert', booking.status)}
                </p>
            )}
        </div>
    </div>
);

const ExpertBookingsIslandInner: React.FC<ExpertBookingsProps> = ({bookings: initialBookings, slots, title}) => {
    const [bookingList, setBookingList] = React.useState<Booking[]>(initialBookings);
    const [loading, setLoading] = React.useState<Record<number, boolean>>({});
    const {confirmState, confirm, handleConfirm: onModalConfirm, handleCancel: onModalCancel} = useConfirm();
    

    const handleConfirm = async (bookingId: number) => {
        if (loading[bookingId]) return;
        setLoading(prev => ({...prev, [bookingId]: true}));
        D('booking.confirm', {bookingId});
        try {
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            await sendPost(appUrl('/expert/~confirmBooking'), {CSRF_TOKEN: csrf, booking_id: bookingId});
            setBookingList(prev => prev.map(b =>
                b.id === bookingId ? {...b, status: 'confirmed'} : b
            ));
            setLoading(prev => ({...prev, [bookingId]: false}));
        } catch (e: any) {
            D('booking.error', {action: 'confirm', bookingId, error: e?.message});
            showToast(e?.message || t.General_Error(), 'danger');
            setLoading(prev => ({...prev, [bookingId]: false}));
        }
    };

    const handleCancel = async (bookingId: number) => {
        if (loading[bookingId]) return;
        const target = bookingList.find(b => b.id === bookingId);
        const impact = actionImpact('expert', target?.status);
        const ok = await confirm(`${t.Booking_CancelConfirm()} ${impact}`);
        if (!ok) return;
        setLoading(prev => ({...prev, [bookingId]: true}));
        D('booking.cancel', {bookingId, source: 'expert'});
        try {
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            await sendPost(appUrl('/expert/~cancelBooking'), {CSRF_TOKEN: csrf, booking_id: bookingId});
            setBookingList(prev => prev.map(b =>
                b.id === bookingId ? {...b, status: 'cancelled'} : b
            ));
            setLoading(prev => ({...prev, [bookingId]: false}));
        } catch (e: any) {
            D('booking.error', {action: 'cancel', bookingId, error: e?.message});
            showToast(e?.message || t.General_Error(), 'danger');
            setLoading(prev => ({...prev, [bookingId]: false}));
        }
    };

    return (
        <>
            <PageHeader title={title} icon={<CalendarCheck size={22} aria-hidden="true" />} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {bookingList.length === 0 && <p className="text-muted">{t.Booking_NoBookings()}</p>}
                {bookingList.map(booking => (
                    <ExpertBookingCard
                        key={booking.id}
                        booking={booking}
                        slot={slots[booking.bookable_id]}
                        busy={!!loading[booking.id]}
                        onConfirm={handleConfirm}
                        onCancel={handleCancel}
                    />
                ))}
            </div>
            <ConfirmModal state={confirmState} onConfirm={onModalConfirm} onCancel={onModalCancel} />

        </>
    );
};

export const ExpertBookingsIsland: React.FC<ExpertBookingsProps> = (props) => (
    <IrabiPreviewProvider>
        <ExpertBookingsIslandInner {...props} />
    </IrabiPreviewProvider>
);
