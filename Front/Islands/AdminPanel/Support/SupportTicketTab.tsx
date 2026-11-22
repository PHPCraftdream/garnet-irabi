import * as React from 'react';
import {useState} from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {sendPost} from '@common/Api/Send/sendPost';
import {sendPostFormData} from '@common/Api/Send/sendPostFormData';
import {D} from '@common/Support/Debug/D';
import {useSending} from '@common/hooks/data/useSending';

import {showToast} from '@common/Components/Feedback/GlobalToast';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {SupportTicket, SupportMessage, SupportStatus, AssignmentLogEntry, AutoContext} from '../../Comms/Support/parts/supportTypes';
import {PendingFile} from '../../../Common/attachments/AttachmentPicker';
import {reportAttachmentErrors} from '../../../Common/attachments/attachmentHelpers';
import TicketHeader from './SupportTicket/TicketHeader';
import TicketContext from './SupportTicket/TicketContext';
import TicketClientContext from './SupportTicket/TicketClientContext';
import TicketAttachments from './SupportTicket/Attachments/TicketAttachments';
import TicketTimeline from './SupportTicket/TicketTimeline';
import TicketReplyForm from './SupportTicket/Forms/TicketReplyForm';
import TicketInternalForm from './SupportTicket/Forms/TicketInternalForm';

interface Moderator {
    id: number;
    login: string;
    name: string;
}

interface Props {
    ticketId: number;
    ticketDetailUrl: string;
    /** D-209: занятия и деньги клиента. Необязателен — панель просто не рисуется. */
    clientContextUrl?: string;
    replyUrl: string;
    internalCommentUrl: string;
    changeStatusUrl: string;
    assignUrl: string;
    moderators: Moderator[];
    /**
     * D-198: очередь слева живёт в другом компоненте и о том, что произошло
     * внутри вкладки, не узнаёт ничем, кроме перезагрузки страницы. Зовётся в
     * те и только те моменты, когда обращение меняет то, что о нём показано
     * снаружи: открытие (непрочитанное погасло), ответ, внутренний
     * комментарий, смена статуса, назначение. Фоновый опрос сюда НЕ входит —
     * он ничего не меняет, а дёргал бы очередь раз в 15 секунд на вкладку.
     */
    onTicketChanged?: () => void;
}

interface TicketDetailData {
    ticket: SupportTicket;
    messages: SupportMessage[];
    assignmentLog: AssignmentLogEntry[];
    context?: AutoContext | null;
}

interface TicketUI {
    data: TicketDetailData | null;
    error: string | null;
    replyText: string;
    internalText: string;
    staleWarning: boolean;
    staleReplySent: boolean;
}

class TicketUIStore extends Carburetor<TicketUI> {
    constructor() {
        super({data: null, error: null, replyText: '', internalText: '', staleWarning: false, staleReplySent: false});
    }

    readonly snapshot = () => this.getData();
    readonly subscribeSnapshot = (listener: () => void) => {
        const id = this.subscribe(listener);
        return () => this.unsubscribe(id);
    };

    private change<K extends keyof TicketUI>(key: K, value: TicketUI[K]): void {
        const before = this.getData();
        if (Object.is(before[key], value)) return;
        const version = this.getVersion();
        this.setData({...before, [key]: value});
        if (this.getData() !== before && this.getVersion() === version) {
            this.markAllChanged();
            this.emitUpdate();
        }
    }

    readonly setDataSnapshot = (data: TicketDetailData | null) => this.change('data', data);
    readonly setError = (error: string | null) => this.change('error', error);
    readonly setReplyText = (text: string) => this.change('replyText', text);
    readonly setInternalText = (text: string) => this.change('internalText', text);
    readonly setStaleWarning = (value: boolean) => this.change('staleWarning', value);
    readonly setStaleReplySent = (value: boolean) => this.change('staleReplySent', value);
    readonly dismissStaleReply = () => this.setStaleReplySent(false);
}

function createTicketUI(): TicketUIStore {
    return new TicketUIStore();
}

interface TabViewProps extends Props, ReturnType<typeof useSending> {
    ui: TicketUIStore;
    snapshot: ReturnType<TicketUIStore['snapshot']>;
    replyFiles: PendingFile[];
    internalFiles: PendingFile[];
    setReplyFiles: (files: PendingFile[]) => void;
    setInternalFiles: (files: PendingFile[]) => void;
}

class SupportTicketView extends AntiHookComponent<TabViewProps> {
    private timer?: number;
    private messageCount: number | null = null;

