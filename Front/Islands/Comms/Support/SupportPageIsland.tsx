import * as React from 'react';
import {useState, useEffect, useRef} from 'react';
import {sendPost} from '@common/Api/Send/sendPost';
import {sendPostFormData} from '@common/Api/Send/sendPostFormData';
import {D} from '@common/Support/Debug/D';
import {useSending} from '@common/hooks/data/useSending';

import {showToast} from '@common/Components/Feedback/GlobalToast';
import {usePagination, PageResponse} from '@common/hooks/data/usePagination';
import {refreshLiveCounts} from '@common/Utils/Data/liveCounts';
import {PaginationLabels} from '@common/Components/Layout/Paging/Pagination';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {SupportTicket, SupportMessage} from './parts/supportTypes';
import {PageTicketListPanel, PageBackButton, PageEmpty, PageNewTicketForm, PageConversation} from './SupportPageParts';
import {PendingFile} from '../../../Common/attachments/AttachmentPicker';
import AttachmentDisplay from '../../../Common/attachments/AttachmentDisplay';
import {initAutoContext} from './parts/autoContext';
import {useSupportThread} from './parts/useSupportThread';
import {PageHeader} from '@common/Components/Layout/PageHeader';
import {LifeBuoy} from 'lucide-react';

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
                <PageTicketListPanel
                    tickets={sortedTickets}
                    selectedId={selectedId}
                    readTicketIds={readTicketIds}
                    onSelect={selectTicket}
                    onNew={() => { setShowNewForm(true); setSelectedId(null); setSubject(''); setMessage(''); setCreateFiles([]); }}
                    page={ticketPage}
                    totalPages={ticketTotalPages}
                    total={ticketTotal}
                    loading={ticketsLoading}
                    labels={paginationLabels}
                    perPage={ticketPerPage}
                    onPageChange={ticketGoToPage}
                    onPageSizeChange={ticketSetPerPage}
                />

                {/* Right: conversation or new form */}
                <div className="support-thread-panel">
                    {(selectedTicket || showNewForm) && (
                        <PageBackButton onBack={() => { setSelectedId(null); setShowNewForm(false); }} />
                    )}
                    {showNewForm ? <PageNewTicketForm subject={subject} onSubjectChange={setSubject} message={message} onMessageChange={setMessage} files={createFiles} onFilesChange={setCreateFiles} onSubmit={handleCreate} onCancel={() => setShowNewForm(false)} sending={sending} /> : selectedTicket ? <PageConversation selectedTicket={selectedTicket} messages={messages} loading={loadingMessages} endRef={messagesEndRef} replyText={replyText} onReplyTextChange={setReplyText} replyFiles={replyFiles} onReplyFilesChange={setReplyFiles} onReply={handleReply} sending={sending} /> : <PageEmpty ticketsCount={tickets.length} />}
                </div>
            </div>

            
        </div>
    );
};
