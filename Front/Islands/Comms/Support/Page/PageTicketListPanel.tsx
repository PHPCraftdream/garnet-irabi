import * as React from 'react';

import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {SupportTicket} from '../parts/supportTypes';
import {SupportTicketRow} from '../parts/SupportTicketRow';
import Pagination, {PaginationLabels} from '@common/Components/Layout/Paging/Pagination';

const supportNewTicket = t.Support_NewTicket;
const supportNoTickets = t.Support_NoTickets;

interface ListPanelProps {
    tickets: SupportTicket[];
    selectedId: number | null;
    readTicketIds: Set<number>;
    onSelect: (ticketId: number) => void;
    onNew: () => void;
    page: number;
    totalPages: number;
    total: number;
    loading: boolean;
    labels: PaginationLabels;
    perPage: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (perPage: number) => void;
}

/** Левая панель страницы: список обращений с пагинацией. */
export const PageTicketListPanel: React.FC<ListPanelProps> = ({
    tickets,
    selectedId,
    readTicketIds,
    onSelect,
    onNew,
    page,
    totalPages,
    total,
    loading,
    labels,
    perPage,
    onPageChange,
    onPageSizeChange,
}) => {
    const rows: React.ReactNode[] = [];
    for (const ticket of tickets) {
        rows.push(<SupportTicketRow key={ticket.id} ticket={ticket} active={selectedId === ticket.id}
            readLocally={readTicketIds.has(ticket.id)} onSelect={onSelect} />);
    }
    return (

        <div className="support-list-panel">
            <div className="support-list-header">
                <button
                    type="button"
                    data-test-id="support-new-ticket-btn"
                    className="im-conversation-create"
                    onClick={onNew}
                >
                    + {supportNewTicket()}
                </button>
            </div>
            <div className="support-list-pagination">
                <Pagination
                    page={page}
                    totalPages={totalPages}
                    total={total}
                    loading={loading}
                    compact
                    onPageChange={onPageChange}
                    labels={labels}
                    pageSize={perPage}
                    onPageSizeChange={onPageSizeChange}
                />
            </div>
            <div className="support-list-scroll">
                {tickets.length === 0 && <div className="support-empty">{supportNoTickets()}</div>}
                {rows}
            </div>
            {totalPages > 1 && (
                <div className="support-list-pagination-bottom">
                    <Pagination
                        page={page}
                        totalPages={totalPages}
                        total={total}
                        loading={loading}
                        compact
                        onPageChange={onPageChange}
                        labels={labels}
                    />
                </div>
            )}
        </div>
    );
};
