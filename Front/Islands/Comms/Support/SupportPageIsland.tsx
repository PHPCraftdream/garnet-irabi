import * as React from 'react';
import {AntiHookComponent, Carburetor, type TReadonly} from '@react-carburetor/core';
import {D} from '@common/Support/Debug/D';

import {showToast} from '@common/Components/Feedback/GlobalToast';
import {PageResponse} from '@common/hooks/data/usePagination';
import {PaginationController} from '@common/hooks/data/PaginationController';
import {refreshLiveCounts} from '@common/Utils/Data/liveCounts';
import {PaginationLabels} from '@common/Components/Layout/Paging/Pagination';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {SupportTicket, SupportMessage} from './parts/supportTypes';
import {SupportPageState} from './SupportPageState';
import {PageTicketListPanel} from './Page/PageTicketListPanel';
import {PageBackButton} from './Page/PageBackButton';
import {PageEmpty} from './Page/PageEmpty';
import {PageNewTicketForm} from './Page/PageNewTicketForm';
import {PageConversation} from './Page/PageConversation';
import {PendingFile} from '../../../Common/attachments/AttachmentPicker';
import {initAutoContext} from './parts/thread/autoContext';
import {SupportThreadController} from './parts/thread/SupportThreadController';
import {SupportSending} from './parts/thread/supportSending';
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

const PAGE_ICON = <LifeBuoy size={22} aria-hidden="true" />;

function findTicket(tickets: readonly SupportTicket[], id: number): SupportTicket | undefined {
    return tickets.find(ticket => ticket.id === id);
}

/** Подпись переписки: прокрутка срабатывает на смену содержимого, а не на каждый опрос. */
function messagesSignature(messages: readonly SupportMessage[]): string {
    return `${messages.length}:${messages[messages.length - 1]?.id ?? ''}`;
}

export class SupportPageIsland extends AntiHookComponent<Props> {
    private readonly pagination = new PaginationController<SupportTicket>({url: this.props.ticketPageUrl, initialData: this.props.ticketsPagination});
    private readonly ui = new SupportPageState();
    private readonly thread = new SupportThreadController({messagesUrl: this.props.messagesUrl, createUrl: this.props.createUrl, replyUrl: this.props.replyUrl});
    private readonly files = new Carburetor<{create: PendingFile[]; reply: PendingFile[]}>({create: [], reply: []});
    private readonly sending = new SupportSending();
    private readonly messagesEnd = React.createRef<HTMLDivElement>();
    /*
     * Список обращений и переписка приходят заменой массива целиком, а `setData`
     * диффит замену до листьев: подписка на маркер `tickets.~p`/`messages.~p`
     * тихий опрос не замечает, и строки остаются со старыми прокси. Снимок
     * `connectSelection` читает поля и меняет идентичность только вместе с содержимым
     * (RULES.md, «Подписки useCarburetor»).
     */
    private readonly ticketsSnapshot = this.connectSelection(this.pagination, state => state.items);
    private readonly threadSnapshot = this.connectSelection(this.thread, state => ({messages: state.messages, loading: state.loading}));
    /*
     * Выбранные файлы тоже заменяются массивом целиком: подписка на маркер `files.~p` записи
     * вглубь не замечает, поэтому берём их снимком (RULES.md, «Подписки useCarburetor»).
     */
    private readonly filesSnapshot = this.connectSelection(this.files, state => ({create: state.create, reply: state.reply}));
    /*
     * Заголовок переписки (`subject`/`status`/`created_at`/`updated_at`) рисует
     * `PageConversation` в своём рендере, а ответ на обращение заменяет тикет с тем же id:
     * подписка на один `id` такого не замечает. Снимок читает поля тикета и меняет
     * идентичность вместе с содержимым (RULES.md, «Подписки useCarburetor»).
     */
    private readonly selectedTicketSnapshot = this.connectSelection(this.ui, state => state.selectedTicketData);

    // Обёртки как в usePagination: его сторожа отличаются от сторожа контроллера.
    private readonly ticketGoToPage = (p: number) => {
        if (p < 1 || p > this.pagination.snapshot().totalPages || p === this.pagination.snapshot().page) return;
        void this.pagination.fetchPage(p);
    };
    private readonly ticketSetPerPage = this.pagination.setPerPage;

