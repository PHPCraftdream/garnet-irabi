import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {formatTs} from '@common/Utils/Time/DateUtils/format/formatTs';
import {SupportTicket} from './supportTypes';
import {StatusBadge} from './supportRenders';

interface Props {
    ticket: SupportTicket;
    active: boolean;
    /** Прочитано в этой сессии — значок гасится сразу, не дожидаясь сервера. */
    readLocally?: boolean;
    /** Всплывающее окно рисует строку своим классом. */
    variant?: 'widget';
    onSelect: (ticketId: number) => void;
}

/** Строка обращения в списке: тема, счётчик непрочитанного, статус, время. */
export class SupportTicketRow extends AntiHookComponent<Props> {
    /** Выбирает строку списка. */
    private readonly select = () => this.props.onSelect(this.props.ticket.id);

    /** Рисует содержимое компонента. */
    render() {
        const {ticket, active, readLocally = false, variant} = this.props;
        return (
            <div
                data-test-id={`support-ticket-${ticket.id}`}
                className={variant === 'widget' ? 'support-widget-ticket-row' : 'support-page-ticket-row'}
                data-active={variant === 'widget' ? undefined : active}
                onClick={this.select}
            >
                <div className="support-ticket-heading">
                    <span className="support-ticket-title">{ticket.subject}</span>
                    {ticket.unread_user > 0 && !readLocally && (
                        <span className="support-ticket-unread">{ticket.unread_user}</span>
                    )}
                </div>
                <div className="support-ticket-metadata">
                    <StatusBadge status={ticket.status} />
                    <span className="support-ticket-time">{formatTs(ticket.updated_at)}</span>
                </div>
            </div>
        );
    }
}
