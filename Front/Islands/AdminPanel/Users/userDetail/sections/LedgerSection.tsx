import * as React from 'react';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {entryTypeLabel} from '../../../Grid/gridLabels';
import {LedgerRow} from '../userDetailTypes';
import {DetailTable} from '../DetailTable';
import {PersonCell} from '../PersonCell';

interface Props {
    ledger: LedgerRow[];
    onOpenUser: (id: number, name: string) => void;
}

const LedgerTr: React.FC<{e: LedgerRow; onOpenUser: Props['onOpenUser']}> = ({e, onOpenUser}) => (
    <tr className="admin-user-history-row">
        <td className="admin-user-history-cell-time">{formatTs(e.created_at)}</td>
        <td className="admin-user-history-cell-mono">{entryTypeLabel(e.entry_type)}</td>
        <td className="admin-user-history-cell">
            {e.is_credit
                ? <span className="admin-user-role-badge" data-tone="success">{t.Admin_Ledger_Credit()}</span>
                : <span className="admin-user-role-badge" data-tone="danger">{t.Admin_Ledger_Debit()}</span>}
        </td>
        <td className="admin-user-history-cell">{e.amount} &#8381;</td>
        <td className="admin-user-history-cell"><PersonCell id={e.party_id} name={e.party_name} onOpen={onOpenUser} /></td>
        <td className="admin-user-history-cell-muted-small">{e.note ?? '—'}</td>
    </tr>
);

export const LedgerSection: React.FC<Props> = ({ledger, onOpenUser}) => {
    if (ledger.length === 0) return null;

    const rows: React.ReactNode[] = [];
    for (const e of ledger) rows.push(<LedgerTr key={e.id} e={e} onOpenUser={onOpenUser} />);

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
            {rows}
        </DetailTable>
    );
};