    private readonly setCreateFiles = (files: PendingFile[]) => this.files.setData({...this.files.getData(), create: files});
    private readonly setReplyFiles = (files: PendingFile[]) => this.files.setData({...this.files.getData(), reply: files});

    // Уборки вынесены в поля: ссылка на них должна быть стабильной.
    private readonly disposePagination = () => this.pagination.dispose();
    private readonly stopThreadPolling = () => this.thread.stopPolling();

    protected override useEffects(): void {
        const {selectedId} = this.ui.snapshot();
        const scrollSignature = messagesSignature(this.thread.snapshot().messages);

        this.useEffect('pagination', () => {
            this.pagination.start();

            return this.disposePagination;
        }, []);

        // Init auto-context collector on mount
        this.useEffect('autoContext', () => { initAutoContext(); }, []);

        this.useEffect('poll', () => {
            if (selectedId === null) {
                this.thread.stopPolling();

                return;
            }
            this.thread.startPolling(selectedId, 15000);

            return this.stopThreadPolling;
        }, [selectedId]);

        // selectedId в зависимостях: повторное открытие той же переписки заново создаёт якорь и должно прокручивать вниз.
        this.useEffect('scroll', () => { this.messagesEnd.current?.scrollIntoView({behavior: 'smooth'}); }, [scrollSignature, selectedId]);
    }

    private readonly fetchMessages = (ticketId: number) => {
        void this.thread.loadMessages(ticketId).then((r: any) => {
            if (!r) return;
            // Пометить прочитанным на месте: непрочитанный значок должен
            // погаснуть сразу, а не после следующей загрузки списка.
            this.ui.markRead(ticketId, r.ticket);
            // D-198: открыв обращение, пользователь его прочитал — значок в
            // шапке обязан погаснуть сразу. Он жил своей жизнью на опросе раз
            // в 20 секунд, и всё это время показывал непрочитанное, которое
            // человек читает прямо сейчас.
            refreshLiveCounts();
        });
    };

    private readonly selectTicket = (ticketId: number) => {
        D('support.click', {action: 'selectTicket', ticketId});
        const ticketFromList = findTicket(this.pagination.snapshot().items, ticketId);
        this.ui.patch({selectedId: ticketId, showNewForm: false, replyText: '',
            ...(ticketFromList ? {selectedTicketData: ticketFromList} : {})});
        this.setReplyFiles([]);
        this.fetchMessages(ticketId);
    };

    private readonly handleCreate = () => {
        const {subject, message} = this.ui.snapshot();
        if (!subject.trim() || !message.trim()) return;
        void this.sending.withSending(this.createTicket);
    };

