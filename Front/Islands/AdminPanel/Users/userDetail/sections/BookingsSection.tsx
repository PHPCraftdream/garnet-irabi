import * as React from 'react';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {statusLabel} from '../../../Grid/gridLabels';
import {BookingRow, BOOKING_STATUS_TONE} from '../userDetailTypes';
import {DetailTable} from '../DetailTable';
import {PersonCell} from '../PersonCell';

interface Props {
    bookings: BookingRow[];
    onOpenUser: (id: number, name: string) => void;
}

const BookingTr: React.FC<{b: BookingRow; onOpenUser: Props['onOpenUser']}> = ({b, onOpenUser}) => (
    <tr className="admin-user-history-row">
        <td className="admin-user-history-cell-muted">#{b.id}</td>
        <td className="admin-user-history-cell">{`Slot #${b.bookable_id}`}</td>
        <td className="admin-user-history-cell"><PersonCell id={b.expert_id} name={b.expert_name} onOpen={onOpenUser} /></td>
        <td className="admin-user-history-cell-muted-small">{b.slot ? formatTs(b.slot.start_at) : '—'}</td>
        <td className="admin-user-history-cell">
            <span className="admin-user-role-badge" data-tone={BOOKING_STATUS_TONE[b.status] ?? 'muted'}>
                {statusLabel(b.status)}
            </span>
        </td>
        <td className="admin-user-history-cell-muted-small">{formatTs(b.created_at)}</td>
    </tr>
);

export const BookingsSection: React.FC<Props> = ({bookings, onOpenUser}) => {
    if (bookings.length === 0) {
        return <div className="admin-support-timeline-empty">{t.User_NoBookings()}</div>;
    }

    const rows: React.ReactNode[] = [];
    for (const b of bookings) rows.push(<BookingTr key={b.id} b={b} onOpenUser={onOpenUser} />);

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
            {rows}
        </DetailTable>
    );
};
