import * as React from 'react';
import {useState, useEffect, useRef} from 'react';
import {sendPost} from '@common/Api/sendPost';
import {sendPostFormData} from '@common/Api/sendPostFormData';
import {D} from '@common/Debug/D';
import {formatTs} from '@common/Utils/DateUtils';
import {useSending} from '@common/hooks/useSending';

import {showToast} from '@common/Components/GlobalToast';
import SendButton from '@common/Components/SendButton';
import {useCtrlEnter, CTRL_ENTER_HINT} from '@common/hooks/useCtrlEnter';
import {usePagination, PageResponse} from '@common/hooks/usePagination';
import {refreshLiveCounts} from '@common/Utils/liveCounts';
import Pagination, {PaginationLabels} from '@common/Components/Pagination';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {SupportTicket, SupportMessage} from './supportTypes';
import {StatusBadge} from './supportRenders';
import {SupportTicketRow} from './SupportTicketRow';
import {SupportMessageList} from './SupportBubble';
import AttachmentPicker, {PendingFile} from '../../Common/AttachmentPicker';
import AttachmentDisplay from '../../Common/AttachmentDisplay';
import {initAutoContext} from './autoContext';
import {useSupportThread} from './useSupportThread';
import {PageHeader} from '@common/Components/PageHeader';
import {LifeBuoy, ChevronLeft} from 'lucide-react';

interface Props {
    ticketsPagination: PageResponse<SupportTicket>;
    ticketPageUrl: string;
    messagesUrl: string;
    createUrl: string;
    replyUrl: string;
    downloadUrl: string;
    csrf: string;
}

