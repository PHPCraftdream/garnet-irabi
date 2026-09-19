import * as React from 'react';
import {useState, useEffect, useRef} from 'react';
import {sendPost} from '@common/Api/Send/sendPost';
import {useLiveCounts} from '@common/hooks/data/useLiveCounts';
import {refreshLiveCounts} from '@common/Utils/Data/liveCounts';
import {sendPostFormData} from '@common/Api/Send/sendPostFormData';
import {D} from '@common/Support/Debug/D';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {useSending} from '@common/hooks/data/useSending';

import {showToast} from '@common/Components/Feedback/GlobalToast';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {SupportTicket} from './parts/supportTypes';
import AttachmentDisplay from '../../../Common/attachments/AttachmentDisplay';
import {PendingFile} from '../../../Common/attachments/AttachmentPicker';
import {initAutoContext} from './parts/autoContext';
import {useSupportThread} from './parts/useSupportThread';
import {WidgetFab, WidgetPanelHeader, WidgetImLink, WidgetTicketList, WidgetConversation, WidgetNewTicketForm} from './SupportWidgetParts';

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
            <WidgetFab badge={badge} onToggle={togglePanel} />

            {/* Panel */}
            {isOpen && (
                <div
                    data-test-id="support-widget-panel"
                    className="support-widget-panel"
                >
                    {/* Panel header */}
                    <WidgetPanelHeader pageUrl={pageUrl} onClose={() => setIsOpen(false)} />

                    <WidgetImLink imUnread={imUnread} imPageUrl={imPageUrl} />

                    {/* Panel body */}
                    <div className="support-widget-body">
                        {view === 'list' && <WidgetTicketList loadingTickets={loadingTickets} tickets={tickets} onNew={() => { setView('new'); setSubject(''); setMessage(''); }} onOpen={openTicket} />}
                        {view === 'conversation' && <WidgetConversation loading={loadingMessages} messages={messages} endRef={messagesEndRef} selectedTicket={selectedTicket} replyText={replyText} onReplyTextChange={setReplyText} onReply={handleReply} onBack={() => { setView('list'); fetchTickets(); }} sending={sending} />}
                        {view === 'new' && <WidgetNewTicketForm subject={subject} onSubjectChange={setSubject} message={message} onMessageChange={setMessage} files={createFiles} onFilesChange={setCreateFiles} onScreenshot={handleScreenshot} onSubmit={handleCreate} onBack={() => setView('list')} sending={sending} />}
                    </div>
                </div>
            )}
        </>
    );
};
