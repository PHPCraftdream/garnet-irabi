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
import Pagination, {PaginationLabels} from '@common/Components/Pagination';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {SupportTicket, SupportMessage} from './supportTypes';
import {StatusBadge} from './supportRenders';
import AttachmentPicker, {PendingFile} from '../../Common/AttachmentPicker';
import AttachmentDisplay from '../../Common/AttachmentDisplay';
import {initAutoContext, collectContext} from './autoContext';
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

export const SupportPageIsland: React.FC<Props> = ({ticketsPagination, ticketPageUrl, messagesUrl, createUrl, replyUrl, downloadUrl, csrf}) => {
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
    const [messages, setMessages]       = useState<SupportMessage[]>([]);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [readTicketIds, setReadTicketIds] = useState<Set<number>>(new Set());
    const [showNewForm, setShowNewForm] = useState(false);
    const [subject, setSubject]         = useState('');
    const [message, setMessage]         = useState('');
    const [replyText, setReplyText]     = useState('');
    const [createFiles, setCreateFiles] = useState<PendingFile[]>([]);
    const [replyFiles, setReplyFiles]   = useState<PendingFile[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const {sending, withSending} = useSending();
    

    // Init auto-context collector on mount
    useEffect(() => { initAutoContext(); }, []);

    const sortedTickets = tickets; // Already sorted by server (updated_at DESC)

    const fetchMessages = (ticketId: number) => {
        setLoadingMessages(true);
        D('support.messages', {ticketId});
        sendPost(messagesUrl, {ticket_id: ticketId}).then((r: any) => {
            setMessages(r?.messages ?? []);
            D('support.messages.loaded', {ticketId, count: r?.messages?.length ?? 0});
            // Mark ticket as read locally and update selected ticket data
            setReadTicketIds(prev => new Set(prev).add(ticketId));
            if (r?.ticket) {
                setSelectedTicketData({...r.ticket, unread_user: 0});
            }
            setLoadingMessages(false);
        }).catch((err) => { D('support.error', {action: 'fetchMessages', ticketId, error: err}); setLoadingMessages(false); showToast(t.User_LoadError(), 'danger'); });
    };

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({behavior: 'smooth'});
        }
    }, [messages]);

    // Auto-refresh: poll messages every 15 seconds when a ticket is selected
    useEffect(() => {
        if (!selectedId) return;
        const interval = setInterval(() => { if (!document.hidden) fetchMessages(selectedId); }, 15000);
        return () => clearInterval(interval);
    }, [selectedId]);

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
                const context = collectContext();
                D('support.create', {subject, hasAttachments: createFiles.length > 0});
                D('support.context', context);
                const fd = new FormData();
                fd.append('subject', subject.trim());
                fd.append('message', message.trim());
                fd.append('context', JSON.stringify(context));
                for (const f of createFiles) {
                    fd.append('attachments[]', f.file, f.name);
                }
                const r = await sendPostFormData<FormData, any>(createUrl, fd);
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
                    showToast(t.Support_TicketCreated(), 'success');
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
                D('support.reply', {ticketId: selectedId, hasAttachments: replyFiles.length > 0});
                const fd = new FormData();
                fd.append('ticket_id', String(selectedId));
                fd.append('message', replyText.trim());
                for (const f of replyFiles) {
                    fd.append('attachments[]', f.file, f.name);
                }
                await sendPostFormData<FormData, any>(replyUrl, fd);
                setReplyText('');
                setReplyFiles([]);
                fetchMessages(selectedId!);
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
                        {sortedTickets.length === 0 ? (
                            <div className="support-empty">{t.Support_NoTickets()}</div>
                        ) : (
                            sortedTickets.map(ticket => (
                                <div
                                    key={ticket.id}
                                    data-test-id={`support-ticket-${ticket.id}`}
                                    className={`support-ticket-row ${selectedId === ticket.id ? 'support-ticket-row-active' : 'support-ticket-row-inactive'}`}
                                    onClick={() => selectTicket(ticket.id)}
                                >
                                    <div className="support-ticket-row-head">
                                        <span className="support-ticket-title">{ticket.subject}</span>
                                        {ticket.unread_user > 0 && !readTicketIds.has(ticket.id) && (
                                            <span className="support-unread-badge">
                                                {ticket.unread_user}
                                            </span>
                                        )}
                                    </div>
                                    <div className="support-ticket-row-meta">
                                        <StatusBadge status={ticket.status} />
                                        <span className="text-xs text-muted">{formatTs(ticket.updated_at)}</span>
                                    </div>
                                </div>
                            ))
                        )}
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
        return (
            <div className="flex-1 flex items-center justify-center text-muted text-sm">
                {tickets.length === 0 ? t.Support_NoTickets() : t.Support_NoMessages()}
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

                {/* Messages timeline */}
                <div className="support-thread-body">
                    {loadingMessages ? (
                        <div className="support-empty-line">{t.User_Loading()}</div>
                    ) : messages.length === 0 ? (
                        <div className="support-empty-line">{t.Support_NoMessages()}</div>
                    ) : (
                        messages.map(msg => {
                            if (msg.msg_type === 'system') {
                                return (
                                    <div key={msg.id} className="support-system-line">
                                        {msg.body}
                                        <div className="text-muted mt-0.5">{formatTs(msg.created_at)}</div>
                                    </div>
                                );
                            }
                            const isUser = msg.msg_type === 'user';
                            return (
                                <div key={msg.id} className={`im-bubble-row ${isUser ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`im-bubble ${isUser ? 'im-bubble-mine' : 'im-bubble-theirs'}`}>
                                        {!isUser && msg.author_name && (
                                            <div className="im-bubble-author">{msg.author_name}</div>
                                        )}
                                        <div className="im-bubble-body">{msg.body}</div>
                                        {msg.attachments && msg.attachments.length > 0 && (
                                            <AttachmentDisplay attachments={msg.attachments} />
                                        )}
                                        <div className="im-bubble-time">
                                            {formatTs(msg.created_at)}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                    <div ref={messagesEndRef} />
                </div>

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
