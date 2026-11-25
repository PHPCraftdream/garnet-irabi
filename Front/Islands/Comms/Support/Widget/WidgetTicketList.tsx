import * as React from 'react';

import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {SupportTicket} from '../parts/supportTypes';
import {SupportTicketRow} from '../parts/SupportTicketRow';

interface TicketListProps {
    loadingTickets: boolean;
    tickets: SupportTicket[];
    onNew: () => void;
    onOpen: (ticketId: number) => void;
}

/** Список обращений. */
export class WidgetTicketList extends React.Component<TicketListProps> {
    /** Рисует строку обращения. */
    private readonly renderTicket = (ticket: SupportTicket) => (
        <SupportTicketRow
            key={ticket.id}
            ticket={ticket}
            active={false}
            variant="widget"
            onSelect={this.props.onOpen}
        />
    );

    /** Рисует содержимое компонента. */
    public render() {
        const {loadingTickets, tickets, onNew} = this.props;
        return (
            <div className="widget-ticket-list">
                <div className="widget-ticket-heading">
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
                    {!loadingTickets && tickets.map(this.renderTicket)}
                </div>
            </div>
        );
    }
}
