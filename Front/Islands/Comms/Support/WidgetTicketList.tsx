import * as React from 'react';

import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {SupportTicket} from './parts/supportTypes';
import {SupportTicketRow} from './parts/SupportTicketRow';

interface TicketListProps {
    loadingTickets: boolean;
    tickets: SupportTicket[];
    onNew: () => void;
    onOpen: (ticketId: number) => void;
}

/** Список обращений. */
export const WidgetTicketList: React.FC<TicketListProps> = ({loadingTickets, tickets, onNew, onOpen}) => (
    <div className="flex flex-col h-full">
        <div className="p-3 border-b border-subtle">
            <button
                type="button"
                data-test-id="support-new-ticket-btn"
                className="support-new-btn-soft"
                onClick={onNew}
            >
                + {t.Support_NewTicket()}
            </button>
        </div>
        <div className="support-list-scroll">
            {loadingTickets && <div className="support-empty">{t.User_Loading()}</div>}
            {!loadingTickets && tickets.length === 0 && (
                <div className="support-empty">{t.Support_NoTickets()}</div>
            )}
            {!loadingTickets && tickets.map(ticket => (
                <SupportTicketRow
                    key={ticket.id}
                    ticket={ticket}
                    active={false}
                    className="support-widget-ticket-row"
                    onSelect={onOpen}
                />
            ))}
        </div>
    </div>
);
