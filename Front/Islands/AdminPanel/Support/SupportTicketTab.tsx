import * as React from 'react';
import {useState, useEffect} from 'react';
import {sendPost} from '@common/Api/Send/sendPost';
import {sendPostFormData} from '@common/Api/Send/sendPostFormData';
import {D} from '@common/Support/Debug/D';
import {useSending} from '@common/hooks/data/useSending';

import {showToast} from '@common/Components/Feedback/GlobalToast';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {SupportTicket, SupportMessage, SupportStatus, AssignmentLogEntry, AutoContext} from '../../Comms/Support/parts/supportTypes';
import {PendingFile} from '../../../Common/attachments/AttachmentPicker';
import {reportAttachmentErrors} from '../../../Common/attachments/attachmentErrors';
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

export default function SupportTicketTab({ticketId, ticketDetailUrl, clientContextUrl, replyUrl, internalCommentUrl, changeStatusUrl, assignUrl, moderators, onTicketChanged}: Props) {
    const [data, setData]               = useState<TicketDetailData | null>(null);
    const [error, setError]             = useState<string | null>(null);
    const [replyText, setReplyText]     = useState('');
    const [internalText, setInternalText] = useState('');
    const [replyFiles, setReplyFiles]   = useState<PendingFile[]>([]);
    const [internalFiles, setInternalFiles] = useState<PendingFile[]>([]);
    const [staleWarning, setStaleWarning] = useState(false);
    // D-188: D-167's warning only fires on the next 15s poll — a reply sent
    // within the same short window as a colleague's never triggers it,
    // since at send time neither side has seen the other's message yet.
    // The server now checks this at insert time and flags the response
    // instead; this notice shows immediately, independent of the (already
    // cleared) draft text.
    const [staleReplySent, setStaleReplySent] = useState(false);
    const {sending, withSending} = useSending();

    const replyTextRef = React.useRef(replyText);
    useEffect(() => { replyTextRef.current = replyText; }, [replyText]);
    useEffect(() => { if (!replyText.trim()) setStaleWarning(false); }, [replyText]);
    const messageCountRef = React.useRef<number | null>(null);

    const loadDetail = (notify = false) => {
        setError(null);
        D('support.admin.detail', {ticketId});
        sendPost(ticketDetailUrl, {ticket_id: ticketId}).then((r: any) => {
            if (r?.error) { D('support.error', {action: 'loadDetail', ticketId, error: r.error}); setError(r.error); }
            else {
                const newData = r as TicketDetailData;
                if (
                    messageCountRef.current !== null &&
                    newData.messages.length > messageCountRef.current &&
                    replyTextRef.current.trim()
                ) {
                    // Кто-то ответил в тикете, пока модератор набирал свой ответ —
                    // именно так mod-1/mod-2 в одном цикле чуть не продублировали ответы.
                    setStaleWarning(true);
                }
                messageCountRef.current = newData.messages.length;
                D('support.admin.detail.loaded', {ticketId, messages: newData.messages.length});
                setData(newData);
                if (notify) onTicketChanged?.();
            }
        }).catch((err) => { D('support.error', {action: 'loadDetail', ticketId, error: err}); setError(t.User_LoadError()); });
    };

    useEffect(() => {
        setData(null);
        setStaleWarning(false);
        setStaleReplySent(false);
        messageCountRef.current = null;
        // Открытие гасит непрочитанное на сервере — очередь должна это увидеть.
        loadDetail(true);
    }, [ticketId, ticketDetailUrl]);

    /**
     * Клиентская половина переписки обновляется сама (`useSupportThread`,
     * раз в 15 секунд), а половина сотрудника — нет: ответ человека приходил
     * только по нажатию. Один разговор не должен жить по разным правилам в
     * зависимости от того, с какой стороны прилавка на него смотрят.
     *
     * В свёрнутой вкладке опрос молчит: обновлять то, чего никто не видит, —
     * только нагрузка на сервер.
     */
    useEffect(() => {
        const id = window.setInterval(() => {
            if (!document.hidden) loadDetail();
        }, 15000);

        return () => window.clearInterval(id);
    }, [ticketId, ticketDetailUrl]);

    if (error) return <div className="admin-detail-error">{error}</div>;
    if (!data)  return <div className="admin-detail-loading">{t.User_Loading()}</div>;

    const {ticket, messages, assignmentLog} = data;

    const handleReply = () => {
        if (!replyText.trim()) return;
        withSending(async () => {
            try {
                D('support.admin.reply', {ticketId, hasAttachments: replyFiles.length > 0});
                const fd = new FormData();
                fd.append('ticket_id', String(ticketId));
                fd.append('message', replyText.trim());
                // D-188: what THIS moderator saw when they started composing.
                // The server compares it against the actual count at insert
                // time — the only way to catch two replies typed in the same
                // short window, where neither side's 15s poll fires in time.
                fd.append('known_message_count', String(messageCountRef.current ?? 0));
                for (const f of replyFiles) fd.append('attachments[]', f.file, f.name);
                const resp = await sendPostFormData<FormData, any>(replyUrl, fd);
                setReplyText('');
                setReplyFiles([]);
                setStaleReplySent(!!resp?.staleReply);
                loadDetail(true);
                reportAttachmentErrors(resp);
            } catch (err: any) {
                D('support.error', {action: 'admin.reply', error: err});
                showToast(err?.message || t.General_Error(), 'danger');
            }
        });
    };

    const handleInternalComment = () => {
        if (!internalText.trim()) return;
        withSending(async () => {
            try {
                D('support.admin.internal', {ticketId});
                const fd = new FormData();
                fd.append('ticket_id', String(ticketId));
                fd.append('message', internalText.trim());
                for (const f of internalFiles) fd.append('attachments[]', f.file, f.name);
                const resp = await sendPostFormData<FormData, any>(internalCommentUrl, fd);
                setInternalText('');
                setInternalFiles([]);
                loadDetail(true);
                reportAttachmentErrors(resp);
            } catch (err: any) {
                D('support.error', {action: 'admin.internal', error: err});
                showToast(err?.message || t.General_Error(), 'danger');
            }
        });
    };

    const handleStatusChange = async (newStatus: SupportStatus) => {
        try {
            D('support.admin.status', {ticketId, status: newStatus});
            await sendPost(changeStatusUrl, {ticket_id: ticketId, status: newStatus});
            showToast(t.Support_StatusChanged(), 'success');
            loadDetail(true);
        } catch (err: any) {
            D('support.error', {action: 'admin.status', error: err});
            showToast(err?.message || t.General_Error(), 'danger');
        }
    };

    const handleAssign = async (assigneeId: number | null) => {
        try {
            D('support.admin.assign', {ticketId, assigneeId});
            await sendPost(assignUrl, {ticket_id: ticketId, assignee_id: assigneeId});
            loadDetail(true);
        } catch (err: any) {
            D('support.error', {action: 'admin.assign', error: err});
            showToast(err?.message || t.General_Error(), 'danger');
        }
    };

    return (
        <div className="admin-detail-pane" data-test-id="support-ticket-detail">
            
            <TicketHeader
                ticket={ticket}
                moderators={moderators}
                onStatusChange={handleStatusChange}
                onAssign={handleAssign}
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

            {staleWarning && (
                <div className="alert alert-warning mb-3" data-test-id="support-stale-warning">
                    {t.Support_TicketUpdatedWhileTyping()}
                </div>
            )}

            {staleReplySent && (
                <div className="alert alert-warning mb-3" data-test-id="support-stale-reply-notice">
                    {t.Support_StaleReplySent()}
                    <button
                        type="button"
                        className="btn btn-sm btn-link p-0 ml-2"
                        onClick={() => setStaleReplySent(false)}
                        data-test-id="support-stale-reply-notice-dismiss"
                    >
                        {t.Action_Close()}
                    </button>
                </div>
            )}

            <TicketReplyForm
                replyText={replyText}
                onReplyTextChange={setReplyText}
                replyFiles={replyFiles}
                onReplyFilesChange={setReplyFiles}
                sending={sending}
                onSend={handleReply}
            />

            <TicketInternalForm
                internalText={internalText}
                onInternalTextChange={setInternalText}
                internalFiles={internalFiles}
                onInternalFilesChange={setInternalFiles}
                sending={sending}
                onSend={handleInternalComment}
            />
        </div>
    );
}