export const SupportPageIsland: React.FC<Props> = ({ticketsPagination, ticketPageUrl, messagesUrl, createUrl, replyUrl, downloadUrl: _downloadUrl, csrf: _csrf}) => {
    const {
        items: tickets, page: ticketPage, totalPages: ticketTotalPages,
        total: ticketTotal, loading: ticketsLoading, goToPage: ticketGoToPage, refresh: ticketRefresh,
        perPage: ticketPerPage, setPerPage: ticketSetPerPage,
    } = usePagination<SupportTicket>({url: ticketPageUrl, initialData: ticketsPagination});

    const paginationLabels: PaginationLabels = {
        prev: t.Pagination_Prev(),
        next: t.Pagination_Next(),
        of: t.Pagination_Of(),
        items: t.Pagination_Items(),
    };

    const [selectedId, setSelectedId]   = useState<number | null>(null);
    const [selectedTicketData, setSelectedTicketData] = useState<SupportTicket | null>(null);
    const [readTicketIds, setReadTicketIds] = useState<Set<number>>(new Set());
    const [showNewForm, setShowNewForm] = useState(false);
    const [subject, setSubject]         = useState('');
    const [message, setMessage]         = useState('');
    const [replyText, setReplyText]     = useState('');
    const [createFiles, setCreateFiles] = useState<PendingFile[]>([]);
    const [replyFiles, setReplyFiles]   = useState<PendingFile[]>([]);
    const {sending, withSending} = useSending();
    const thread = useSupportThread({messagesUrl, createUrl, replyUrl});
    const {messages, loading: loadingMessages, messagesEndRef} = thread;
    

    // Init auto-context collector on mount
    useEffect(() => { initAutoContext(); }, []);

    const sortedTickets = tickets; // Already sorted by server (updated_at DESC)

    const fetchMessages = (ticketId: number) => {
        void thread.loadMessages(ticketId).then((r: any) => {
            if (!r) return;
            // Пометить прочитанным на месте: непрочитанный значок должен
            // погаснуть сразу, а не после следующей загрузки списка.
            setReadTicketIds(prev => new Set(prev).add(ticketId));
            if (r.ticket) setSelectedTicketData({...r.ticket, unread_user: 0});
            // D-198: открыв обращение, пользователь его прочитал — значок в
            // шапке обязан погаснуть сразу. Он жил своей жизнью на опросе раз
            // в 20 секунд, и всё это время показывал непрочитанное, которое
            // человек читает прямо сейчас.
            refreshLiveCounts();
        });
    };

    thread.usePolling(selectedId, 15000);

    const selectTicket = (ticketId: number) => {
        D('support.click', {action: 'selectTicket', ticketId});
        const ticketFromList = tickets.find(tk => tk.id === ticketId);
        if (ticketFromList) setSelectedTicketData(ticketFromList);
        setSelectedId(ticketId);
        setShowNewForm(false);
        setReplyText('');
        setReplyFiles([]);
        fetchMessages(ticketId);
    };

    const handleCreate = () => {
        if (!subject.trim() || !message.trim()) return;
        withSending(async () => {
            try {
                const r = await thread.createTicket(subject, message, createFiles);
                if (r?.ticket) {
                    D('support.created', {ticketId: r.ticket.id});
                    setShowNewForm(false);
                    setSubject('');
                    setMessage('');
                    setCreateFiles([]);
                    if (ticketPage === 1) ticketRefresh(); else ticketGoToPage(1);
                    setSelectedTicketData(r.ticket);
                    setSelectedId(r.ticket.id);
                    fetchMessages(r.ticket.id);
                    // D-211: silence at send time read as "did this go
                    // through?" — the ticket number and a measured ETA (not
                    // a hand-typed one) answer both at once.
                    const etaMinutes = r?.responseEtaMinutes;
                    const confirmation = t.Support_TicketCreatedWithId([String(r.ticket.id)])
                        + (etaMinutes ? ' ' + t.Support_TicketEtaHint([String(etaMinutes)]) : '');
                    showToast(confirmation, 'success');
                }
            } catch (err: any) {
                D('support.error', {action: 'create', error: err});
                showToast(err?.message || t.General_Error(), 'danger');
            }
        });
    };

    const handleReply = () => {
        if (!replyText.trim() || !selectedId) return;
        withSending(async () => {
            try {
                await thread.reply(selectedId, replyText, replyFiles);
                setReplyText('');
                setReplyFiles([]);
                fetchMessages(selectedId);
                // D-198: ответ меняет и статус обращения, и время последнего
                // события — то есть ровно то, что показывает строка слева.
                // Создание тикета список перечитывало, ответ — нет, и строка
                // держала прежний статус до перезагрузки страницы.
                ticketRefresh();
            } catch (err: any) {
                D('support.error', {action: 'reply', error: err});
                showToast(err?.message || t.General_Error(), 'danger');
            }
        });
    };



    const selectedTicket = selectedId ? (selectedTicketData?.id === selectedId ? selectedTicketData : tickets.find(tk => tk.id === selectedId) ?? null) : null;

    return (
        <div className="page-narrow">
            <PageHeader title={t.Support_Title()} icon={<LifeBuoy size={22} aria-hidden="true" />} />

            <div className={`support-layout ${(selectedTicket || showNewForm) ? 'support-layout-detail' : ''}`}>
                {/* Left: ticket list */}
                <div className="support-list-panel">
                    <div className="support-list-header">
                        <button
                            type="button"
                            data-test-id="support-new-ticket-btn"
                            className="support-new-btn"
                            onClick={() => { setShowNewForm(true); setSelectedId(null); setSubject(''); setMessage(''); setCreateFiles([]); }}
                        >
                            + {t.Support_NewTicket()}
                        </button>
                    </div>
                    <div className="support-list-pagination">
                        <Pagination
                            page={ticketPage}
                            totalPages={ticketTotalPages}
                            total={ticketTotal}
                            loading={ticketsLoading}
                            compact
                            onPageChange={ticketGoToPage}
                            labels={paginationLabels}
                            pageSize={ticketPerPage}
                            onPageSizeChange={ticketSetPerPage}
                        />
                    </div>
                    <div className="support-list-scroll">
                        {sortedTickets.length === 0 && <div className="support-empty">{t.Support_NoTickets()}</div>}
                        {sortedTickets.map(ticket => (
                            <SupportTicketRow
                                key={ticket.id}
                                ticket={ticket}
                                active={selectedId === ticket.id}
                                readLocally={readTicketIds.has(ticket.id)}
                                onSelect={selectTicket}
                            />
                        ))}
                    </div>
                    {ticketTotalPages > 1 && (
                        <div className="support-list-pagination-bottom">
                            <Pagination
                                page={ticketPage}
                                totalPages={ticketTotalPages}
                                total={ticketTotal}
                                loading={ticketsLoading}
                                compact
                                onPageChange={ticketGoToPage}
                                labels={paginationLabels}
                            />
                        </div>
                    )}
                </div>

                {/* Right: conversation or new form */}
                <div className="support-thread-panel">
                    {(selectedTicket || showNewForm) && (
                        <button
                            type="button"
                            className="support-back-btn"
                            onClick={() => { setSelectedId(null); setShowNewForm(false); }}
                        >
                            <ChevronLeft size={16} aria-hidden="true" />
                            {t.Support_BackToList()}
                        </button>
                    )}
                    {showNewForm ? renderNewForm() : selectedTicket ? renderConversation() : renderEmpty()}
                </div>
            </div>

            
        </div>
    );

    function renderEmpty() {
        // D-165: with tickets in the list but none picked yet, this fell
        // back to "Сообщений пока нет" — worded for an opened, empty
        // thread, not for "nothing is open yet". Landing on the page (or
        // any tickets.length > 0 state before a click) read as "your
        // ticket has no messages", even with a full conversation one
        // click away (found by user-4 on a 4-message ticket).
        return (
            <div className="flex-1 flex items-center justify-center text-muted text-sm" data-test-id="support-empty-panel">
                {tickets.length === 0 ? t.Support_NoTickets() : t.Support_SelectTicket()}
            </div>
        );
    }

    function renderNewForm() {
        return (
            <div className="p-6 flex flex-col gap-4">
                <h3 className="text-lg font-semibold text-on-surface">{t.Support_NewTicket()}</h3>
                <div>
                    <label className="text-sm text-secondary mb-1 block">{t.Support_Subject()}</label>
                    <input
                        type="text"
                        data-test-id="support-subject-input"
                        className="form-control"
                        value={subject}
                        onChange={e => setSubject(e.target.value)}
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
                        onChange={e => setMessage(e.target.value)}
                        placeholder={t.Support_Message() + CTRL_ENTER_HINT}
                        onKeyDown={useCtrlEnter(handleCreate, sending || !subject.trim() || !message.trim())}
                    />
                </div>
                <div className="support-thread-actions">
                    <AttachmentPicker files={createFiles} onChange={setCreateFiles} />
                    <SendButton
                        onClick={handleCreate}
                        disabled={!subject.trim() || !message.trim()}
                        sending={sending}
                        label={t.Support_Send()}
                        testId="support-send-btn"
                    />
                    <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={() => setShowNewForm(false)}
                    >
                        {t.Support_BackToList()}
                    </button>
                </div>
            </div>
        );
    }

    function renderConversation() {
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
                    loading={loadingMessages}
                    emptyText={t.Support_NoMessages()}
                    loadingText={t.User_Loading()}
                    endRef={messagesEndRef}
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
                        onChange={e => setReplyText(e.target.value)}
                        onKeyDown={useCtrlEnter(handleReply, sending || !replyText.trim())}
                    />
                    <div className="support-thread-actions">
                        <AttachmentPicker files={replyFiles} onChange={setReplyFiles} />
                        <SendButton
                            onClick={handleReply}
                            disabled={!replyText.trim()}
                            sending={sending}
                            label={t.Support_Send()}
                            testId="support-reply-btn"
                        />
                    </div>
                </div>
            </>
        );
    }
};
