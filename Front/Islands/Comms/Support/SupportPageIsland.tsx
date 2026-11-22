import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {useState, useEffect} from 'react';
import {D} from '@common/Support/Debug/D';
import {useSending} from '@common/hooks/data/useSending';

import {showToast} from '@common/Components/Feedback/GlobalToast';
import {usePagination, PageResponse} from '@common/hooks/data/usePagination';
import {refreshLiveCounts} from '@common/Utils/Data/liveCounts';
import {PaginationLabels} from '@common/Components/Layout/Paging/Pagination';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {SupportTicket} from './parts/supportTypes';
import {SupportPageState} from './SupportPageState';
import {PageTicketListPanel} from './Page/PageTicketListPanel';
import {PageBackButton} from './Page/PageBackButton';
import {PageEmpty} from './Page/PageEmpty';
import {PageNewTicketForm} from './Page/PageNewTicketForm';
import {PageConversation} from './Page/PageConversation';
import {PendingFile} from '../../../Common/attachments/AttachmentPicker';
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

function createPageState(): SupportPageState {
    return new SupportPageState();
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

    const [ui] = useState(createPageState);
    const {selectedId, selectedTicketData, readIds, showNewForm, subject, message, replyText} =
        React.useSyncExternalStore(ui.subscribeSnapshot, ui.snapshot, ui.snapshot);
    const readTicketIds = React.useMemo(() => new Set(readIds), [readIds]);
    const {setSubject, setMessage, setReplyText} = ui;
    const [createFiles, setCreateFiles] = useState<PendingFile[]>([]);
    const [replyFiles, setReplyFiles]   = useState<PendingFile[]>([]);
    const {sending, withSending} = useSending();
    const thread = useSupportThread({messagesUrl, createUrl, replyUrl});
    const {messages, loading: loadingMessages, messagesEndRef} = thread;


    // Init auto-context collector on mount
    useEffect(() => { initAutoContext(); }, []);

    const sortedTickets = tickets; // Already sorted by server (updated_at DESC)

    thread.usePolling(selectedId, 15000);
    return <SupportPageView {...{tickets, sortedTickets, ticketPage, ticketTotalPages, ticketTotal, ticketsLoading,
        ticketGoToPage, ticketRefresh, ticketPerPage, ticketSetPerPage, paginationLabels, ui, selectedId, selectedTicketData,
        readTicketIds, showNewForm, subject, message, replyText, setSubject, setMessage, setReplyText, createFiles, setCreateFiles,
        replyFiles, setReplyFiles, sending, withSending, thread, messages, loadingMessages, messagesEndRef}} />;
};

const PAGE_ICON = <LifeBuoy size={22} aria-hidden="true" />;
type ViewProps = Parameters<typeof PageTicketListPanel>[0];
interface SupportViewProps extends ReturnType<typeof useSending> {
    ui: SupportPageState;
    tickets: SupportTicket[];
    sortedTickets: SupportTicket[];
    selectedId: number | null;
    selectedTicketData: SupportTicket | null;
    readTicketIds: Set<number>;
    showNewForm: boolean;
    subject: string;
    message: string;
    replyText: string;
    setSubject: (value: string) => void;
    setMessage: (value: string) => void;
    setReplyText: (value: string) => void;
    createFiles: PendingFile[];
    replyFiles: PendingFile[];
    setCreateFiles: (files: PendingFile[]) => void;
    setReplyFiles: (files: PendingFile[]) => void;
    ticketPage: number;
    ticketTotalPages: number;
    ticketTotal: number;
    ticketsLoading: boolean;
    ticketPerPage: number;
    ticketGoToPage: ViewProps['onPageChange'];
    ticketSetPerPage: ViewProps['onPageSizeChange'];
    ticketRefresh: () => void;
    paginationLabels: PaginationLabels;
    thread: ReturnType<typeof useSupportThread>;
    messages: ReturnType<typeof useSupportThread>['messages'];
    loadingMessages: boolean;
    messagesEndRef: React.RefObject<HTMLDivElement>;
}

function findTicket(tickets: SupportTicket[], id: number): SupportTicket | undefined {
    return tickets.find(ticket => ticket.id === id);
}

class SupportPageView extends AntiHookComponent<SupportViewProps> {
    private readonly fetchMessages = (ticketId: number) => {
        const {thread, ui} = this.props;
        void thread.loadMessages(ticketId).then((r: any) => {
            if (!r) return;
            // Пометить прочитанным на месте: непрочитанный значок должен
            // погаснуть сразу, а не после следующей загрузки списка.
            ui.markRead(ticketId, r.ticket);
            // D-198: открыв обращение, пользователь его прочитал — значок в
            // шапке обязан погаснуть сразу. Он жил своей жизнью на опросе раз
            // в 20 секунд, и всё это время показывал непрочитанное, которое
            // человек читает прямо сейчас.
            refreshLiveCounts();
        });
    };



