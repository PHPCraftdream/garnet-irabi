import * as React from 'react';
import {useState, useEffect, useRef} from 'react';
import {sendPost} from '@common/Api/sendPost';
import {useLiveCounts} from '@common/hooks/useLiveCounts';
import {refreshLiveCounts} from '@common/Utils/liveCounts';
import {sendPostFormData} from '@common/Api/sendPostFormData';
import {D} from '@common/Debug/D';
import {formatTs} from '@common/Utils/DateUtils';
import {useSending} from '@common/hooks/useSending';

import {showToast} from '@common/Components/GlobalToast';
import SendButton from '@common/Components/SendButton';
import {useCtrlEnter, CTRL_ENTER_HINT} from '@common/hooks/useCtrlEnter';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {SupportTicket, SupportMessage} from './supportTypes';
import {StatusBadge} from './supportRenders';
import {SupportTicketRow} from './SupportTicketRow';
import {SupportBubble} from './SupportBubble';
import AttachmentDisplay from '../../Common/AttachmentDisplay';
import AttachmentPicker, {PendingFile} from '../../Common/AttachmentPicker';
import ScreenshotButton from '../../Common/ScreenshotButton';
import {initAutoContext} from './autoContext';
import {useSupportThread} from './useSupportThread';

type WidgetView = 'list' | 'conversation' | 'new';

interface Props {
    unreadCount: number;
    unreadSupport?: number;
    unreadIm?: number;
    ticketsUrl: string;
    messagesUrl: string;
    createUrl: string;
    replyUrl: string;
    pageUrl: string;
    imPageUrl?: string;
}

