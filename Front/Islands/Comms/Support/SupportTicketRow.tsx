import * as React from 'react';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {SupportTicket} from './supportTypes';
import {StatusBadge} from './supportRenders';

interface Props {
    ticket: SupportTicket;
    active: boolean;
    /** Прочитано в этой сессии — значок гасится сразу, не дожидаясь сервера. */
    readLocally?: boolean;
    /** Всплывающее окно рисует строку своим классом. */
    className?: string;
    onSelect: (ticketId: number) => void;
}

/** Строка обращения в списке: тема, счётчик непрочитанного, статус, время. */
export const SupportTicketRow: React.FC<Props> = ({ticket, active, readLocally = false, className, onSelect}) => (
    <div
        data-test-id={`support-ticket-${ticket.id}`}
        className={className ?? `support-ticket-row ${active ? 'support-ticket-row-active' : 'support-ticket-row-inactive'}`}
        onClick={() => onSelect(ticket.id)}
    >
        <div className="support-ticket-row-head">
            <span className="support-ticket-title">{ticket.subject}</span>
            {ticket.unread_user > 0 && !readLocally && (
                <span className="support-unread-badge">{ticket.unread_user}</span>
            )}
        </div>
        <div className="support-ticket-row-meta">
            <StatusBadge status={ticket.status} />
            <span className="text-xs text-muted">{formatTs(ticket.updated_at)}</span>
        </div>
    </div>
);
