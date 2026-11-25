import * as React from 'react';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {EntityLink} from '../../../../Common/people/links/EntityLink';
import {userLinks} from '../../../../Common/people/links/userLinks';
import {UniversalBadge} from '../../../../Common/booking/status/StatusBadge';
import {translateStatus} from '../../../../Common/booking/status/statusHelpers';
import {AdminBookingRow} from '../shared/bookingsTypes';

const BookingTr: React.FC<{row: AdminBookingRow}> = ({row}) => (
    <tr className="admin-booking-table-row" data-test-id={`admin-booking-row-${row.id}`}>
        <td className="admin-booking-table-cell-muted-nowrap">#{row.id}</td>
        <td className="admin-booking-table-cell">
            <EntityLink name={row.user_name} {...userLinks(row.user_id, false)} isModerator={true} />
        </td>
        <td className="admin-booking-table-cell">
            {row.expert_id > 0
                ? <EntityLink name={row.expert_name} {...userLinks(row.expert_id, row.expert_has_profile)}
        isModerator={true} />
                : <span className="admin-booking-table-muted">—</span>}
        </td>
        <td className="admin-booking-table-cell-nowrap">
            {row.slot_time ? formatTs(row.slot_time) : <span
        className="admin-booking-table-muted">#{row.bookable_id}</span>}
        </td>
        <td className="admin-booking-table-cell"><UniversalBadge status={row.status}
        label={translateStatus(row.status)} /></td>
        <td className="admin-booking-table-cell-muted-nowrap-small">{formatTs(row.created_at)}</td>
    </tr>
);

const COLUMNS = [
    () => 'ID',
    () => t.Admin_Booking_User(),
    () => t.Slot_Expert(),
    () => t.Admin_Booking_Slot(),
    () => t.Admin_Booking_Status(),
    () => t.Admin_Booking_Created(),
];

const renderHeading = (column: () => string, index: number) => <th key={index}
        className="admin-booking-table-heading">{column()}</th>;
const renderRow = (row: AdminBookingRow) => <BookingTr key={row.id} row={row} />;

/** Отображает данные раздела и передаёт действия пользователя обработчикам. */
export const AdminBookingsTable: React.FC<{items: AdminBookingRow[]}> = ({items}) => (
    <div className="booking-card-shell">
        <div className="admin-booking-table-scroll">
            <table className="admin-table">
                <thead>
                    <tr className="admin-booking-table-row">{COLUMNS.map(renderHeading)}</tr>
                </thead>
                <tbody>{items.map(renderRow)}</tbody>
            </table>
        </div>
    </div>
);
