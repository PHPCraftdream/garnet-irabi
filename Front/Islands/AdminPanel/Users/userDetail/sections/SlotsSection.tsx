import * as React from 'react';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {statusLabel} from '../../../Grid/statusLabel';
import {SlotRow} from '../status/userDetailTypes';
import {SLOT_STATUS_TONE} from '../status/slotStatusTone';
import {DetailTable} from '../DetailTable';

const admin_Slots = t.Admin_Slots;
const slot_Cost = t.Slot_Cost;
const slot_DateTime = t.Slot_DateTime;
const slot_Duration = t.Slot_Duration;
const slot_Duration_Min = t.Slot_Duration_Min;
const slot_Offline = t.Slot_Offline;
const slot_Online = t.Slot_Online;
const slot_Status = t.Slot_Status;
const slot_Type = t.Slot_Type;

const SlotTr: React.FC<{s: SlotRow}> = ({s}) => (
    <tr className="admin-user-history-row">
        <td className="admin-user-history-cell-nowrap">{s.start_at ? formatTs(s.start_at) : '—'}</td>
        <td className="admin-user-history-cell">{s.duration_min} {slot_Duration_Min()}</td>
        <td className="admin-user-history-cell">{s.cost} &#8381;</td>
        <td className="admin-user-history-cell">
            {s.is_online
                ? <span className="admin-user-role-badge" data-tone="info">{slot_Online()}</span>
                : <span className="admin-user-role-badge" data-tone="secondary">{slot_Offline()}</span>}
        </td>
        <td className="admin-user-history-cell">
            <span className="admin-user-role-badge" data-tone={SLOT_STATUS_TONE[s.status] ??
        'muted'}>{statusLabel(s.status)}</span>
        </td>
    </tr>
);

/** Отображает данные раздела и передаёт действия пользователя обработчикам. */
export const SlotsSection: React.FC<{slots: SlotRow[]}> = ({slots}) => {
    if (slots.length === 0) return null;

    const rows: React.ReactNode[] = [];
    for (const s of slots) rows.push(<SlotTr key={s.id} s={s} />);

    return (
        <DetailTable
            title={admin_Slots()}
            count={slots.length}
            columns={[slot_DateTime(), slot_Duration(), slot_Cost(), slot_Type(), slot_Status()]}
        >
            {rows}
        </DetailTable>
    );
};