    private readonly selectTicket = (ticketId: number) => {
        const {tickets, ui, setReplyFiles} = this.props;
        D('support.click', {action: 'selectTicket', ticketId});
        const ticketFromList = findTicket(tickets, ticketId);
        ui.update({selectedId: ticketId, showNewForm: false, replyText: '',
            ...(ticketFromList ? {selectedTicketData: ticketFromList} : {})});
        setReplyFiles([]);
        this.fetchMessages(ticketId);
    };

    private readonly handleCreate = () => {
        if (!this.props.subject.trim() || !this.props.message.trim()) return;
        void this.props.withSending(this.createTicket);
    };

    private readonly createTicket = async () => {
        const {thread, ui, createFiles, setCreateFiles, ticketPage, ticketRefresh, ticketGoToPage, subject, message} = this.props;
        try {
            const r = await thread.createTicket(subject, message, createFiles);
            if (r?.ticket) {
                D('support.created', {ticketId: r.ticket.id});
                ui.update({showNewForm: false, subject: '', message: ''});
                setCreateFiles([]);
                if (ticketPage === 1) ticketRefresh(); else ticketGoToPage(1);
                ui.update({selectedTicketData: r.ticket, selectedId: r.ticket.id});
                this.fetchMessages(r.ticket.id);
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
    };

    private readonly handleReply = () => {
        if (!this.props.replyText.trim() || !this.props.selectedId) return;
        void this.props.withSending(this.replyToTicket);
    };

    private readonly replyToTicket = async () => {
        const {thread, selectedId, replyText, replyFiles, setReplyFiles, ui, ticketRefresh} = this.props;
        if (!selectedId) return;
        try {
            await thread.reply(selectedId, replyText, replyFiles);
            ui.setReplyText('');
            setReplyFiles([]);
            this.fetchMessages(selectedId);
            // D-198: ответ меняет и статус обращения, и время последнего
            // события — то есть ровно то, что показывает строка слева.
            // Создание тикета список перечитывало, ответ — нет, и строка
            // держала прежний статус до перезагрузки страницы.
            ticketRefresh();
        } catch (err: any) {
            D('support.error', {action: 'reply', error: err});
            showToast(err?.message || t.General_Error(), 'danger');
        }
    };



    private readonly openNew = () => {
        const {ui, setCreateFiles} = this.props;
        ui.update({showNewForm: true, selectedId: null, subject: '', message: ''});
        setCreateFiles([]);
    };

    private renderList() {
        const {sortedTickets, selectedId, readTicketIds, ticketPage, ticketTotalPages, ticketTotal, ticketsLoading,
            paginationLabels, ticketPerPage, ticketGoToPage, ticketSetPerPage} = this.props;
        return (
            <PageTicketListPanel
                tickets={sortedTickets}
                selectedId={selectedId}
                readTicketIds={readTicketIds}
                onSelect={this.selectTicket}
                onNew={this.openNew}
                page={ticketPage}
                totalPages={ticketTotalPages}
                total={ticketTotal}
                loading={ticketsLoading}
                labels={paginationLabels}
                perPage={ticketPerPage}
                onPageChange={ticketGoToPage}
                onPageSizeChange={ticketSetPerPage}
            />
        );
    }

    private renderBody(selectedTicket: SupportTicket | null) {
        const {tickets, showNewForm, subject, message, replyText, setSubject, setMessage, setReplyText, createFiles,
            setCreateFiles, replyFiles, setReplyFiles, sending, messages, loadingMessages, messagesEndRef, ui} = this.props;
        return showNewForm ? <PageNewTicketForm subject={subject} onSubjectChange={setSubject} message={message} onMessageChange={setMessage} files={createFiles} onFilesChange={setCreateFiles} onSubmit={this.handleCreate} onCancel={ui.closeForm} sending={sending} /> : selectedTicket ? <PageConversation selectedTicket={selectedTicket} messages={messages} loading={loadingMessages} endRef={messagesEndRef} replyText={replyText} onReplyTextChange={setReplyText} replyFiles={replyFiles} onReplyFilesChange={setReplyFiles} onReply={this.handleReply} sending={sending} /> : <PageEmpty ticketsCount={tickets.length} />;
    }

    render() {
        const {ui, tickets, selectedId, selectedTicketData, showNewForm} = this.props;
        const selectedTicket = selectedId ? (selectedTicketData?.id === selectedId ? selectedTicketData : findTicket(tickets, selectedId) ?? null) : null;
        return (
            <div className="comms-page">
                <PageHeader title={t.Support_Title()} icon={PAGE_ICON} />

                <div className="comms-page-layout" data-detail={Boolean(selectedTicket || showNewForm)}>
                    {/* Left: ticket list */}
                    {this.renderList()}

                    {/* Right: conversation or new form */}
                    <div className="comms-page-thread">
                        {(selectedTicket || showNewForm) && (
                            <PageBackButton onBack={ui.back} />
                        )}
                        {this.renderBody(selectedTicket)}
                    </div>
                </div>


            </div>
        );
    }
}
