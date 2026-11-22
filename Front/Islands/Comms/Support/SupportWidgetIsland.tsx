import * as React from 'react';
import {AntiHookComponent, Carburetor, type TReadonly} from '@react-carburetor/core';
import {sendPost} from '@common/Api/Send/sendPost';
import {refreshLiveCounts, startLiveCounts, subscribeLiveCounts} from '@common/Utils/Data/liveCounts';
import type {LiveCounts} from '@common/Utils/Data/liveCounts';
import {D} from '@common/Support/Debug/D';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import type {PendingFile} from '../../../Common/attachments/AttachmentPicker';
import {initAutoContext} from './parts/autoContext';
import type {SupportMessage, SupportTicket} from './parts/supportTypes';
import {SupportThreadController} from './parts/SupportThreadController';
import {SupportSending} from './parts/supportSending';
import {SupportWidgetState} from './SupportWidgetState';
import {WidgetFab} from './Widget/WidgetFab';
import {WidgetPanelHeader} from './Widget/WidgetPanelHeader';
import {WidgetImLink} from './Widget/WidgetImLink';
import {WidgetTicketList} from './Widget/WidgetTicketList';
import {WidgetConversation} from './Widget/WidgetConversation';
import {WidgetNewTicketForm} from './Widget/WidgetNewTicketForm';

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

const selectLiveCounts = (data: {counts: LiveCounts | null}): LiveCounts | null => data.counts;

function findTicket(tickets: SupportTicket[], id: number | null): SupportTicket | undefined {
    return tickets.find(ticket => ticket.id === id);
}

function notifyCreated(ticketId?: number, etaMinutes?: number): void {
    const confirmation = ticketId
        ? t.Support_TicketCreatedWithId([String(ticketId)]) + (etaMinutes ? ' ' + t.Support_TicketEtaHint([String(etaMinutes)]) : '')
        : t.Support_TicketCreated();
    showToast(confirmation, 'success');
}

export class SupportWidgetIsland extends AntiHookComponent<Props> {
    private readonly ui = new SupportWidgetState(this.props.unreadCount, this.props.unreadIm ?? 0);
    private readonly thread = new SupportThreadController({messagesUrl: this.props.messagesUrl, createUrl: this.props.createUrl, replyUrl: this.props.replyUrl});
    private readonly sending = new SupportSending();
    private readonly files = new Carburetor<{list: PendingFile[]}>({list: []});
    private readonly live = new Carburetor<{counts: LiveCounts | null}>({counts: null});
    private readonly messagesEnd = React.createRef<HTMLDivElement>();
    /*
     * Список обращений, переписка и выбранные файлы приходят заменой массива целиком, а
     * `setData` диффит замену до листьев: подписка на маркер `tickets.~p`/`messages.~p`
     * фоновый опрос не замечает, и строки остаются со старыми прокси. Снимок
     * `connectSelection` читает поля и меняет идентичность только вместе с содержимым
     * (RULES.md, «Подписки useCarburetor»).
     */
    private readonly ticketsSnapshot = this.connectSelection(this.ui, state => state.tickets);
    private readonly threadSnapshot = this.connectSelection(this.thread, state => state);
    private readonly filesSnapshot = this.connectSelection(this.files, state => state);

    private readonly setFiles = (files: PendingFile[]) => this.files.setData({list: files});
    private readonly setLiveCounts = (counts: LiveCounts) => this.live.setData({counts});

    // Уборки вынесены в поля: ссылки на них должны быть стабильными.
    private readonly stopThreadPolling = () => this.thread.stopPolling();
    private readonly applyLiveCounts = (counts: LiveCounts | null): void => {
        if (counts) this.ui.patch({badge: counts.unreadSupport, imUnread: counts.unreadIm});
    };

    protected override useEffects(): void {
        const {selectedTicketId, isOpen, view} = this.ui.snapshot();
        const {messages} = this.thread.snapshot();
        const pollEnabled = isOpen && view === 'conversation';
        const listing = isOpen && view === 'list';

        // Init auto-context collector on mount
        this.useEffect('autoContext', () => { initAutoContext(); }, []);

        this.useEffect('live', () => {
            startLiveCounts();

            return subscribeLiveCounts(this.setLiveCounts);
        }, []);

        // Значок следует за самой записью счётчиков: deps из getData() не перезапустили бы
        // эффект, когда придёт новый опрос, и значок остался бы прежним.
        this.useStoreEffect('liveBadge', this.live, selectLiveCounts, this.applyLiveCounts);

        this.useEffect('poll', () => {
            if (selectedTicketId === null || !pollEnabled) {
                this.thread.stopPolling();

                return;
            }
            this.thread.startPolling(selectedTicketId, 20000);

            return this.stopThreadPolling;
        }, [selectedTicketId, pollEnabled]);

        this.useEffect('listPoll', () => {
            if (!listing) return;
            const id = window.setInterval(this.pollList, 20000);

            return () => window.clearInterval(id);
        }, [listing]);

        this.useEffect('scroll', () => { this.messagesEnd.current?.scrollIntoView({behavior: 'smooth'}); }, [messages]);
    }

    private readonly pollList = () => {
        if (!document.hidden) void this.fetchTickets(true);
    };

