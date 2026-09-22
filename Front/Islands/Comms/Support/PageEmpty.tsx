import * as React from 'react';

import {I18nForeground as t} from '../../../I18nGen/I18nForeground';

interface EmptyProps {
    ticketsCount: number;
}

/** Пустое состояние правой панели. */
export const PageEmpty: React.FC<EmptyProps> = ({ticketsCount}) => {
    // D-165: with tickets in the list but none picked yet, this fell
    // back to "Сообщений пока нет" — worded for an opened, empty
    // thread, not for "nothing is open yet". Landing on the page (or
    // any tickets.length > 0 state before a click) read as "your
    // ticket has no messages", even with a full conversation one
    // click away (found by user-4 on a 4-message ticket).
    return (
        <div className="flex-1 flex items-center justify-center text-muted text-sm" data-test-id="support-empty-panel">
            {ticketsCount === 0 ? t.Support_NoTickets() : t.Support_SelectTicket()}
        </div>
    );
};
