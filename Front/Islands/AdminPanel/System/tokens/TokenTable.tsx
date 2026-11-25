import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {TokenRow} from './config/tokenTypes';
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

    /** Формирует представление данных для соответствующего раздела панели. */
function renderColumn(label: () => string, index: number) {
    return <th key={index} className="admin-grid-heading">{label()}</th>;
}

const TokenTableHead: React.FC = () => (
    <thead>
        <tr>
            {COLUMNS.map(renderColumn)}
        </tr>
    </thead>
);

interface Props {
    tokens: readonly TokenRow[];
    onShowLink: (url: string) => void;
    onShowRegistrations: (row: TokenRow) => void;
    onEdit: (row: TokenRow) => void;
    onToggleDisable: (row: TokenRow) => void;
    onDelete: (row: TokenRow) => void;
}

/** Отображает данные раздела и передаёт действия пользователя обработчикам. */
export const TokenTable: React.FC<Props> = ({tokens, ...handlers}) => {
    const rows: React.ReactNode[] = [];
    for (const row of tokens) rows.push(<TokenTableRow key={row.id} row={row} {...handlers} />);
    return (
        <div className="booking-card-shell">
            <div className="token-table-scroll">
                <table className="admin-table">
                    <TokenTableHead />
                    <tbody>{rows}</tbody>
                </table>
            </div>
        </div>
    );
};