    private readonly createTicket = async () => {
        // Страница запоминается до await: usePagination замыкал её по рендеру,
        // а чтение после await перенацеливало действие на новую страницу.
        const {page} = this.pagination.snapshot();
        const {subject, message} = this.ui.snapshot();
        try {
            const r = await this.thread.createTicket(subject, message, this.files.getData().create);
            if (r?.ticket) {
                D('support.created', {ticketId: r.ticket.id});
                this.ui.patch({showNewForm: false, subject: '', message: ''});
                this.setCreateFiles([]);
                if (page === 1) void this.pagination.fetchPage(page); else void this.pagination.fetchPage(1);
                this.ui.patch({selectedTicketData: r.ticket, selectedId: r.ticket.id});
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
        const {selectedId, replyText} = this.ui.snapshot();
        if (!replyText.trim() || !selectedId) return;
        void this.sending.withSending(this.replyToTicket);
    };

    private readonly replyToTicket = async () => {
        // Страница запоминается до await: usePagination замыкал её по рендеру,
        // а чтение после await перенацеливало действие на новую страницу.
        const {page} = this.pagination.snapshot();
        const {selectedId, replyText} = this.ui.snapshot();
        if (!selectedId) return;
        try {
            await this.thread.reply(selectedId, replyText, this.files.getData().reply);
            this.ui.setReplyText('');
            this.setReplyFiles([]);
            this.fetchMessages(selectedId);
            // D-198: ответ меняет и статус обращения, и время последнего
            // события — то есть ровно то, что показывает строка слева.
            // Создание тикета список перечитывало, ответ — нет, и строка
            // держала прежний статус до перезагрузки страницы.
            void this.pagination.fetchPage(page);
        } catch (err: any) {
            D('support.error', {action: 'reply', error: err});
            showToast(err?.message || t.General_Error(), 'danger');
        }
    };

    private readonly openNew = () => {
        this.ui.patch({showNewForm: true, selectedId: null, subject: '', message: ''});
        this.setCreateFiles([]);
    };

    private renderList(list: {
        sortedTickets: SupportTicket[];
        selectedId: number | null;
        readTicketIds: Set<number>;
        ticketPage: number;
        ticketTotalPages: number;
        ticketTotal: number;
        ticketsLoading: boolean;
        ticketPerPage: number;
    }) {
        const {sortedTickets, selectedId, readTicketIds, ticketPage, ticketTotalPages, ticketTotal, ticketsLoading,
            ticketPerPage} = list;
        const paginationLabels: PaginationLabels = {
            prev: t.Pagination_Prev(),
            next: t.Pagination_Next(),
            of: t.Pagination_Of(),
            items: t.Pagination_Items(),
        };
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
                onPageChange={this.ticketGoToPage}
                onPageSizeChange={this.ticketSetPerPage}
            />
        );
    }

    private renderBody(selectedTicket: SupportTicket | null, body: {
        tickets: TReadonly<SupportTicket[]>;
        showNewForm: boolean;
        subject: string;
        message: string;
        replyText: string;
        createFiles: TReadonly<PendingFile[]>;
        replyFiles: TReadonly<PendingFile[]>;
        sending: boolean;
        messages: TReadonly<SupportMessage[]>;
        loadingMessages: boolean;
    }) {
        const {tickets, showNewForm, subject, message, replyText, createFiles,
            replyFiles, sending, messages, loadingMessages} = body;
        return showNewForm ? <PageNewTicketForm subject={subject} onSubjectChange={this.ui.setSubject} message={message} onMessageChange={this.ui.setMessage} files={createFiles as PendingFile[]} onFilesChange={this.setCreateFiles} onSubmit={this.handleCreate} onCancel={this.ui.closeForm} sending={sending} /> : selectedTicket ? <PageConversation selectedTicket={selectedTicket} messages={messages as SupportMessage[]} loading={loadingMessages} endRef={this.messagesEnd} replyText={replyText} onReplyTextChange={this.ui.setReplyText} replyFiles={replyFiles as PendingFile[]} onReplyFilesChange={this.setReplyFiles} onReply={this.handleReply} sending={sending} /> : <PageEmpty ticketsCount={tickets.length} />;
    }

    render() {
        const {page: ticketPage, totalPages: ticketTotalPages, total: ticketTotal,
            loading: ticketsLoading, perPage: ticketPerPage} = this.useCarburetor(this.pagination);
        const items = this.ticketsSnapshot() as SupportTicket[];
        const {selectedId, readIds, showNewForm, subject, message, replyText} = this.useCarburetor(this.ui);
        const selectedTicketData = this.selectedTicketSnapshot() as SupportTicket | null;
        const {messages, loading: loadingMessages} = this.threadSnapshot();
        const {create: createFiles, reply: replyFiles} = this.filesSnapshot() as {create: PendingFile[]; reply: PendingFile[]};
        const {sending} = this.useCarburetor(this.sending);
        const readTicketIds = new Set(readIds);
        const selectedTicket = selectedId ? (selectedTicketData?.id === selectedId ? selectedTicketData : findTicket(items, selectedId) ?? null) : null;
        return (
            <div className="comms-page">
                <PageHeader title={t.Support_Title()} icon={PAGE_ICON} />

                <div className="comms-page-layout" data-detail={Boolean(selectedTicket || showNewForm)}>
                    {/* Left: ticket list */}
                    {this.renderList({sortedTickets: items as SupportTicket[], selectedId, readTicketIds, ticketPage,
                        ticketTotalPages, ticketTotal, ticketsLoading, ticketPerPage})}

                    {/* Right: conversation or new form */}
                    <div className="comms-page-thread">
                        {(selectedTicket || showNewForm) && (
                            <PageBackButton onBack={this.ui.back} />
                        )}
                        {this.renderBody(selectedTicket, {tickets: items, showNewForm, subject, message, replyText,
                            createFiles, replyFiles, sending, messages, loadingMessages})}
                    </div>
                </div>


            </div>
        );
    }
}
