import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {sendPost} from '@common/Api/Send/sendPost';
import {sendPostFormData} from '@common/Api/Send/sendPostFormData';
import {D} from '@common/Support/Debug/D';

import {showToast} from '@common/Components/Feedback/GlobalToast';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {SupportTicket, SupportMessage, SupportStatus, AssignmentLogEntry, AutoContext} from
    '../../Comms/Support/parts/supportTypes';
import {SupportSending} from '../../Comms/Support/parts/thread/supportSending';
import {PendingFile} from '../../../Common/attachments/AttachmentPicker';
import {reportAttachmentErrors} from '../../../Common/attachments/helpers/reportAttachmentErrors';
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
    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    constructor() {
        super({data: null, error: null, replyText: '', internalText: '', staleWarning: false, staleReplySent: false});
    }

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    readonly snapshot = () => this.getData();
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    readonly subscribeSnapshot = (listener: () => void) => {
        const id = this.subscribe(listener);
        return () => this.unsubscribe(id);
    };

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
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

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    readonly setDataSnapshot = (data: TicketDetailData | null) => this.change('data', data);
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    readonly setError = (error: string | null) => this.change('error', error);
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    readonly setReplyText = (text: string) => this.change('replyText', text);
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    readonly setInternalText = (text: string) => this.change('internalText', text);
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    readonly setStaleWarning = (value: boolean) => this.change('staleWarning', value);
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    readonly setStaleReplySent = (value: boolean) => this.change('staleReplySent', value);
    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    readonly dismissStaleReply = () => this.setStaleReplySent(false);
}

export default class SupportTicketTab extends AntiHookComponent<Props> {
    private readonly ui = new TicketUIStore();
    private readonly files = new Carburetor<{reply: PendingFile[]; internal: PendingFile[]}>({reply: [], internal: []});
    private readonly sending = new SupportSending();
    /*
     * Опрос каждые 15 с и выбор файла заменяют `data`/`reply`/`internal` целиком, а `setData`
     * диффит замену до листьев: подписка на маркеры `data.~p`/`reply.~p` такого не видит, и
     * дети-классы остаются со старыми прокси. Снимок `connectSelection` читает поля и меняет
     * идентичность только вместе с содержимым (RULES.md, «Подписки useCarburetor»).
     */
    private readonly detailSnapshot = this.connectSelection(this.ui, state => state.data);
    private readonly filesSnapshot = this.connectSelection(this.files, state => ({reply: state.reply,
        internal: state.internal}));
    private timer?: number;
    private messageCount: number | null = null;
    // replyText предыдущего рендера: раньше его давал snapshot в props.
    private lastReplyText = '';

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly setReplyFiles = (files: PendingFile[]) => this.files.setData({...this.files.getData(),
        reply: files});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly setInternalFiles = (files: PendingFile[]) => this.files.setData({...this.files.getData(),
        internal: files});

    /** Синхронизирует жизненный цикл компонента с его внешними подписками. */
    componentDidMount(): void {
        super.componentDidMount();
        this.openTicket();
    }

    /** Синхронизирует жизненный цикл компонента с его внешними подписками. */
    componentDidUpdate(previous: Readonly<Props>): void {
        super.componentDidUpdate(previous);
        const {ticketId, ticketDetailUrl} = this.props;
        const {replyText} = this.ui.getData();
        if (this.lastReplyText !== replyText && !replyText.trim()) this.ui.setStaleWarning(false);
        this.lastReplyText = replyText;
        if (ticketId !== previous.ticketId || ticketDetailUrl !== previous.ticketDetailUrl) this.openTicket();
    }

