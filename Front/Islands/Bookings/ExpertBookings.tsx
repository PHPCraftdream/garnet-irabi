import * as React from 'react';
import {D} from '@common/Debug/D';
import {useConfirm} from '@common/hooks/useConfirm';

import {ConfirmModal} from '@common/Components/ConfirmModal';
import {showToast} from '@common/Components/GlobalToast';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/DateUtils';
import {sendPost} from '@common/Api/sendPost';
import {appUrl} from '@common/Utils/appUrl';
import {UniversalBadge} from '../../Common/StatusBadge';
import {translateStatus} from '../../Common/statusHelpers';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {IrabiPreviewProvider} from '../../Common/IrabiPreviewProvider';
import {PageHeader} from '@common/Components/PageHeader';
import {CalendarCheck} from 'lucide-react';

interface Booking {
    id: number;
    bookable_id: number;
    bookable_type: string;
    status: string;
    created_at: number;
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

const ExpertBookingsIslandInner: React.FC<ExpertBookingsProps> = ({bookings: initialBookings, slots, title}) => {
    const [bookingList, setBookingList] = React.useState<Booking[]>(initialBookings);
    const [loading, setLoading] = React.useState<Record<number, boolean>>({});
    const {confirmState, confirm, handleConfirm: onModalConfirm, handleCancel: onModalCancel} = useConfirm();
    

    const handleConfirm = async (bookingId: number) => {
        if (loading[bookingId]) return;
        setLoading(prev => ({...prev, [bookingId]: true}));
        D('booking.confirm', {bookingId});
        try {
            await sendPost(appUrl('/expert/~confirmBooking'), {booking_id: bookingId});
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
        const impact = target?.status === 'confirmed' ? t.Booking_CancelImpact() : t.Booking_DeclineImpact();
        const ok = await confirm(`${t.Booking_CancelConfirm()} ${impact}`);
        if (!ok) return;
        setLoading(prev => ({...prev, [bookingId]: true}));
        D('booking.cancel', {bookingId, source: 'expert'});
        try {
            await sendPost(appUrl('/expert/~cancelBooking'), {booking_id: bookingId});
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
                {bookingList.length === 0 ? (
                    <div>
                        <p className="text-muted">{t.Booking_NoBookings()}</p>
                    </div>
                ) : (
                    bookingList.map(booking => (
                        <div key={booking.id}>
                            <div className="card" data-test-id={`booking-card-${booking.id}`}>
                                <div className="card-body">
                                    <h5 className="card-title">
                                        {t.Booking_Slot()}: {slots[booking.bookable_id] ? formatTs(slots[booking.bookable_id].start_at) : t.Booking_NA()}
                                    </h5>
                                    {booking.user_name && (
                                        <p className="card-text mb-2">
                                            <strong>{t.Booking_UserName()}:</strong>{' '}
                                            {booking.user_id ? (
                                                <UserLink id={booking.user_id} name={booking.user_name} className="text-accent hover:underline" />
                                            ) : booking.user_name}
                                        </p>
                                    )}
                                    <p className="card-text mb-2">
                                        <strong>{t.Slot_Status()}:</strong>{' '}
                                        <UniversalBadge status={booking.status} label={translateStatus(booking.status)} />
                                    </p>
                                    <p className="card-text mb-0">
                                        <strong>{t.Booking_Created()}:</strong> {formatTs(booking.created_at)}
                                    </p>
                                    {(booking.status === 'pending' || booking.status === 'confirmed') && (
                                        <div className="mt-3 flex gap-2">
                                            {booking.status === 'pending' && (
                                                <button
                                                    className="btn btn-sm btn-success"
                                                    data-test-id={`confirm-btn-${booking.id}`}
                                                    disabled={!!loading[booking.id]}
                                                    onClick={() => handleConfirm(booking.id)}
                                                >
                                                    {loading[booking.id] ? '...' : t.Booking_Confirm()}
                                                </button>
                                            )}
                                            <button
                                                className="btn btn-sm btn-outline-danger"
                                                data-test-id={`expert-cancel-btn-${booking.id}`}
                                                disabled={!!loading[booking.id]}
                                                onClick={() => handleCancel(booking.id)}
                                            >
                                                {loading[booking.id] ? '...' : t.Booking_Cancel()}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
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
