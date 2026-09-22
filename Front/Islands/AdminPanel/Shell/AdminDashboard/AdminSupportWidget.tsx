import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {statusLabel} from '../../../Comms/Support/parts/supportRenders';
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
const TicketAuthor: React.FC<{ticket: TicketItem}> = ({ticket}) => {
    const display = ticket.user_name || ticket.user_login || (ticket.user_id > 0 ? `#${ticket.user_id}` : '');
    if (!display) return null;

    return (
        <div className="admin-dash-meta inline-flex items-center gap-1.5" data-test-id={`admin-dash-ticket-author-${ticket.id}`}>
            {t.Booking_User()}:{' '}
            {ticket.user_id > 0
                ? <AdminUserDualLink id={ticket.user_id} name={display} dataTestId={`admin-dash-ticket-user-${ticket.id}`} />
                : <span>{display}</span>}
        </div>
    );
};

const TicketRow: React.FC<{ticket: TicketItem; supportUrl: string}> = ({ticket, supportUrl}) => (
    <li className="admin-dash-list-row" data-test-id={`admin-dash-ticket-${ticket.id}`}>
        <div className="admin-dash-row-main">
            <a
                href={`${supportUrl}#ticket=${ticket.id}`}
                className="admin-dash-link-primary-truncate"
                data-test-id={`admin-dash-ticket-link-${ticket.id}`}
            >
                {ticket.subject}
            </a>
            <TicketAuthor ticket={ticket} />
        </div>
        <div className="admin-dash-row-aside">
            <UniversalBadge status={ticket.status} label={statusLabel(ticket.status as SupportStatus)} />
            <div className="admin-dash-meta-mt">{formatTs(ticket.updated_at)}</div>
        </div>
    </li>
);

export const AdminSupportWidget: React.FC<Props> = ({count, tickets, supportUrl}) => (
    <div className="admin-dash-card" data-test-id="admin-dash-support">
        <div className="admin-dash-card-header">
            <h2 className="admin-dash-card-title">{t.Admin_OpenTickets()}</h2>
            <span className="admin-dash-count text-danger" data-test-id="admin-dash-support-count">{count}</span>
        </div>

        {tickets.length === 0 && <p className="admin-dash-empty">{t.Admin_NoActivity()}</p>}
        {tickets.length > 0 && (
            <ul className="admin-dash-list">
                {tickets.map(ticket => <TicketRow key={ticket.id} ticket={ticket} supportUrl={supportUrl} />)}
            </ul>
        )}

        <a href={supportUrl} className="admin-dash-link-footer" data-test-id="admin-dash-support-link">
            {t.Support_ViewAll()}
        </a>
    </div>
);
