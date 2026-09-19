import * as React from 'react';

import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {SupportTicket, SupportMessage} from './parts/supportTypes';
import {StatusBadge} from './parts/supportRenders';
import {SupportTicketRow} from './parts/SupportTicketRow';
import {SupportMessageList} from './parts/SupportBubble';
import Pagination, {PaginationLabels} from '@common/Components/Layout/Paging/Pagination';
import AttachmentPicker, {PendingFile} from '../../../Common/attachments/AttachmentPicker';
import SendButton from '@common/Components/Controls/SendButton';
import {useCtrlEnter, CTRL_ENTER_HINT} from '@common/hooks/ui/useCtrlEnter';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {ChevronLeft} from 'lucide-react';

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
}) => (
    <div className="support-list-panel">
        <div className="support-list-header">
            <button
                type="button"
                data-test-id="support-new-ticket-btn"
                className="support-new-btn"
                onClick={onNew}
            >
                + {t.Support_NewTicket()}
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
            {tickets.length === 0 && <div className="support-empty">{t.Support_NoTickets()}</div>}
            {tickets.map(ticket => (
                <SupportTicketRow
                    key={ticket.id}
                    ticket={ticket}
                    active={selectedId === ticket.id}
                    readLocally={readTicketIds.has(ticket.id)}
                    onSelect={onSelect}
                />
            ))}
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

interface NewFormProps {
    subject: string;
    onSubjectChange: (v: string) => void;
    message: string;
    onMessageChange: (v: string) => void;
    files: PendingFile[];
    onFilesChange: (files: PendingFile[]) => void;
    onSubmit: () => void;
    onCancel: () => void;
    sending: boolean;
}

/** Форма нового обращения. */
export const PageNewTicketForm: React.FC<NewFormProps> = ({subject, onSubjectChange, message, onMessageChange, files, onFilesChange, onSubmit, onCancel, sending}) => (
    <div className="p-6 flex flex-col gap-4">
        <h3 className="text-lg font-semibold text-on-surface">{t.Support_NewTicket()}</h3>
        <div>
            <label className="text-sm text-secondary mb-1 block">{t.Support_Subject()}</label>
            <input
                type="text"
                data-test-id="support-subject-input"
                className="form-control"
                value={subject}
                onChange={e => onSubjectChange(e.target.value)}
                placeholder={t.Support_Subject()}
            />
        </div>
        <div>
            <label className="text-sm text-secondary mb-1 block">{t.Support_Message()}</label>
            <textarea
                data-test-id="support-message-input"
                className="form-control"
                rows={6}
                value={message}
                onChange={e => onMessageChange(e.target.value)}
                placeholder={t.Support_Message() + CTRL_ENTER_HINT}
                onKeyDown={useCtrlEnter(onSubmit, sending || !subject.trim() || !message.trim())}
            />
        </div>
        <div className="support-thread-actions">
            <AttachmentPicker files={files} onChange={onFilesChange} />
            <SendButton
                onClick={onSubmit}
                disabled={!subject.trim() || !message.trim()}
                sending={sending}
                label={t.Support_Send()}
                testId="support-send-btn"
            />
            <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={onCancel}
            >
                {t.Support_BackToList()}
            </button>
        </div>
    </div>
);

interface ConversationProps {
    selectedTicket: SupportTicket | null;
    messages: SupportMessage[];
    loading: boolean;
    endRef: React.RefObject<HTMLDivElement>;
    replyText: string;
    onReplyTextChange: (v: string) => void;
    replyFiles: PendingFile[];
    onReplyFilesChange: (files: PendingFile[]) => void;
    onReply: () => void;
    sending: boolean;
}

/** Переписка по обращению. */
export const PageConversation: React.FC<ConversationProps> = ({selectedTicket, messages, loading, endRef, replyText, onReplyTextChange, replyFiles, onReplyFilesChange, onReply, sending}) => {
    if (!selectedTicket) return null;

    return (
        <>
            {/* Header */}
            <div className="support-conv-header">
                <div className="support-conv-header-row">
                    <h3 className="support-conv-title">{selectedTicket.subject}</h3>
                    <StatusBadge status={selectedTicket.status} />
                </div>
                <div className="support-conv-meta">
                    {t.Support_Created()}: {formatTs(selectedTicket.created_at)} &middot; {t.Support_Updated()}: {formatTs(selectedTicket.updated_at)}
                </div>
            </div>

            <SupportMessageList
                messages={messages}
                loading={loading}
                emptyText={t.Support_NoMessages()}
                loadingText={t.User_Loading()}
                endRef={endRef}
            />

            {/* Reply input */}
            <div className="support-thread-input">
                <textarea
                    data-test-id="support-reply-input"
                    className="form-control text-sm w-full mb-2"
                    rows={2}
                    aria-label={t.Support_Reply()}
                    placeholder={t.Support_Reply() + '...' + CTRL_ENTER_HINT}
                    value={replyText}
                    onChange={e => onReplyTextChange(e.target.value)}
                    onKeyDown={useCtrlEnter(onReply, sending || !replyText.trim())}
                />
                <div className="support-thread-actions">
                    <AttachmentPicker files={replyFiles} onChange={onReplyFilesChange} />
                    <SendButton
                        onClick={onReply}
                        disabled={!replyText.trim()}
                        sending={sending}
                        label={t.Support_Send()}
                        testId="support-reply-btn"
                    />
                </div>
            </div>
        </>
    );
};

export const PageBackButton: React.FC<{onBack: () => void}> = ({onBack}) => (
    <button type="button" className="support-back-btn" onClick={onBack}>
        <ChevronLeft size={16} aria-hidden="true" />
        {t.Support_BackToList()}
    </button>
);
