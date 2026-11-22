import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {AdminUserLink} from '../../../../Common/people/EntityLinks';
import {TokenRow, accountTypeLabel, tokenStatusLabel} from './tokenTypes';

interface Props {
    row: TokenRow;
    onShowLink: (url: string) => void;
    onShowRegistrations: (row: TokenRow) => void;
    onEdit: (row: TokenRow) => void;
    onToggleDisable: (row: TokenRow) => void;
    onDelete: (row: TokenRow) => void;
}

/** Одна строка таблицы приглашений. */
export class TokenTableRow extends AntiHookComponent<Props> {
    private readonly showLink = () => this.props.onShowLink(this.props.row.url);
    private readonly registrations = () => this.props.onShowRegistrations(this.props.row);
    private readonly edit = () => this.props.onEdit(this.props.row);
    private readonly toggle = () => this.props.onToggleDisable(this.props.row);
    private readonly remove = () => this.props.onDelete(this.props.row);

    private renderActions() {
        const {row} = this.props;
        return (
            <div className="token-row-actions">
                {row.used > 0 && <button type="button" className="booking-cancel-dismiss" onClick={this.registrations} data-test-id={`token-regs-${row.id}`}>{t.Admin_Tokens_Registrations()}</button>}
                <button type="button" className="booking-cancel-dismiss" onClick={this.edit} data-test-id={`token-edit-${row.id}`}>{t.Action_Edit()}</button>
                <button type="button" className="btn-outline-warning-full" data-token-action="compact" onClick={this.toggle} data-test-id={`token-toggle-${row.id}`}>{row.is_disabled ? t.Admin_Tokens_Enable() : t.Admin_Tokens_Disable()}</button>
                <button type="button" className="slot-remove-btn" onClick={this.remove} data-test-id={`token-delete-${row.id}`}>{t.Action_Delete()}</button>
            </div>
        );
    }

    private renderLink() {
        const {row} = this.props;
        return (
            <td className="token-cell">
                    {/*
                      * Кнопка говорит, что произойдёт при нажатии. Раньше здесь
                      * повторялся заголовок столбца — существительное, — и владелец
                      * нажимал её в ожидании копирования, а потом не мог понять,
                      * случилось ли вообще что-нибудь.
                      */}
                    <button
                        type="button"
                        className="booking-cancel-dismiss"
                        onClick={this.showLink}
                        title={row.url}
                        data-test-id={`token-copy-${row.id}`}
                    >
                        {t.Admin_Tokens_ShowLink()}
                    </button>
                </td>
        );
    }

    render() {
        const {row} = this.props;
        return (
            <tr data-test-id={`token-row-${row.id}`}>
                <td className="token-cell">{row.label || '—'}</td>
                <td className="token-cell" data-test-id={`token-account-type-${row.id}`}>{accountTypeLabel(row.account_type)}</td>
                    {this.renderLink()}
            <td className="token-cell-nowrap">{row.used} / {row.max_uses}</td>
                <td className="token-cell">
                    <span className="token-status" data-token-status={row.status}>
                        {tokenStatusLabel(row.status)}
                    </span>
                </td>
                <td className="token-cell-time">
                    {row.expires_at ? formatTs(row.expires_at) : t.Admin_Tokens_NoExpiry()}
                </td>
                <td className="token-cell-time">{formatTs(row.created_at)}</td>
                <td className="token-cell">
                    {row.created_by > 0
                        ? <AdminUserLink id={row.created_by} name={row.created_by_name || `#${row.created_by}`} />
                        : <span className="token-cell-muted">—</span>}
                </td>
                <td className="token-cell">
                    {this.renderActions()}
                </td>
            </tr>
        );
    }
}
