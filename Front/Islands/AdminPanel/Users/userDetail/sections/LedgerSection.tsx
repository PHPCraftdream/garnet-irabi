import * as React from 'react';
import {formatTs} from '@common/Utils/Time/DateUtils/format/formatTs';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {entryTypeLabel} from '@/Islands/AdminPanel/Grid/gridLabels';
import {LedgerRow} from '@/Islands/AdminPanel/Users/userDetail/status/userDetailTypes';
import {DetailTable} from '@/Islands/AdminPanel/Users/userDetail/DetailTable';
import {PersonCell} from '@/Islands/AdminPanel/Users/userDetail/PersonCell';

const admin_Finance = t.Admin_Finance;
const admin_Ledger_Amount = t.Admin_Ledger_Amount;
const admin_Ledger_Credit = t.Admin_Ledger_Credit;
const admin_Ledger_Date = t.Admin_Ledger_Date;
const admin_Ledger_Debit = t.Admin_Ledger_Debit;
const admin_Ledger_Direction = t.Admin_Ledger_Direction;
const admin_Ledger_Note = t.Admin_Ledger_Note;
const admin_Ledger_Type = t.Admin_Ledger_Type;
const user_LedgerParty = t.User_LedgerParty;

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
                ? <span className="admin-user-role-badge" data-tone="success">{admin_Ledger_Credit()}</span>
                : <span className="admin-user-role-badge" data-tone="danger">{admin_Ledger_Debit()}</span>}
        </td>
        <td className="admin-user-history-cell">{e.amount} &#8381;</td>
        <td className="admin-user-history-cell"><PersonCell id={e.party_id} name={e.party_name}
        onOpen={onOpenUser} /></td>
        <td className="admin-user-history-cell-muted-small">{e.note ?? '—'}</td>
    </tr>
);

/** Отображает данные раздела и передаёт действия пользователя обработчикам. */
export const LedgerSection: React.FC<Props> = ({ledger, onOpenUser}) => {
    if (ledger.length === 0) return null;

    const rows: React.ReactNode[] = [];
    for (const e of ledger) rows.push(<LedgerTr key={e.id} e={e} onOpenUser={onOpenUser} />);

    return (
        <DetailTable
            title={admin_Finance()}
            count={ledger.length}
            columns={[
                admin_Ledger_Date(),
                admin_Ledger_Type(),
                admin_Ledger_Direction(),
                admin_Ledger_Amount(),
                user_LedgerParty(),
                admin_Ledger_Note(),
            ]}
        >
            {rows}
        </DetailTable>
    );
};
