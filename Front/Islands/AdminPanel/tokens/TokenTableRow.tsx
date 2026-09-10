import * as React from 'react';
import {formatTs} from '@common/Utils/DateUtils';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {AdminUserLink} from '../../../Common/EntityLinks';
import {TokenRow, TOKEN_STATUS_CLASS, accountTypeLabel, tokenStatusLabel} from './tokenTypes';

interface ActionsProps {
    row: TokenRow;
    onShowRegistrations: (row: TokenRow) => void;
    onEdit: (row: TokenRow) => void;
    onToggleDisable: (row: TokenRow) => void;
    onDelete: (row: TokenRow) => void;
}

const TokenActions: React.FC<ActionsProps> = ({row, onShowRegistrations, onEdit, onToggleDisable, onDelete}) => (
    <div className="flex gap-1 flex-wrap">
        {row.used > 0 && (
            <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => onShowRegistrations(row)}
                data-test-id={`token-regs-${row.id}`}
            >
                {t.Admin_Tokens_Registrations()}
            </button>
        )}
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onEdit(row)} data-test-id={`token-edit-${row.id}`}>
            {t.Action_Edit()}
        </button>
        <button type="button" className="btn btn-sm btn-outline-warning" onClick={() => onToggleDisable(row)} data-test-id={`token-toggle-${row.id}`}>
            {row.is_disabled ? t.Admin_Tokens_Enable() : t.Admin_Tokens_Disable()}
        </button>
        <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => onDelete(row)} data-test-id={`token-delete-${row.id}`}>
            {t.Action_Delete()}
        </button>
    </div>
);

interface Props extends ActionsProps {
    onShowLink: (url: string) => void;
}

/** Одна строка таблицы приглашений. */
export const TokenTableRow: React.FC<Props> = ({row, onShowLink, ...actions}) => (
    <tr className="border-b border-subtle" data-test-id={`token-row-${row.id}`}>
        <td className="p-3">{row.label || '—'}</td>
        <td className="p-3" data-test-id={`token-account-type-${row.id}`}>{accountTypeLabel(row.account_type)}</td>
        <td className="p-3">
            {/*
              * Кнопка говорит, что произойдёт при нажатии. Раньше здесь
              * повторялся заголовок столбца — существительное, — и владелец
              * нажимал её в ожидании копирования, а потом не мог понять,
              * случилось ли вообще что-нибудь.
              */}
            <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => onShowLink(row.url)}
                title={row.url}
                data-test-id={`token-copy-${row.id}`}
            >
                {t.Admin_Tokens_ShowLink()}
            </button>
        </td>
        <td className="p-3 whitespace-nowrap">{row.used} / {row.max_uses}</td>
        <td className="p-3">
            <span className={`common-status-pill ${TOKEN_STATUS_CLASS[row.status] || 'status-muted'}`}>
                {tokenStatusLabel(row.status)}
            </span>
        </td>
        <td className="p-3 whitespace-nowrap text-muted text-xs">
            {row.expires_at ? formatTs(row.expires_at) : t.Admin_Tokens_NoExpiry()}
        </td>
        <td className="p-3 whitespace-nowrap text-muted text-xs">{formatTs(row.created_at)}</td>
        <td className="p-3">
            {row.created_by > 0
                ? <AdminUserLink id={row.created_by} name={row.created_by_name || `#${row.created_by}`} />
                : <span className="text-muted">—</span>}
        </td>
        <td className="p-3">
            <TokenActions row={row} {...actions} />
        </td>
    </tr>
);
