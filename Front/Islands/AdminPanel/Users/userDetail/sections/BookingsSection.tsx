import * as React from 'react';
import {formatTs} from '@common/Utils/Time/DateUtils/format/formatTs';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {statusLabel} from '@/Islands/AdminPanel/Grid/statusLabel';
import {BookingRow, BOOKING_STATUS_TONE} from '@/Islands/AdminPanel/Users/userDetail/status/userDetailTypes';
import {DetailTable} from '@/Islands/AdminPanel/Users/userDetail/DetailTable';
import {PersonCell} from '@/Islands/AdminPanel/Users/userDetail/PersonCell';

const admin_Booking_Status = t.Admin_Booking_Status;
const admin_Bookings = t.Admin_Bookings;
const booking_Created = t.Booking_Created;
const booking_Slot = t.Booking_Slot;
const slot_Date = t.Slot_Date;
const slot_Expert = t.Slot_Expert;
const user_NoBookings = t.User_NoBookings;

interface Props {
    bookings: BookingRow[];
    onOpenUser: (id: number, name: string) => void;
}

const BookingTr: React.FC<{b: BookingRow; onOpenUser: Props['onOpenUser']}> = ({b, onOpenUser}) => (
    <tr className="admin-user-history-row">
        <td className="admin-user-history-cell-muted">#{b.id}</td>
        <td className="admin-user-history-cell">{`Slot #${b.bookable_id}`}</td>
        <td className="admin-user-history-cell"><PersonCell id={b.expert_id} name={b.expert_name}
        onOpen={onOpenUser} /></td>
        <td className="admin-user-history-cell-muted-small">{b.slot ? formatTs(b.slot.start_at) : '—'}</td>
        <td className="admin-user-history-cell">
            <span className="admin-user-role-badge" data-tone={BOOKING_STATUS_TONE[b.status] ?? 'muted'}>
                {statusLabel(b.status)}
            </span>
        </td>
        <td className="admin-user-history-cell-muted-small">{formatTs(b.created_at)}</td>
    </tr>
);

/** Отображает данные раздела и передаёт действия пользователя обработчикам. */
export const BookingsSection: React.FC<Props> = ({bookings, onOpenUser}) => {
    if (bookings.length === 0) {
        return <div className="admin-support-timeline-empty">{user_NoBookings()}</div>;
    }

    const rows: React.ReactNode[] = [];
    for (const b of bookings) rows.push(<BookingTr key={b.id} b={b} onOpenUser={onOpenUser} />);

    return (
        <DetailTable
            title={admin_Bookings()}
            count={bookings.length}
            columns={[
                'ID',
                booking_Slot(),
                slot_Expert(),
                slot_Date(),
                admin_Booking_Status(),
                booking_Created(),
            ]}
        >
            {rows}
        </DetailTable>
    );
};
