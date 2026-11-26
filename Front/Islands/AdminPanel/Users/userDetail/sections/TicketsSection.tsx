import * as React from 'react';
import {formatTs} from '@common/Utils/Time/DateUtils/format/formatTs';
import {appUrl} from '@common/Utils/Url/appUrl';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {TicketRow} from '@/Islands/AdminPanel/Users/userDetail/status/userDetailTypes';
import {ticketStatusLabel} from '@/Islands/AdminPanel/Users/userDetail/status/ticketStatusLabel';
import {TICKET_STATUS_TONE} from '@/Islands/AdminPanel/Users/userDetail/status/ticketStatusTone';
import {DetailTable} from '@/Islands/AdminPanel/Users/userDetail/DetailTable';

const user_SupportTickets = t.User_SupportTickets;
const user_TicketStatus = t.User_TicketStatus;
const user_TicketSubject = t.User_TicketSubject;
const user_TicketUpdated = t.User_TicketUpdated;

const TicketTr: React.FC<{tk: TicketRow}> = ({tk}) => {
    const href = appUrl(`/admin/support/#ticket=${tk.id}`);

    return (
        <tr className="admin-user-history-row">
            <td className="admin-user-history-cell-muted">
                <a href={href} className="admin-support-queue-link" data-test-id={`user-detail-ticket-link-${tk.id}`}>
                    #{tk.id}
                </a>
            </td>
            <td className="admin-user-history-cell">
                <a href={href} className="admin-support-queue-link">{tk.subject}</a>
            </td>
            <td className="admin-user-history-cell">
                <span className="admin-user-role-badge" data-tone={TICKET_STATUS_TONE[tk.status] ?? 'muted'}>
                    {ticketStatusLabel(tk.status)}
                </span>
            </td>
            <td className="admin-user-history-cell-muted-small">{formatTs(tk.updated_at)}</td>
        </tr>
    );
};

/** Отображает данные раздела и передаёт действия пользователя обработчикам. */
export const TicketsSection: React.FC<{tickets: TicketRow[]}> = ({tickets}) => {
    if (tickets.length === 0) return null;

    const rows: React.ReactNode[] = [];
    for (const tk of tickets) rows.push(<TicketTr key={tk.id} tk={tk} />);

    return (
        <DetailTable
            title={user_SupportTickets()}
            count={tickets.length}
            columns={['ID', user_TicketSubject(), user_TicketStatus(), user_TicketUpdated()]}
        >
            {rows}
        </DetailTable>
    );
};
