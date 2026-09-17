import * as React from 'react';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {appUrl} from '@common/Utils/Url/appUrl';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {TicketRow, TICKET_STATUS_CLS, ticketStatusLabel} from '../userDetailTypes';
import {DetailTable} from '../DetailTable';

const TicketTr: React.FC<{tk: TicketRow}> = ({tk}) => {
    const href = appUrl(`/admin/support/#ticket=${tk.id}`);

    return (
        <tr>
            <td className="admin-cell-id">
                <a href={href} className="admin-link-btn-strong" data-test-id={`user-detail-ticket-link-${tk.id}`}>
                    #{tk.id}
                </a>
            </td>
            <td>
                <a href={href} className="admin-link-btn-strong">{tk.subject}</a>
            </td>
            <td>
                <span className={`badge ${TICKET_STATUS_CLS[tk.status] ?? 'status-muted'}`}>
                    {ticketStatusLabel(tk.status)}
                </span>
            </td>
            <td className="admin-cell-note">{formatTs(tk.updated_at)}</td>
        </tr>
    );
};

export const TicketsSection: React.FC<{tickets: TicketRow[]}> = ({tickets}) => {
    if (tickets.length === 0) return null;

    return (
        <DetailTable
            title={t.User_SupportTickets()}
            count={tickets.length}
            columns={['ID', t.User_TicketSubject(), t.User_TicketStatus(), t.User_TicketUpdated()]}
        >
            {tickets.map(tk => <TicketTr key={tk.id} tk={tk} />)}
        </DetailTable>
    );
};
