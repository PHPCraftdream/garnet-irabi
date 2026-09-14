import * as React from 'react';
import {useState, useEffect} from 'react';
import {sendPost} from '@common/Api/sendPost';
import {sendPostFormData} from '@common/Api/sendPostFormData';
import {D} from '@common/Debug/D';
import {useSending} from '@common/hooks/useSending';

import {showToast} from '@common/Components/GlobalToast';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {SupportTicket, SupportMessage, SupportStatus, AssignmentLogEntry, AutoContext} from '../Support/supportTypes';
import {PendingFile} from '../../Common/AttachmentPicker';
import {reportAttachmentErrors} from '../../Common/attachmentErrors';
import TicketHeader from './SupportTicket/TicketHeader';
import TicketContext from './SupportTicket/TicketContext';
import TicketAttachments from './SupportTicket/TicketAttachments';
import TicketTimeline from './SupportTicket/TicketTimeline';
import TicketReplyForm from './SupportTicket/TicketReplyForm';
import TicketInternalForm from './SupportTicket/TicketInternalForm';

interface Moderator {
    id: number;
    login: string;
    name: string;
}

interface Props {
    ticketId: number;
    ticketDetailUrl: string;
    replyUrl: string;
    internalCommentUrl: string;
    changeStatusUrl: string;
    assignUrl: string;
    moderators: Moderator[];
}

interface TicketDetailData {
    ticket: SupportTicket;
    messages: SupportMessage[];
    assignmentLog: AssignmentLogEntry[];
    context?: AutoContext | null;
}

export default function SupportTicketTab({ticketId, ticketDetailUrl, replyUrl, internalCommentUrl, changeStatusUrl, assignUrl, moderators}: Props) {
    const [data, setData]               = useState<TicketDetailData | null>(null);
    const [error, setError]             = useState<string | null>(null);
    const [replyText, setReplyText]     = useState('');
    const [internalText, setInternalText] = useState('');
    const [replyFiles, setReplyFiles]   = useState<PendingFile[]>([]);
    const [internalFiles, setInternalFiles] = useState<PendingFile[]>([]);
    const [staleWarning, setStaleWarning] = useState(false);
    const {sending, withSending} = useSending();

    const replyTextRef = React.useRef(replyText);
    useEffect(() => { replyTextRef.current = replyText; }, [replyText]);
    useEffect(() => { if (!replyText.trim()) setStaleWarning(false); }, [replyText]);
    const messageCountRef = React.useRef<number | null>(null);

    const loadDetail = () => {
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
            }
        }).catch((err) => { D('support.error', {action: 'loadDetail', ticketId, error: err}); setError(t.User_LoadError()); });
    };

    useEffect(() => {
        setData(null);
        setStaleWarning(false);
        messageCountRef.current = null;
        loadDetail();
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
                for (const f of replyFiles) fd.append('attachments[]', f.file, f.name);
                const resp = await sendPostFormData<FormData, any>(replyUrl, fd);
                setReplyText('');
                setReplyFiles([]);
                loadDetail();
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
                loadDetail();
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
            loadDetail();
        } catch (err: any) {
            D('support.error', {action: 'admin.status', error: err});
            showToast(err?.message || t.General_Error(), 'danger');
        }
    };

    const handleAssign = async (assigneeId: number | null) => {
        try {
            D('support.admin.assign', {ticketId, assigneeId});
            await sendPost(assignUrl, {ticket_id: ticketId, assignee_id: assigneeId});
            loadDetail();
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

            <TicketAttachments messages={messages} />

            {staleWarning && (
                <div className="alert alert-warning mb-3" data-test-id="support-stale-warning">
                    {t.Support_TicketUpdatedWhileTyping()}
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