    componentDidMount(): void {
        super.componentDidMount();
        this.openTicket();
    }

    componentDidUpdate(previous: Readonly<TabViewProps>): void {
        super.componentDidUpdate(previous);
        const {ticketId, ticketDetailUrl, snapshot, ui} = this.props;
        if (previous.snapshot.replyText !== snapshot.replyText && !snapshot.replyText.trim()) ui.setStaleWarning(false);
        if (ticketId !== previous.ticketId || ticketDetailUrl !== previous.ticketDetailUrl) this.openTicket();
    }

    componentWillUnmount(): void {
        window.clearInterval(this.timer);
        super.componentWillUnmount();
    }

    private openTicket(): void {
        window.clearInterval(this.timer);
        const {ui} = this.props;
        this.messageCount = null;
        ui.setDataSnapshot(null);
        ui.setStaleWarning(false);
        ui.setStaleReplySent(false);
        this.loadDetail(true);
        this.timer = window.setInterval(this.poll, 15000);
    }

    private readonly poll = () => {
        if (!document.hidden) this.loadDetail();
    };

    private loadDetail(notify = false, target = this.props): void {
        const {ticketId, ticketDetailUrl, onTicketChanged} = target;
        const {setError, setDataSnapshot: setData, setStaleWarning} = target.ui;
        setError(null);
        D('support.admin.detail', {ticketId});
        sendPost(ticketDetailUrl, {ticket_id: ticketId}).then((r: any) => {
            if (r?.error) { D('support.error', {action: 'loadDetail', ticketId, error: r.error}); setError(r.error); }
            else {
                const newData = r as TicketDetailData;
                if (
                    this.messageCount !== null &&
                    newData.messages.length > this.messageCount &&
                    this.props.snapshot.replyText.trim()
                ) {
                    // Кто-то ответил в тикете, пока модератор набирал свой ответ —
                    // именно так mod-1/mod-2 в одном цикле чуть не продублировали ответы.
                    setStaleWarning(true);
                }
                this.messageCount = newData.messages.length;
                D('support.admin.detail.loaded', {ticketId, messages: newData.messages.length});
                setData(newData);
                if (notify) onTicketChanged?.();
            }
        }).catch((err) => { D('support.error', {action: 'loadDetail', ticketId, error: err}); setError(t.User_LoadError()); });
    }

    private readonly handleReply = () => {
        if (this.props.snapshot.replyText.trim()) void this.props.withSending(this.sendReply);
    };

    private readonly sendReply = async () => {
        const target = this.props;
        const {ticketId, replyFiles, setReplyFiles, replyUrl} = target;
        const {replyText} = target.snapshot;
        const {setReplyText, setStaleReplySent} = target.ui;
        try {
            D('support.admin.reply', {ticketId, hasAttachments: replyFiles.length > 0});
            const fd = new FormData();
            fd.append('ticket_id', String(ticketId));
            fd.append('message', replyText.trim());
            // D-188: what THIS moderator saw when they started composing.
            // The server compares it against the actual count at insert
            // time — the only way to catch two replies typed in the same
            // short window, where neither side's 15s poll fires in time.
            fd.append('known_message_count', String(this.messageCount ?? 0));
            for (const f of replyFiles) fd.append('attachments[]', f.file, f.name);
            const resp = await sendPostFormData<FormData, any>(replyUrl, fd);
            setReplyText('');
            setReplyFiles([]);
            setStaleReplySent(!!resp?.staleReply);
            this.loadDetail(true, target);
            reportAttachmentErrors(resp);
        } catch (err: any) {
            D('support.error', {action: 'admin.reply', error: err});
            showToast(err?.message || t.General_Error(), 'danger');
        }
    };

    private readonly handleInternalComment = () => {
        if (this.props.snapshot.internalText.trim()) void this.props.withSending(this.sendInternal);
    };

    private readonly sendInternal = async () => {
        const target = this.props;
        const {ticketId, internalFiles, setInternalFiles, internalCommentUrl} = target;
        const {internalText} = target.snapshot;
        const {setInternalText} = target.ui;
        try {
            D('support.admin.internal', {ticketId});
            const fd = new FormData();
            fd.append('ticket_id', String(ticketId));
            fd.append('message', internalText.trim());
            for (const f of internalFiles) fd.append('attachments[]', f.file, f.name);
            const resp = await sendPostFormData<FormData, any>(internalCommentUrl, fd);
            setInternalText('');
            setInternalFiles([]);
            this.loadDetail(true, target);
            reportAttachmentErrors(resp);
        } catch (err: any) {
            D('support.error', {action: 'admin.internal', error: err});
            showToast(err?.message || t.General_Error(), 'danger');
        }
    };

