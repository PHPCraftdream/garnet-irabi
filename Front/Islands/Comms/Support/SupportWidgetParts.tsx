import * as React from 'react';

import SendButton from '@common/Components/Controls/SendButton';
import {useCtrlEnter, CTRL_ENTER_HINT} from '@common/hooks/ui/useCtrlEnter';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {SupportTicket, SupportMessage} from './parts/supportTypes';
import {StatusBadge} from './parts/supportRenders';
import {SupportTicketRow} from './parts/SupportTicketRow';
import {SupportBubble} from './parts/SupportBubble';
import AttachmentPicker, {PendingFile} from '../../../Common/attachments/AttachmentPicker';
import ScreenshotButton from '../../../Common/media/ScreenshotButton';

interface FabProps {
    badge: number;
    onToggle: () => void;
}

/** Плавающая кнопка виджета. */
export const WidgetFab: React.FC<FabProps> = ({badge, onToggle}) => (
    <button
        type="button"
        data-test-id="support-widget-btn"
        className="support-widget-fab"
        title={t.Support_Widget_Title()}
        onClick={onToggle}
    >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16">
            <path d="M2.678 11.894a1 1 0 0 1 .287.801 11 11 0 0 1-.398 2c1.395-.323 2.247-.697 2.634-.893a1 1 0 0 1 .71-.074A8 8 0 0 0 8 14c3.996 0 7-2.807 7-6s-3.004-6-7-6-7 2.808-7 6c0 1.468.617 2.83 1.678 3.894m-.493 3.905a22 22 0 0 1-.713.129c-.2.032-.352-.176-.273-.362a10 10 0 0 0 .244-.637l.003-.01c.248-.72.45-1.548.524-2.319C.743 11.37 0 9.76 0 8c0-3.866 3.582-7 8-7s8 3.134 8 7-3.582 7-8 7a9 9 0 0 1-2.347-.306c-.52.263-1.639.742-3.468 1.105" />
        </svg>
        {badge > 0 && (
            <span
                data-test-id="support-widget-badge"
                className="support-fab-badge"
            >
                {badge > 9 ? '9+' : badge}
            </span>
        )}
    </button>
);

interface PanelHeaderProps {
    pageUrl: string;
    onClose: () => void;
}

/** Шапка панели. */
export const WidgetPanelHeader: React.FC<PanelHeaderProps> = ({pageUrl, onClose}) => (
    <div className="support-widget-header">
        <span className="support-widget-title">{t.Support_Widget_Title()}</span>
        <div className="flex items-center gap-2">
            <a href={pageUrl} className="support-widget-link">{t.Support_ViewAll()}</a>
            <button type="button" className="support-widget-close" title={t.Action_Close()} onClick={onClose}>
                &times;
            </button>
        </div>
    </div>
);

interface ImLinkProps {
    imUnread: number;
    imPageUrl: string;
}

/** Ссылка на личные сообщения; без непрочитанных не рисуется. */
export const WidgetImLink: React.FC<ImLinkProps> = ({imUnread, imPageUrl}) => {
    if (imUnread <= 0) return null;

    // IM link — отдельная система (личные сообщения), не переписка
    // по тикету. Раньше подписывался просто "Сообщения" — в панели
    // поддержки, поверх переписки по тикету, это читалось как
    // "перейти к этому диалогу" (нашёл expert-3).
    return (
        <a href={imPageUrl} className="hot-click support-widget-im-link" data-test-id="widget-im-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
            <span className="text-on-surface">{t.Support_Widget_ImBannerLabel()}</span>
            <span className="support-unread-badge ml-auto">{imUnread}</span>
        </a>
    );
};

interface TicketListProps {
    loadingTickets: boolean;
    tickets: SupportTicket[];
    onNew: () => void;
    onOpen: (ticketId: number) => void;
}

/** Список обращений. */
export const WidgetTicketList: React.FC<TicketListProps> = ({loadingTickets, tickets, onNew, onOpen}) => (
    <div className="flex flex-col h-full">
        <div className="p-3 border-b border-subtle">
            <button
                type="button"
                data-test-id="support-new-ticket-btn"
                className="support-new-btn-soft"
                onClick={onNew}
            >
                + {t.Support_NewTicket()}
            </button>
        </div>
        <div className="support-list-scroll">
            {loadingTickets && <div className="support-empty">{t.User_Loading()}</div>}
            {!loadingTickets && tickets.length === 0 && (
                <div className="support-empty">{t.Support_NoTickets()}</div>
            )}
            {!loadingTickets && tickets.map(ticket => (
                <SupportTicketRow
                    key={ticket.id}
                    ticket={ticket}
                    active={false}
                    className="support-widget-ticket-row"
                    onSelect={onOpen}
                />
            ))}
        </div>
    </div>
);