    /** Синхронизирует жизненный цикл компонента с его внешними подписками. */
    componentWillUnmount(): void {
        window.clearInterval(this.timer);
        super.componentWillUnmount();
    }

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private openTicket(): void {
        window.clearInterval(this.timer);
        this.messageCount = null;
        this.ui.setDataSnapshot(null);
        this.ui.setStaleWarning(false);
        this.ui.setStaleReplySent(false);
        this.loadDetail(true);
        this.timer = window.setInterval(this.poll, 15000);
    }

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private readonly poll = () => {
        if (!document.hidden) this.loadDetail();
    };

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private loadDetail(notify = false, target: Props = this.props): void {
        const {ticketId, ticketDetailUrl, onTicketChanged} = target;
        const {setError, setDataSnapshot: setData, setStaleWarning} = this.ui;
        setError(null);
        D('support.admin.detail', {ticketId});
        sendPost(ticketDetailUrl, {ticket_id: ticketId}).then((r: any) => {
            if (r?.error) { D('support.error', {action: 'loadDetail', ticketId, error: r.error}); setError(r.error); }
            else {
                const newData = r as TicketDetailData;
                if (
                    this.messageCount !== null &&
                    newData.messages.length > this.messageCount &&
                    this.ui.getData().replyText.trim()
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
        }).catch((err) => { D('support.error', {action: 'loadDetail', ticketId, error: err});
        setError(t.User_LoadError()); });
    }

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly handleReply = () => {
        if (this.ui.getData().replyText.trim()) void this.sending.withSending(this.sendReply);
    };

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly sendReply = async () => {
        const target = this.props;
        const {ticketId, replyUrl} = target;
        const {reply: replyFiles} = this.files.getData();
        const {replyText} = this.ui.getData();
        const {setReplyText, setStaleReplySent} = this.ui;
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
            this.setReplyFiles([]);
            setStaleReplySent(!!resp?.staleReply);
            this.loadDetail(true, target);
            reportAttachmentErrors(resp);
        } catch (err: any) {
            D('support.error', {action: 'admin.reply', error: err});
            showToast(err?.message || t.General_Error(), 'danger');
        }
    };

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly handleInternalComment = () => {
        if (this.ui.getData().internalText.trim()) void this.sending.withSending(this.sendInternal);
    };

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly sendInternal = async () => {
        const target = this.props;
        const {ticketId, internalCommentUrl} = target;
        const {internal: internalFiles} = this.files.getData();
        const {internalText} = this.ui.getData();
        const {setInternalText} = this.ui;
        try {
            D('support.admin.internal', {ticketId});
            const fd = new FormData();
            fd.append('ticket_id', String(ticketId));
            fd.append('message', internalText.trim());
            for (const f of internalFiles) fd.append('attachments[]', f.file, f.name);
            const resp = await sendPostFormData<FormData, any>(internalCommentUrl, fd);
            setInternalText('');
            this.setInternalFiles([]);
            this.loadDetail(true, target);
            reportAttachmentErrors(resp);
        } catch (err: any) {
            D('support.error', {action: 'admin.internal', error: err});
            showToast(err?.message || t.General_Error(), 'danger');
        }
    };

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
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

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
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

    /** Формирует представление данных для соответствующего раздела панели. */
    private renderNotices(notices: {staleWarning: boolean; staleReplySent: boolean}) {
        const {staleWarning, staleReplySent} = notices;
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
                            onClick={this.ui.dismissStaleReply}
                            data-test-id="support-stale-reply-notice-dismiss"
                        >
                            {t.Action_Close()}
                        </button>
                    </div>
                )}
            </>
        );
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    private renderForms(forms: {replyText: string; internalText: string; replyFiles: PendingFile[];
        internalFiles: PendingFile[]; sending: boolean}) {
        const {replyText, internalText, replyFiles, internalFiles, sending} = forms;
        const {setReplyText, setInternalText} = this.ui;
        return (
            <>
                <TicketReplyForm
                    replyText={replyText}
                    onReplyTextChange={setReplyText}
                    replyFiles={replyFiles}
                    onReplyFilesChange={this.setReplyFiles}
                    sending={sending}
                    onSend={this.handleReply}
                />

                <TicketInternalForm
                    internalText={internalText}
                    onInternalTextChange={setInternalText}
                    internalFiles={internalFiles}
                    onInternalFilesChange={this.setInternalFiles}
                    sending={sending}
                    onSend={this.handleInternalComment}
                />
            </>
        );
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    render() {
        const {ticketId, clientContextUrl, moderators} = this.props;
        // Вид из useCarburetor — TReadonly; детям нужны те же мутабельные типы, что и раньше.
        const {error, replyText, internalText, staleWarning, staleReplySent} = this.useCarburetor(this.ui);
        const data = this.detailSnapshot() as TicketDetailData | null;
        const {reply: replyFiles, internal: internalFiles} = this.filesSnapshot() as {reply: PendingFile[];
        internal: PendingFile[]};
        const {sending} = this.useCarburetor(this.sending);
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
                {this.renderNotices({staleWarning, staleReplySent})}
                {this.renderForms({replyText, internalText, replyFiles, internalFiles, sending})}
            </div>
        );
    }
}