    private readonly handleStatusChange = async (newStatus: SupportStatus) => {
        const target = this.props;
        const {ticketId, changeStatusUrl} = target;
        try {
            D('support.admin.status', {ticketId, status: newStatus});
            await sendPost(changeStatusUrl, {ticket_id: ticketId, status: newStatus});
            showToast(t.Support_StatusChanged(), 'success');
            this.loadDetail(true, target);
        } catch (err: any) {
            D('support.error', {action: 'admin.status', error: err});
            showToast(err?.message || t.General_Error(), 'danger');
        }
    };

    private readonly handleAssign = async (assigneeId: number | null) => {
        const target = this.props;
        const {ticketId, assignUrl} = target;
        try {
            D('support.admin.assign', {ticketId, assigneeId});
            await sendPost(assignUrl, {ticket_id: ticketId, assignee_id: assigneeId});
            this.loadDetail(true, target);
        } catch (err: any) {
            D('support.error', {action: 'admin.assign', error: err});
            showToast(err?.message || t.General_Error(), 'danger');
        }
    };

    private renderNotices() {
        const {ui, snapshot: {staleWarning, staleReplySent}} = this.props;
        return (
            <>
                {staleWarning && (
                    <div className="admin-support-stale-warning" data-test-id="support-stale-warning">
                        {t.Support_TicketUpdatedWhileTyping()}
                    </div>
                )}

                {staleReplySent && (
                    <div className="admin-support-stale-warning" data-test-id="support-stale-reply-notice">
                        {t.Support_StaleReplySent()}
                        <button
                            type="button"
                            className="admin-support-stale-dismiss"
                            onClick={ui.dismissStaleReply}
                            data-test-id="support-stale-reply-notice-dismiss"
                        >
                            {t.Action_Close()}
                        </button>
                    </div>
                )}
            </>
        );
    }

    private renderForms() {
        const {ui, snapshot: {replyText, internalText}, replyFiles, internalFiles, setReplyFiles, setInternalFiles, sending} = this.props;
        const {setReplyText, setInternalText} = ui;
        return (
            <>
                <TicketReplyForm
                    replyText={replyText}
                    onReplyTextChange={setReplyText}
                    replyFiles={replyFiles}
                    onReplyFilesChange={setReplyFiles}
                    sending={sending}
                    onSend={this.handleReply}
                />

                <TicketInternalForm
                    internalText={internalText}
                    onInternalTextChange={setInternalText}
                    internalFiles={internalFiles}
                    onInternalFilesChange={setInternalFiles}
                    sending={sending}
                    onSend={this.handleInternalComment}
                />
            </>
        );
    }

    render() {
        const {ticketId, clientContextUrl, moderators, snapshot: {data, error}} = this.props;
        if (error) return <div className="admin-support-detail-error">{error}</div>;
        if (!data) return <div className="admin-support-detail-loading">{t.User_Loading()}</div>;
        const {ticket, messages, assignmentLog} = data;
        return (
            <div className="admin-support-detail" data-test-id="support-ticket-detail">

                <TicketHeader
                    ticket={ticket}
                    moderators={moderators}
                    onStatusChange={this.handleStatusChange}
                    onAssign={this.handleAssign}
                />

                <TicketTimeline
                    messages={messages}
                    assignmentLog={assignmentLog}
                />

                {data.context && <TicketContext context={data.context} />}

                {/*
                  * D-209: рядом с обращением — занятия и деньги того, кто его
                  * написал. Без этого модератор уходил искать их в другой раздел
                  * по имени, на каждое обращение заново.
                  */}
                <TicketClientContext ticketId={ticketId} clientContextUrl={clientContextUrl} />

                <TicketAttachments messages={messages} />
                {this.renderNotices()}
                {this.renderForms()}
            </div>
        );
    }
}

export default function SupportTicketTab(props: Props) {
    const [ui] = useState(createTicketUI);
    const snapshot = React.useSyncExternalStore(ui.subscribeSnapshot, ui.snapshot, ui.snapshot);
    const [replyFiles, setReplyFiles] = useState<PendingFile[]>([]);
    const [internalFiles, setInternalFiles] = useState<PendingFile[]>([]);
    const sending = useSending();
    return <SupportTicketView {...props} {...sending} ui={ui} snapshot={snapshot} replyFiles={replyFiles}
        internalFiles={internalFiles} setReplyFiles={setReplyFiles} setInternalFiles={setInternalFiles} />;
}
