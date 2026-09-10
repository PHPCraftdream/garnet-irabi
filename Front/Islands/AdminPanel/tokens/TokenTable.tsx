import * as React from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {TokenRow} from './tokenTypes';
import {TokenTableRow} from './TokenTableRow';

const COLUMNS = [
    () => t.Admin_Tokens_Label(),
    () => t.Admin_Tokens_AccountType(),
    () => t.Admin_Tokens_Link(),
    () => t.Admin_Tokens_Uses(),
    () => t.Admin_Tokens_Status(),
    () => t.Admin_Tokens_ExpiresAt(),
    () => t.Admin_Tokens_CreatedAt(),
    () => t.Admin_Tokens_CreatedBy(),
    () => t.Admin_Tokens_Actions(),
];

const TokenTableHead: React.FC = () => (
    <thead>
        <tr className="border-b border-subtle">
            {COLUMNS.map((label, i) => <th key={i} className="text-left p-3">{label()}</th>)}
        </tr>
    </thead>
);

interface Props {
    tokens: TokenRow[];
    onShowLink: (url: string) => void;
    onShowRegistrations: (row: TokenRow) => void;
    onEdit: (row: TokenRow) => void;
    onToggleDisable: (row: TokenRow) => void;
    onDelete: (row: TokenRow) => void;
}

export const TokenTable: React.FC<Props> = ({tokens, ...handlers}) => (
    <div className="card">
        <div className="overflow-x-auto">
            <table className="admin-table">
                <TokenTableHead />
                <tbody>
                    {tokens.map(row => <TokenTableRow key={row.id} row={row} {...handlers} />)}
                </tbody>
            </table>
        </div>
    </div>
);