    private async fetchTickets(silent = false): Promise<void> {
        const {ticketsUrl} = this.props;
        if (!silent) this.ui.patch({loadingTickets: true});
        D('support.tickets', 'fetch');
        try {
            const response = await sendPost(ticketsUrl, {}) as {tickets?: SupportTicket[]};
            const tickets = response?.tickets ?? [];
            D('support.tickets', {count: tickets.length});
            this.ui.patch({tickets, loadingTickets: false});
        } catch (error) {
            D('support.error', {action: 'fetchTickets', error});
            this.ui.patch({loadingTickets: false});
            if (!silent) showToast(t.User_LoadError(), 'danger');
        }
    }

    private async fetchMessages(ticketId: number): Promise<void> {
        await this.thread.loadMessages(ticketId);
        refreshLiveCounts();
    }

    private readonly toggle = () => {
        const {isOpen} = this.ui.getData();
        D('support.click', isOpen ? 'close-widget' : 'open-widget');
        if (isOpen) this.ui.close();
        else {
            this.ui.patch({isOpen: true, view: 'list'});
            void this.fetchTickets();
        }
    };

    private readonly openTicket = (ticketId: number) => {
        D('support.click', {action: 'openTicket', ticketId});
        this.ui.patch({selectedTicketId: ticketId, view: 'conversation', replyText: ''});
        void this.fetchMessages(ticketId);
    };

    private readonly backFromThread = () => {
        this.ui.back();
        void this.fetchTickets();
    };

    private readonly create = () => {
        const {subject, message} = this.ui.getData();
        if (subject.trim() && message.trim()) void this.sending.withSending(this.createTicket);
    };

    private readonly createTicket = async () => {
        const {subject, message} = this.ui.getData();
        try {
            const response = await this.thread.createTicket(subject, message, this.files.getData().list);
            D('support.created', {source: 'widget'});
            this.ui.patch({subject: '', message: '', view: 'list'});
            this.setFiles([]);
            void this.fetchTickets();
            notifyCreated(response?.ticketId, response?.responseEtaMinutes);
        } catch (error: any) {
            D('support.error', {action: 'create', error});
            showToast(error?.message || t.General_Error(), 'danger');
        }
    };

    private readonly reply = () => {
        const {replyText, selectedTicketId} = this.ui.getData();
        if (replyText.trim() && selectedTicketId) void this.sending.withSending(this.replyToTicket);
    };

    private readonly replyToTicket = async () => {
        const {selectedTicketId, replyText} = this.ui.getData();
        if (!selectedTicketId) return;
        try {
            await this.thread.reply(selectedTicketId, replyText, []);
            this.ui.setReplyText('');
            void this.fetchMessages(selectedTicketId);
            void this.fetchTickets(true);
        } catch (error: any) {
            D('support.error', {action: 'reply', error});
            showToast(error?.message || t.General_Error(), 'danger');
        }
    };

    private readonly screenshot = (blob: Blob, name: string) => {
        D('support.screenshot', {name, size: blob.size, source: 'widget'});
        const entry: PendingFile = {id: crypto.randomUUID(), file: blob, name, preview: URL.createObjectURL(blob)};
        this.setFiles([...this.files.getData().list, entry]);
    };

    private renderBody(body: {
        view: 'list' | 'conversation' | 'new';
        loadingTickets: boolean;
        tickets: TReadonly<SupportTicket[]>;
        selectedTicketId: number | null;
        replyText: string;
        subject: string;
        message: string;
        files: TReadonly<PendingFile[]>;
        messages: TReadonly<SupportMessage[]>;
        loadingMessages: boolean;
        sending: boolean;
    }) {
        const {view, loadingTickets, tickets, selectedTicketId, replyText, subject, message,
            files, messages, loadingMessages, sending} = body;
        if (view === 'list') {
            return <WidgetTicketList loadingTickets={loadingTickets} tickets={tickets as SupportTicket[]} onNew={this.ui.openNew} onOpen={this.openTicket} />;
        }
        if (view === 'conversation') {
            return <WidgetConversation loading={loadingMessages} messages={messages as SupportMessage[]} endRef={this.messagesEnd}
                selectedTicket={findTicket(tickets as SupportTicket[], selectedTicketId)} replyText={replyText}
                onReplyTextChange={this.ui.setReplyText} onReply={this.reply} onBack={this.backFromThread} sending={sending} />;
        }
        return <WidgetNewTicketForm subject={subject} onSubjectChange={this.ui.setSubject} message={message}
            onMessageChange={this.ui.setMessage} files={files as PendingFile[]} onFilesChange={this.setFiles} onScreenshot={this.screenshot}
            onSubmit={this.create} onBack={this.ui.back} sending={sending} />;
    }

    render() {
        const {isOpen, badge, imUnread, view, loadingTickets, selectedTicketId,
            replyText, subject, message} = this.useCarburetor(this.ui);
        const tickets = this.ticketsSnapshot() as SupportTicket[];
        const {messages, loading: loadingMessages} = this.threadSnapshot();
        const {sending} = this.useCarburetor(this.sending);
        const {list: files} = this.filesSnapshot();
        const {pageUrl, imPageUrl = '/im/'} = this.props;
        return (
            <>
                <WidgetFab badge={badge} onToggle={this.toggle} />
                {isOpen && (
                    <div data-test-id="support-widget-panel" className="support-widget-panel">
                        <WidgetPanelHeader pageUrl={pageUrl} onClose={this.ui.close} />
                        <WidgetImLink imUnread={imUnread} imPageUrl={imPageUrl} />
                        <div className="support-widget-body">{this.renderBody({view, loadingTickets, tickets, selectedTicketId,
                            replyText, subject, message, files, messages, loadingMessages, sending})}</div>
                    </div>
                )}
            </>
        );
    }
}