interface ConversationProps {
    loading: boolean;
    messages: SupportMessage[];
    endRef: React.RefObject<HTMLDivElement>;
    selectedTicket: SupportTicket | null;
    replyText: string;
    onReplyTextChange: (v: string) => void;
    onReply: () => void;
    onBack: () => void;
    sending: boolean;
}

/** Переписка по обращению. */
export const WidgetConversation: React.FC<ConversationProps> = ({
    loading,
    messages,
    endRef,
    selectedTicket,
    replyText,
    onReplyTextChange,
    onReply,
    onBack,
    sending,
}) => (
    <div className="flex flex-col h-full">
        {/* Conversation header */}
        <div className="support-widget-conv-header">
            <button
                type="button"
                className="support-widget-back-btn"
                onClick={onBack}
            >
                &larr; {t.Support_BackToList()}
            </button>
            {selectedTicket && (
                <div className="flex items-center gap-2">
                    <span className="support-ticket-title">{selectedTicket.subject}</span>
                    <StatusBadge status={selectedTicket.status} />
                </div>
            )}
        </div>

        {/* Messages */}
        <div className="support-widget-conv-body">
            {loading && <div className="support-empty-line">{t.User_Loading()}</div>}
            {!loading && messages.length === 0 && (
                <div className="support-empty-line">{t.Support_NoMessages()}</div>
            )}
            {!loading && messages.map(msg => <SupportBubble key={msg.id} msg={msg} tight />)}
            <div ref={endRef} />
        </div>

        {/* Reply input */}
        <div className="support-widget-conv-input">
            <div className="flex gap-2">
                <input
                    type="text"
                    data-test-id="support-reply-input"
                    className="flex-1 form-control text-sm"
                    placeholder={t.Support_Reply() + '... (Enter)'}
                    value={replyText}
                    onChange={e => onReplyTextChange(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onReply(); } }}
                />
                <SendButton
                    onClick={onReply}
                    disabled={!replyText.trim()}
                    sending={sending}
                    label={t.Support_Send()}
                    testId="support-reply-btn"
                    size="sm"
                />
            </div>
        </div>
    </div>
);

interface NewTicketFormProps {
    subject: string;
    onSubjectChange: (v: string) => void;
    message: string;
    onMessageChange: (v: string) => void;
    files: PendingFile[];
    onFilesChange: (files: PendingFile[]) => void;
    onScreenshot: (blob: Blob, name: string) => void;
    onSubmit: () => void;
    onBack: () => void;
    sending: boolean;
}

/** Форма нового обращения. */
export const WidgetNewTicketForm: React.FC<NewTicketFormProps> = ({
    subject,
    onSubjectChange,
    message,
    onMessageChange,
    files,
    onFilesChange,
    onScreenshot,
    onSubmit,
    onBack,
    sending,
}) => (
    <div className="support-widget-new-form">
        <button
            type="button"
            className="support-widget-back-btn-self"
            onClick={onBack}
        >
            &larr; {t.Support_BackToList()}
        </button>
        <div>
            <label className="support-form-label">{t.Support_Subject()}</label>
            <input
                type="text"
                data-test-id="support-subject-input"
                className="form-control text-sm"
                value={subject}
                onChange={e => onSubjectChange(e.target.value)}
                placeholder={t.Support_Subject()}
            />
        </div>
        <div>
            <label className="support-form-label">{t.Support_Message()}</label>
            <textarea
                data-test-id="support-message-input"
                className="form-control text-sm"
                rows={4}
                value={message}
                onChange={e => onMessageChange(e.target.value)}
                placeholder={t.Support_Message() + CTRL_ENTER_HINT}
                onKeyDown={useCtrlEnter(onSubmit, sending || !subject.trim() || !message.trim())}
            />
        </div>
        <div className="flex items-center gap-2">
            <AttachmentPicker files={files} onChange={onFilesChange} />
            <ScreenshotButton onScreenshot={onScreenshot} />
        </div>
        <SendButton
            onClick={onSubmit}
            disabled={!subject.trim() || !message.trim()}
            sending={sending}
            label={t.Support_Send()}
            testId="support-send-btn"
        />
    </div>
);
