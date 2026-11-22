import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {sendPost} from '@common/Api/Send/sendPost';
import {useLiveCounts} from '@common/hooks/data/useLiveCounts';
import {refreshLiveCounts} from '@common/Utils/Data/liveCounts';
import {D} from '@common/Support/Debug/D';
import {useSending} from '@common/hooks/data/useSending';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import type {PendingFile} from '../../../Common/attachments/AttachmentPicker';
import {initAutoContext} from './parts/autoContext';
import type {SupportTicket} from './parts/supportTypes';
import {useSupportThread} from './parts/useSupportThread';
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

type Snapshot = ReturnType<SupportWidgetState['snapshot']>;

interface ViewProps extends Pick<Props, 'ticketsUrl' | 'pageUrl' | 'imPageUrl'>, ReturnType<typeof useSending> {
    ui: SupportWidgetState;
    snapshot: Snapshot;
    thread: ReturnType<typeof useSupportThread>;
    files: PendingFile[];
    setFiles: React.Dispatch<React.SetStateAction<PendingFile[]>>;
}

function findTicket(tickets: SupportTicket[], id: number | null): SupportTicket | undefined {
    return tickets.find(ticket => ticket.id === id);
}

function notifyCreated(ticketId?: number, etaMinutes?: number): void {
    const confirmation = ticketId
        ? t.Support_TicketCreatedWithId([String(ticketId)]) + (etaMinutes ? ' ' + t.Support_TicketEtaHint([String(etaMinutes)]) : '')
        : t.Support_TicketCreated();
    showToast(confirmation, 'success');
}

class SupportWidgetView extends AntiHookComponent<ViewProps> {
    private pollTimer?: number;

    componentDidUpdate(previous: Readonly<ViewProps>): void {
        super.componentDidUpdate(previous);
        const {snapshot, thread} = this.props;
        const wasListing = previous.snapshot.isOpen && previous.snapshot.view === 'list';
        const listing = snapshot.isOpen && snapshot.view === 'list';
        if (listing !== wasListing) {
            window.clearInterval(this.pollTimer);
            if (listing) this.pollTimer = window.setInterval(this.pollList, 20000);
        }
        if (thread.messages !== previous.thread.messages) {
            thread.messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
        }
    }

    componentWillUnmount(): void {
        window.clearInterval(this.pollTimer);
        super.componentWillUnmount();
    }

    private readonly pollList = () => {
        if (!document.hidden) void this.fetchTickets(true);
    };

    private async fetchTickets(silent = false): Promise<void> {
        const {ui, ticketsUrl} = this.props;
        if (!silent) ui.update({loadingTickets: true});
        D('support.tickets', 'fetch');
        try {
            const response = await sendPost(ticketsUrl, {}) as {tickets?: SupportTicket[]};
            const tickets = response?.tickets ?? [];
            D('support.tickets', {count: tickets.length});
            ui.update({tickets, loadingTickets: false});
        } catch (error) {
            D('support.error', {action: 'fetchTickets', error});
            ui.update({loadingTickets: false});
            if (!silent) showToast(t.User_LoadError(), 'danger');
        }
    }

    private async fetchMessages(ticketId: number): Promise<void> {
        await this.props.thread.loadMessages(ticketId);
        refreshLiveCounts();
    }

    private readonly toggle = () => {
        const {ui} = this.props;
        const {isOpen} = ui.getData();
        D('support.click', isOpen ? 'close-widget' : 'open-widget');
        if (isOpen) ui.close();
        else {
            ui.update({isOpen: true, view: 'list'});
            void this.fetchTickets();
        }
    };

    private readonly openTicket = (ticketId: number) => {
        D('support.click', {action: 'openTicket', ticketId});
        this.props.ui.update({selectedTicketId: ticketId, view: 'conversation', replyText: ''});
        void this.fetchMessages(ticketId);
    };

    private readonly backFromThread = () => {
        this.props.ui.back();
        void this.fetchTickets();
    };

