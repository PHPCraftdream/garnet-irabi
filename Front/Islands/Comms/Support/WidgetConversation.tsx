import * as React from 'react';

import SendButton from '@common/Components/Controls/SendButton';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {SupportTicket, SupportMessage} from './parts/supportTypes';
import {StatusBadge} from './parts/supportRenders';
import {SupportBubble} from './parts/SupportBubble';

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