export const SupportWidgetIsland: React.FC<Props> = ({unreadCount, unreadSupport: _unreadSupport = 0, unreadIm = 0, ticketsUrl, messagesUrl, createUrl, replyUrl, pageUrl, imPageUrl = '/im/'}) => {
    const [isOpen, setIsOpen]           = useState(false);
    const [view, setView]               = useState<WidgetView>('list');
    const [tickets, setTickets]         = useState<SupportTicket[]>([]);
    const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
    const [loadingTickets, setLoadingTickets]     = useState(false);
    const [subject, setSubject]         = useState('');
    const [message, setMessage]         = useState('');
    const [replyText, setReplyText]     = useState('');
    const [badge, setBadge]             = useState(unreadCount);
    const [imUnread, setImUnread]       = useState(unreadIm);
    const [createFiles, setCreateFiles] = useState<PendingFile[]>([]);
    const {sending, withSending} = useSending();
    const live = useLiveCounts();
    const thread = useSupportThread({messagesUrl, createUrl, replyUrl});
    const {messages, loading: loadingMessages, messagesEndRef} = thread;

    // Init auto-context collector on mount
    useEffect(() => { initAutoContext(); }, []);

    // Keep the floating badge + the in-panel IM link in sync with the shared
    // 20s counter poll (no extra request — same singleton the nav badges use).
    useEffect(() => {
        if (!live) return;
        // D-210: this button is labelled "поддержка" — summing in unread IM
        // made it show "9+" with zero actual support unread, and a real
        // client clicked expecting a support reply and found a chat with the
        // teacher instead. Unread IM keeps its own badge inside the panel.
        setBadge(live.unreadSupport);
        setImUnread(live.unreadIm);
    }, [live]);

    // `silent` skips the loading spinner — used by the background refresh so the
    // open panel doesn't flash to a "Loading…" state every 20s.
    const fetchTickets = (silent = false) => {
        if (!silent) setLoadingTickets(true);
        D('support.tickets', 'fetch');
        sendPost(ticketsUrl, {}).then((r: any) => {
            const list = r?.tickets ?? [];
            D('support.tickets', {count: list.length});
            setTickets(list);
            setLoadingTickets(false);
        }).catch((err) => { D('support.error', {action: 'fetchTickets', error: err}); setLoadingTickets(false); if (!silent) showToast(t.User_LoadError(), 'danger'); });
    };

    const fetchMessages = (ticketId: number, silent = false) => {
        // D-198: чтение обращения гасит непрочитанное на сервере — значок на
        // кнопке обязан погаснуть тогда же, а не на следующем 20-секундном
        // такте общего опроса. Фоновое обновление (silent) сюда не входит: оно
        // ничего не читает впервые и дёргать счётчики ему незачем.
        void thread.loadMessages(ticketId, silent).then(() => {
            if (!silent) refreshLiveCounts();
        });
    };

    // Пока панель открыта, её содержимое обновляется само: иначе активная
    // переписка застывает до того, как её закроют и откроют снова.
    // В свёрнутой вкладке опрос выключается.
    useEffect(() => {
        if (!isOpen || view !== 'list') return;
        const id = window.setInterval(() => {
            if (!document.hidden) fetchTickets(true);
        }, 20000);
        return () => window.clearInterval(id);
    }, [isOpen, view]);

    thread.usePolling(selectedTicketId, 20000, isOpen && view === 'conversation');

    useEffect(() => {
        if (isOpen && view === 'list' && tickets.length === 0) {
            fetchTickets();
        }
    }, [isOpen]);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({behavior: 'smooth'});
        }
    }, [messages]);

    const togglePanel = () => {
        D('support.click', isOpen ? 'close-widget' : 'open-widget');
        if (!isOpen) {
            setView('list');
            fetchTickets();
        }
        setIsOpen(!isOpen);
    };

    const openTicket = (ticketId: number) => {
        D('support.click', {action: 'openTicket', ticketId});
        setSelectedTicketId(ticketId);
        setView('conversation');
        setReplyText('');
        fetchMessages(ticketId);
    };

    const handleCreate = () => {
        if (!subject.trim() || !message.trim()) return;
        withSending(async () => {
            try {
                const r = await thread.createTicket(subject, message, createFiles);
                D('support.created', {source: 'widget'});
                setSubject('');
                setMessage('');
                setCreateFiles([]);
                setView('list');
                fetchTickets();
                // D-211: silence at the moment of sending read as "did this
                // even go through?" — the ticket number and a real (measured,
                // not hand-typed) ETA answer both questions at once.
                const ticketId = r?.ticketId;
                const etaMinutes = r?.responseEtaMinutes;
                const confirmation = ticketId
                    ? t.Support_TicketCreatedWithId([String(ticketId)]) + (etaMinutes ? ' ' + t.Support_TicketEtaHint([String(etaMinutes)]) : '')
                    : t.Support_TicketCreated();
                showToast(confirmation, 'success');
            } catch (err: any) {
                D('support.error', {action: 'create', error: err});
                showToast(err?.message || t.General_Error(), 'danger');
            }
        });
    };

    const handleReply = () => {
        if (!replyText.trim() || !selectedTicketId) return;
        withSending(async () => {
            try {
                await thread.reply(selectedTicketId, replyText, []);
                setReplyText('');
                fetchMessages(selectedTicketId);
                // Ответ меняет статус и время обращения — то есть строку,
                // к которой пользователь вернётся, закрыв переписку.
                fetchTickets(true);
            } catch (err: any) {
                D('support.error', {action: 'reply', error: err});
                showToast(err?.message || t.General_Error(), 'danger');
            }
        });
    };

    const handleScreenshot = (blob: Blob, name: string) => {
        D('support.screenshot', {name, size: blob.size, source: 'widget'});
        const entry: PendingFile = {id: crypto.randomUUID(), file: blob, name, preview: URL.createObjectURL(blob)};
        setCreateFiles(prev => [...prev, entry]);
    };

    const selectedTicket = tickets.find(tk => tk.id === selectedTicketId);

    return (
        <>
            

            {/* Floating button */}
            <button
                type="button"
                data-test-id="support-widget-btn"
                className="support-widget-fab"
                title={t.Support_Widget_Title()}
                onClick={togglePanel}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M2.678 11.894a1 1 0 0 1 .287.801 11 11 0 0 1-.398 2c1.395-.323 2.247-.697 2.634-.893a1 1 0 0 1 .71-.074A8 8 0 0 0 8 14c3.996 0 7-2.807 7-6s-3.004-6-7-6-7 2.808-7 6c0 1.468.617 2.83 1.678 3.894m-.493 3.905a22 22 0 0 1-.713.129c-.2.032-.352-.176-.273-.362a10 10 0 0 0 .244-.637l.003-.01c.248-.72.45-1.548.524-2.319C.743 11.37 0 9.76 0 8c0-3.866 3.582-7 8-7s8 3.134 8 7-3.582 7-8 7a9 9 0 0 1-2.347-.306c-.52.263-1.639.742-3.468 1.105" />
                </svg>
                {badge > 0 && (
                    <span
                        data-test-id="support-widget-badge"
                        className="support-fab-badge"
                    >
                        {badge > 9 ? '9+' : badge}
                    </span>
                )}
            </button>

            {/* Panel */}
            {isOpen && (
                <div
                    data-test-id="support-widget-panel"
                    className="support-widget-panel"
                >
                    {/* Panel header */}
                    <div className="support-widget-header">
                        <span className="support-widget-title">{t.Support_Widget_Title()}</span>
                        <div className="flex items-center gap-2">
                            <a href={pageUrl} className="support-widget-link">{t.Support_ViewAll()}</a>
                            <button type="button" className="support-widget-close" title={t.Action_Close()} onClick={() => setIsOpen(false)}>
                                &times;
                            </button>
                        </div>
                    </div>

                    {/* IM link — отдельная система (личные сообщения), не переписка
                        по тикету. Раньше подписывался просто "Сообщения" — в панели
                        поддержки, поверх переписки по тикету, это читалось как
                        "перейти к этому диалогу" (нашёл expert-3). */}
                    {imUnread > 0 && (
                        <a href={imPageUrl} className="hot-click support-widget-im-link" data-test-id="widget-im-link">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                            <span className="text-on-surface">{t.Support_Widget_ImBannerLabel()}</span>
                            <span className="support-unread-badge ml-auto">{imUnread}</span>
                        </a>
                    )}

                    {/* Panel body */}
                    <div className="support-widget-body">
                        {view === 'list' && renderTicketList()}
                        {view === 'conversation' && renderConversation()}
                        {view === 'new' && renderNewTicket()}
                    </div>
                </div>
            )}
        </>
    );

    function renderTicketList() {
        return (
            <div className="flex flex-col h-full">
                <div className="p-3 border-b border-subtle">
                    <button
                        type="button"
                        data-test-id="support-new-ticket-btn"
                        className="support-new-btn-soft"
                        onClick={() => { setView('new'); setSubject(''); setMessage(''); }}
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
                            onSelect={openTicket}
                        />
                    ))}
                </div>
            </div>
        );
    }

    function renderConversation() {
        return (
            <div className="flex flex-col h-full">
                {/* Conversation header */}
                <div className="support-widget-conv-header">
                    <button
                        type="button"
                        className="support-widget-back-btn"
                        onClick={() => { setView('list'); fetchTickets(); }}
                    >
                        &larr; {t.Support_BackToList()}
                    </button>
                    {selectedTicket && (
                        <div className="flex items-center gap-2">
                            <span className="support-ticket-title">{selectedTicket.subject}</span>
                            <StatusBadge status={selectedTicket.status} />
                        </div>
                    )}
                </div>

                {/* Messages */}
                <div className="support-widget-conv-body">
                    {loadingMessages && <div className="support-empty-line">{t.User_Loading()}</div>}
                    {!loadingMessages && messages.length === 0 && (
                        <div className="support-empty-line">{t.Support_NoMessages()}</div>
                    )}
                    {!loadingMessages && messages.map(msg => <SupportBubble key={msg.id} msg={msg} tight />)}
                    <div ref={messagesEndRef} />
                </div>

                {/* Reply input */}
                <div className="support-widget-conv-input">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            data-test-id="support-reply-input"
                            className="flex-1 form-control text-sm"
                            placeholder={t.Support_Reply() + '... (Enter)'}
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(); } }}
                        />
                        <SendButton
                            onClick={handleReply}
                            disabled={!replyText.trim()}
                            sending={sending}
                            label={t.Support_Send()}
                            testId="support-reply-btn"
                            size="sm"
                        />
                    </div>
                </div>
            </div>
        );
    }

    function renderNewTicket() {
        return (
            <div className="support-widget-new-form">
                <button
                    type="button"
                    className="support-widget-back-btn-self"
                    onClick={() => setView('list')}
                >
                    &larr; {t.Support_BackToList()}
                </button>
                <div>
                    <label className="support-form-label">{t.Support_Subject()}</label>
                    <input
                        type="text"
                        data-test-id="support-subject-input"
                        className="form-control text-sm"
                        value={subject}
                        onChange={e => setSubject(e.target.value)}
                        placeholder={t.Support_Subject()}
                    />
                </div>
                <div>
                    <label className="support-form-label">{t.Support_Message()}</label>
                    <textarea
                        data-test-id="support-message-input"
                        className="form-control text-sm"
                        rows={4}
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        placeholder={t.Support_Message() + CTRL_ENTER_HINT}
                        onKeyDown={useCtrlEnter(handleCreate, sending || !subject.trim() || !message.trim())}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <AttachmentPicker files={createFiles} onChange={setCreateFiles} />
                    <ScreenshotButton onScreenshot={handleScreenshot} />
                </div>
                <SendButton
                    onClick={handleCreate}
                    disabled={!subject.trim() || !message.trim()}
                    sending={sending}
                    label={t.Support_Send()}
                    testId="support-send-btn"
                />
            </div>
        );
    }
};
