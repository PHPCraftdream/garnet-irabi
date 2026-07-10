import * as React from 'react';
import {useCtrlEnter, CTRL_ENTER_HINT} from '@common/hooks/useCtrlEnter';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';

import {ImConversation, ImMessage} from '../imTypes';
import MessageBubble from './MessageBubble';
import AttachmentPicker, {PendingFile} from '../../../Common/AttachmentPicker';
import SendButton from '@common/Components/SendButton';
import {EntityLink, userLinks} from '../../../Common/EntityLinks';
import {UserAvatar} from '../../../Common/UserAvatar';

interface Props {
    conversation: ImConversation;
    messages: ImMessage[];
    loadingMessages: boolean;
    currentAccountId: number;
    isModerator: boolean;
    replyText: string;
    onReplyTextChange: (text: string) => void;
    replyFiles: PendingFile[];
    onReplyFilesChange: (files: PendingFile[]) => void;
    sending: boolean;
    onReply: () => void;
    messagesEndRef: React.RefObject<HTMLDivElement>;
}

export default function MessageThread({
    conversation, messages, loadingMessages, currentAccountId, isModerator,
    replyText, onReplyTextChange, replyFiles, onReplyFilesChange, sending, onReply, messagesEndRef,
}: Props) {
    return (
        <>
            {/* Header with profile links */}
            <div className="support-conv-header flex items-center gap-2" data-test-id="im-thread-header">
                <UserAvatar
                    name={conversation.partner_name || t.User_Anonymous()}
                    avatar={conversation.partner_avatar}
                    disabled={!!conversation.partner_is_disabled}
                    testId="im-thread-avatar"
                />
                <h3 className="text-base font-semibold text-on-surface">
                    <EntityLink
                        name={conversation.partner_name || t.User_Anonymous()}
                        {...userLinks(conversation.partner_id, !!conversation.partner_has_expert_profile)}
                        isModerator={isModerator}
                    />
                </h3>
            </div>

            {/* Messages timeline */}
            <div className="support-thread-body" data-test-id="im-messages-list">
                {loadingMessages ? (
                    <div className="support-empty-line">{t.User_Loading()}</div>
                ) : messages.length === 0 ? (
                    <div className="support-empty-line">{t.IM_NoMessages()}</div>
                ) : (
                    messages.map(msg => (
                        <MessageBubble
                            key={msg.id}
                            message={msg}
                            isMine={msg.sender_id === currentAccountId}
                        />
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Reply input */}
            <div className="support-thread-input" data-test-id="im-reply-form">
                <textarea
                    data-test-id="im-reply-input"
                    className="form-control text-sm mb-2"
                    rows={2}
                    aria-label={t.A11y_WriteMessage()}
                    placeholder={t.IM_MessagePlaceholder() + CTRL_ENTER_HINT}
                    value={replyText}
                    onChange={e => onReplyTextChange(e.target.value)}
                    onKeyDown={useCtrlEnter(onReply, sending || !replyText.trim())}
                />
                <div className="support-thread-actions">
                    <AttachmentPicker files={replyFiles} onChange={onReplyFilesChange} />
                    <SendButton
                        onClick={onReply}
                        disabled={!replyText.trim()}
                        sending={sending}
                        label={t.IM_Send()}
                        testId="im-reply-btn"
                    />
                </div>
            </div>
        </>
    );
}
