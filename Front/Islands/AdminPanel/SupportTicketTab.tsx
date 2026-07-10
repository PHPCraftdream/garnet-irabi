import * as React from 'react';
import {useState, useEffect, useRef} from 'react';
import {sendPost} from '@common/Api/sendPost';
import {sendPostFormData} from '@common/Api/sendPostFormData';
import {D} from '@common/Debug/D';
import {useSending} from '@common/hooks/useSending';

import {showToast} from '@common/Components/GlobalToast';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {SupportTicket, SupportMessage, SupportStatus, AssignmentLogEntry, AutoContext} from '../Support/supportTypes';
import {PendingFile} from '../../Common/AttachmentPicker';
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
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const {sending, withSending} = useSending();
    

    const loadDetail = () => {
        setError(null);
        D('support.admin.detail', {ticketId});
        sendPost(ticketDetailUrl, {ticket_id: ticketId}).then((r: any) => {
            if (r?.error) { D('support.error', {action: 'loadDetail', ticketId, error: r.error}); setError(r.error); }
            else { D('support.admin.detail.loaded', {ticketId, messages: (r as TicketDetailData).messages.length}); setData(r as TicketDetailData); }
        }).catch((err) => { D('support.error', {action: 'loadDetail', ticketId, error: err}); setError(t.User_LoadError()); });
    };

    useEffect(() => {
        setData(null);
        loadDetail();
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
                await sendPostFormData<FormData, any>(replyUrl, fd);
                setReplyText('');
                setReplyFiles([]);
                loadDetail();
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
                await sendPostFormData<FormData, any>(internalCommentUrl, fd);
                setInternalText('');
                setInternalFiles([]);
                loadDetail();
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
                messagesEndRef={messagesEndRef}
            />

            {data.context && <TicketContext context={data.context} />}

            <TicketAttachments messages={messages} />

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
