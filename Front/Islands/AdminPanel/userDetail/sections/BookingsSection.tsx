import * as React from 'react';
import {formatTs} from '@common/Utils/DateUtils';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {statusLabel} from '../../gridRenders';
import {BookingRow, BOOKING_STATUS_CLS} from '../userDetailTypes';
import {DetailTable} from '../DetailTable';
import {PersonCell} from '../PersonCell';

interface Props {
    bookings: BookingRow[];
    onOpenUser: (id: number, name: string) => void;
}

const BookingTr: React.FC<{b: BookingRow; onOpenUser: Props['onOpenUser']}> = ({b, onOpenUser}) => (
    <tr>
        <td className="admin-cell-id">#{b.id}</td>
        <td>{`Slot #${b.bookable_id}`}</td>
        <td><PersonCell id={b.expert_id} name={b.expert_name} onOpen={onOpenUser} /></td>
        <td className="admin-cell-note">{b.slot ? formatTs(b.slot.start_at) : '—'}</td>
        <td>
            <span className={`badge ${BOOKING_STATUS_CLS[b.status] ?? 'status-muted'}`}>
                {statusLabel(b.status)}
            </span>
        </td>
        <td className="admin-cell-note">{formatTs(b.created_at)}</td>
    </tr>
);

export const BookingsSection: React.FC<Props> = ({bookings, onOpenUser}) => {
    if (bookings.length === 0) {
        return <div className="text-muted text-sm py-4">{t.User_NoBookings()}</div>;
    }

    return (
        <DetailTable
            title={t.Admin_Bookings()}
            count={bookings.length}
            columns={[
                'ID',
                t.Booking_Slot(),
                t.Slot_Expert(),
                t.Slot_Date(),
                t.Admin_Booking_Status(),
                t.Booking_Created(),
            ]}
        >
            {bookings.map(b => <BookingTr key={b.id} b={b} onOpenUser={onOpenUser} />)}
        </DetailTable>
    );
};
