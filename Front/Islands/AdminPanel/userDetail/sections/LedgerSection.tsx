import * as React from 'react';
import {formatTs} from '@common/Utils/DateUtils';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {entryTypeLabel} from '../../gridRenders';
import {LedgerRow} from '../userDetailTypes';
import {DetailTable} from '../DetailTable';
import {PersonCell} from '../PersonCell';

interface Props {
    ledger: LedgerRow[];
    onOpenUser: (id: number, name: string) => void;
}

const LedgerTr: React.FC<{e: LedgerRow; onOpenUser: Props['onOpenUser']}> = ({e, onOpenUser}) => (
    <tr>
        <td className="admin-cell-date">{formatTs(e.created_at)}</td>
        <td className="admin-cell-mono">{entryTypeLabel(e.entry_type)}</td>
        <td>
            {e.is_credit
                ? <span className="badge bg-success">{t.Admin_Ledger_Credit()}</span>
                : <span className="badge bg-danger">{t.Admin_Ledger_Debit()}</span>}
        </td>
        <td>{e.amount} &#8381;</td>
        <td><PersonCell id={e.party_id} name={e.party_name} onOpen={onOpenUser} /></td>
        <td className="admin-cell-note">{e.note ?? '—'}</td>
    </tr>
);

export const LedgerSection: React.FC<Props> = ({ledger, onOpenUser}) => {
    if (ledger.length === 0) return null;

    return (
        <DetailTable
            title={t.Admin_Finance()}
            count={ledger.length}
            columns={[
                t.Admin_Ledger_Date(),
                t.Admin_Ledger_Type(),
                t.Admin_Ledger_Direction(),
                t.Admin_Ledger_Amount(),
                t.User_LedgerParty(),
                t.Admin_Ledger_Note(),
            ]}
        >
            {ledger.map(e => <LedgerTr key={e.id} e={e} onOpenUser={onOpenUser} />)}
        </DetailTable>
    );
};
