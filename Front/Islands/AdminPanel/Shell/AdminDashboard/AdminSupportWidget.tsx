import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {statusLabel} from '../../../Comms/Support/parts/render/supportStatus';
import type {SupportStatus} from '../../../Comms/Support/parts/supportTypes';
import {UniversalBadge} from '../../../../Common/booking/StatusBadge';
import {AdminUserDualLink} from '../../../../Common/people/AdminUserDualLink';

interface TicketItem {
    id: number;
    subject: string;
    status: string;
    user_id: number;
    user_login: string;
    user_name: string;
    updated_at: number;
}

interface Props {
    count: number;
    tickets: TicketItem[];
    supportUrl: string;
}

/**
 * Кто написал. Имя, логин, номер — что первым нашлось; если нет ничего,
 * строка не показывается вовсе, чтобы не оставлять «Пользователь:» с пустотой.
 */
class TicketAuthor extends AntiHookComponent<{ticket: TicketItem}> {
    render() {
        const {ticket} = this.props;
        const display = ticket.user_name || ticket.user_login || (ticket.user_id > 0 ? `#${ticket.user_id}` : '');
        if (!display) return null;

        return (
            <div className="admin-home-author" data-test-id={`admin-dash-ticket-author-${ticket.id}`}>
                {t.Booking_User()}:{' '}
                {ticket.user_id > 0
                    ? <AdminUserDualLink id={ticket.user_id} name={display} dataTestId={`admin-dash-ticket-user-${ticket.id}`} />
                    : <span>{display}</span>}
            </div>
        );
    }
}

class TicketRow extends AntiHookComponent<{ticket: TicketItem; supportUrl: string}> {
    render() {
        const {ticket, supportUrl} = this.props;
        return (
            <li className="admin-home-list-row" data-test-id={`admin-dash-ticket-${ticket.id}`}>
                <div className="admin-home-row-main">
                    <a
                        href={`${supportUrl}#ticket=${ticket.id}`}
                        className="admin-home-link-primary-truncate"
                        data-test-id={`admin-dash-ticket-link-${ticket.id}`}
                    >
                        {ticket.subject}
                    </a>
                    <TicketAuthor ticket={ticket} />
                </div>
                <div className="admin-home-row-aside">
                    <UniversalBadge status={ticket.status} label={statusLabel(ticket.status as SupportStatus)} />
                    <div className="admin-home-meta-mt">{formatTs(ticket.updated_at)}</div>
                </div>
            </li>
        );
    }
}

export class AdminSupportWidget extends AntiHookComponent<Props> {
    private readonly renderTicket = (ticket: TicketItem) => <TicketRow key={ticket.id} ticket={ticket} supportUrl={this.props.supportUrl} />;

    render() {
        const {count, tickets, supportUrl} = this.props;
        return (
            <div className="admin-dash-card" data-test-id="admin-dash-support">
                <div className="admin-home-card-header">
                    <h2 className="admin-home-card-title">{t.Admin_OpenTickets()}</h2>
                    <span className="admin-home-count" data-test-id="admin-dash-support-count">{count}</span>
                </div>

                {tickets.length === 0 && <p className="admin-home-empty">{t.Admin_NoActivity()}</p>}
                {tickets.length > 0 && (
                    <ul className="admin-home-list">
                        {tickets.map(this.renderTicket)}
                    </ul>
                )}

                <a href={supportUrl} className="admin-home-link-footer" data-test-id="admin-dash-support-link">
                    {t.Support_ViewAll()}
                </a>
            </div>
        );
    }
}