    private readonly create = () => {
        const {subject, message} = this.props.ui.getData();
        if (subject.trim() && message.trim()) void this.props.withSending(this.createTicket);
    };

    private readonly createTicket = async () => {
        const {ui, thread, files, setFiles} = this.props;
        const {subject, message} = ui.getData();
        try {
            const response = await thread.createTicket(subject, message, files);
            D('support.created', {source: 'widget'});
            ui.update({subject: '', message: '', view: 'list'});
            setFiles([]);
            void this.fetchTickets();
            notifyCreated(response?.ticketId, response?.responseEtaMinutes);
        } catch (error: any) {
            D('support.error', {action: 'create', error});
            showToast(error?.message || t.General_Error(), 'danger');
        }
    };

    private readonly reply = () => {
        const {replyText, selectedTicketId} = this.props.ui.getData();
        if (replyText.trim() && selectedTicketId) void this.props.withSending(this.replyToTicket);
    };

    private readonly replyToTicket = async () => {
        const {ui, thread} = this.props;
        const {selectedTicketId, replyText} = ui.getData();
        if (!selectedTicketId) return;
        try {
            await thread.reply(selectedTicketId, replyText, []);
            ui.setReplyText('');
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
        this.props.setFiles(previous => [...previous, entry]);
    };

    private renderBody() {
        const {snapshot, ui, thread, sending, files, setFiles} = this.props;
        if (snapshot.view === 'list') {
            return <WidgetTicketList loadingTickets={snapshot.loadingTickets} tickets={snapshot.tickets} onNew={ui.openNew} onOpen={this.openTicket} />;
        }
        if (snapshot.view === 'conversation') {
            return <WidgetConversation loading={thread.loading} messages={thread.messages} endRef={thread.messagesEndRef}
                selectedTicket={findTicket(snapshot.tickets, snapshot.selectedTicketId)} replyText={snapshot.replyText}
                onReplyTextChange={ui.setReplyText} onReply={this.reply} onBack={this.backFromThread} sending={sending} />;
        }
        return <WidgetNewTicketForm subject={snapshot.subject} onSubjectChange={ui.setSubject} message={snapshot.message}
            onMessageChange={ui.setMessage} files={files} onFilesChange={setFiles} onScreenshot={this.screenshot}
            onSubmit={this.create} onBack={ui.back} sending={sending} />;
    }

    render() {
        const {snapshot, ui, pageUrl, imPageUrl = '/im/'} = this.props;
        return (
            <>
                <WidgetFab badge={snapshot.badge} onToggle={this.toggle} />
                {snapshot.isOpen && (
                    <div data-test-id="support-widget-panel" className="support-widget-panel">
                        <WidgetPanelHeader pageUrl={pageUrl} onClose={ui.close} />
                        <WidgetImLink imUnread={snapshot.imUnread} imPageUrl={imPageUrl} />
                        <div className="support-widget-body">{this.renderBody()}</div>
                    </div>
                )}
            </>
        );
    }
}

export function SupportWidgetIsland(props: Props) {
    const [ui] = React.useState(() => new SupportWidgetState(props.unreadCount, props.unreadIm ?? 0));
    const snapshot = React.useSyncExternalStore(ui.subscribeSnapshot, ui.snapshot, ui.snapshot);
    const [files, setFiles] = React.useState<PendingFile[]>([]);
    const sending = useSending();
    const live = useLiveCounts();
    const thread = useSupportThread({messagesUrl: props.messagesUrl, createUrl: props.createUrl, replyUrl: props.replyUrl});
    React.useEffect(initAutoContext, []);
    React.useEffect(() => {
        if (live) ui.update({badge: live.unreadSupport, imUnread: live.unreadIm});
    }, [live, ui]);
    thread.usePolling(snapshot.selectedTicketId, 20000, snapshot.isOpen && snapshot.view === 'conversation');
    return <SupportWidgetView ui={ui} snapshot={snapshot} thread={thread} {...sending}
        files={files} setFiles={setFiles} ticketsUrl={props.ticketsUrl} pageUrl={props.pageUrl} imPageUrl={props.imPageUrl} />;
}
