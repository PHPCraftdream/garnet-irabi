import * as React from 'react';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {EntityLink} from '../../../Common/people/EntityLink';
import {userLinks} from '../../../Common/people/entityLinkHelpers';
import {UniversalBadge} from '../../../Common/booking/StatusBadge';
import {translateStatus} from '../../../Common/booking/statusHelpers';
import {AdminSlotRow} from './bookingsTypes';

const SlotTr: React.FC<{row: AdminSlotRow}> = ({row}) => (
    <tr className="admin-booking-table-row" data-test-id={`admin-slot-row-${row.id}`}>
        <td className="admin-booking-table-cell-muted-nowrap">#{row.id}</td>
        <td className="admin-booking-table-cell">
            {row.expert_id > 0
                ? <EntityLink name={row.expert_name} {...userLinks(row.expert_id, row.expert_has_profile)} isModerator={true} />
                : <span className="admin-booking-table-muted">—</span>}
        </td>
        <td className="admin-booking-table-cell-nowrap">
            {row.start_at
                ? <>{formatTs(row.start_at)} — {formatTs(row.end_at)}</>
                : <span className="admin-booking-table-muted">—</span>}
        </td>
        <td className="admin-booking-table-cell-nowrap">{row.duration_min} {t.Slot_Duration_Min()}</td>
        <td className="admin-booking-table-cell-nowrap">{row.cost}</td>
        <td className="admin-booking-table-cell">
            {row.is_online ? t.Admin_Slot_Online() : (row.location || <span className="admin-booking-table-muted">—</span>)}
        </td>
        <td className="admin-booking-table-cell-nowrap">{row.max_users}</td>
        <td className="admin-booking-table-cell"><UniversalBadge status={row.status} label={translateStatus(row.status)} /></td>
    </tr>
);

const COLUMNS = [
    () => 'ID',
    () => t.Admin_Slot_Expert(),
    () => t.Admin_Slot_Time(),
    () => t.Admin_Slot_Duration(),
    () => t.Admin_Slot_Cost(),
    () => t.Admin_Slot_Location(),
    () => t.Admin_Slot_MaxUsers(),
    () => t.Slot_Status(),
];

const renderHeading = (column: () => string, index: number) => <th key={index} className="admin-booking-table-heading">{column()}</th>;
const renderRow = (row: AdminSlotRow) => <SlotTr key={row.id} row={row} />;

export const AdminSlotsTable: React.FC<{items: AdminSlotRow[]}> = ({items}) => (
    <div className="booking-card-shell">
        <div className="admin-booking-table-scroll">
            <table className="admin-table">
                <thead>
                    <tr className="admin-booking-table-row">
                        {COLUMNS.map(renderHeading)}
                    </tr>
                </thead>
                <tbody>
                    {items.map(renderRow)}
                </tbody>
            </table>
        </div>
    </div>
);
