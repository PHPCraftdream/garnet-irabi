import * as React from 'react';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {statusLabel} from '../../../Grid/gridLabels';
import {SlotRow, SLOT_STATUS_TONE} from '../userDetailTypes';
import {DetailTable} from '../DetailTable';

const SlotTr: React.FC<{s: SlotRow}> = ({s}) => (
    <tr className="admin-user-history-row">
        <td className="admin-user-history-cell-nowrap">{s.start_at ? formatTs(s.start_at) : '—'}</td>
        <td className="admin-user-history-cell">{s.duration_min} {t.Slot_Duration_Min()}</td>
        <td className="admin-user-history-cell">{s.cost} &#8381;</td>
        <td className="admin-user-history-cell">
            {s.is_online
                ? <span className="admin-user-role-badge" data-tone="info">{t.Slot_Online()}</span>
                : <span className="admin-user-role-badge" data-tone="secondary">{t.Slot_Offline()}</span>}
        </td>
        <td className="admin-user-history-cell">
            <span className="admin-user-role-badge" data-tone={SLOT_STATUS_TONE[s.status] ?? 'muted'}>{statusLabel(s.status)}</span>
        </td>
    </tr>
);

export const SlotsSection: React.FC<{slots: SlotRow[]}> = ({slots}) => {
    if (slots.length === 0) return null;

    const rows: React.ReactNode[] = [];
    for (const s of slots) rows.push(<SlotTr key={s.id} s={s} />);

    return (
        <DetailTable
            title={t.Admin_Slots()}
            count={slots.length}
            columns={[t.Slot_DateTime(), t.Slot_Duration(), t.Slot_Cost(), t.Slot_Type(), t.Slot_Status()]}
        >
            {rows}
        </DetailTable>
    );
};
