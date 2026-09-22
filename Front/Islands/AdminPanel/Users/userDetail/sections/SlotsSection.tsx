import * as React from 'react';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {statusLabel} from '../../../Grid/gridLabels';
import {SlotRow, SLOT_STATUS_CLS} from '../userDetailTypes';
import {DetailTable} from '../DetailTable';

const SlotTr: React.FC<{s: SlotRow}> = ({s}) => (
    <tr>
        <td className="whitespace-nowrap">{s.start_at ? formatTs(s.start_at) : '—'}</td>
        <td>{s.duration_min} {t.Slot_Duration_Min()}</td>
        <td>{s.cost} &#8381;</td>
        <td>
            {s.is_online
                ? <span className="badge bg-primary">{t.Slot_Online()}</span>
                : <span className="badge bg-secondary">{t.Slot_Offline()}</span>}
        </td>
        <td>
            <span className={`badge ${SLOT_STATUS_CLS[s.status] ?? 'status-muted'}`}>{statusLabel(s.status)}</span>
        </td>
    </tr>
);

export const SlotsSection: React.FC<{slots: SlotRow[]}> = ({slots}) => {
    if (slots.length === 0) return null;

    return (
        <DetailTable
            title={t.Admin_Slots()}
            count={slots.length}
            columns={[t.Slot_DateTime(), t.Slot_Duration(), t.Slot_Cost(), t.Slot_Type(), t.Slot_Status()]}
        >
            {slots.map(s => <SlotTr key={s.id} s={s} />)}
        </DetailTable>
    );
};
