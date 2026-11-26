import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {CTRL_ENTER_HINT} from '@common/hooks/ui/useCtrlEnter';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';

import {ImConversation, ImMessage} from '@/Islands/Comms/Im/imTypes';
import MessageBubble from './MessageBubble';
import AttachmentPicker, {PendingFile} from '@/Common/attachments/AttachmentPicker';
import SendButton from '@common/Components/Controls/SendButton';
import {EntityLink} from '@/Common/people/links/EntityLink';
import {userLinks} from '@/Common/people/links/userLinks';
import {UserAvatar} from '@/Common/media/UserAvatar';

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

export default class MessageThread extends AntiHookComponent<Props> {
    /** Обновляет текст ответа. */
    private readonly changeReply = (event: React.ChangeEvent<HTMLTextAreaElement>) =>
        this.props.onReplyTextChange(event.target.value);

    /** Отправляет форму по клавиатурному сочетанию. */
    private readonly submitOnShortcut = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const {replyText, sending, onReply} = this.props;
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !sending && replyText.trim()) {
            event.preventDefault();
            onReply();
        }
    };

    /** Рисует заголовок переписки. */
    private renderHeading() {
        const {conversation, isModerator} = this.props;
        return (
            <div className="im-thread-heading" data-test-id="im-thread-header">
                <UserAvatar
                    name={conversation.partner_name || t.User_Anonymous()}
                    avatar={conversation.partner_avatar}
                    disabled={!!conversation.partner_is_disabled}
                    testId="im-thread-avatar"
                />
                <h3 className="im-thread-title">
                    <EntityLink
                        name={conversation.partner_name || t.User_Anonymous()}
                        {...userLinks(conversation.partner_id, !!conversation.partner_has_expert_profile)}
                        isModerator={isModerator}
                    />
                </h3>
            </div>
        );
    }

    /** Рисует сообщения переписки. */
    private renderMessages() {
        const {messages, currentAccountId} = this.props;
        const rows: React.ReactNode[] = [];
        for (const message of messages) {
            rows.push(
                <MessageBubble key={message.id} message={message}
                    isMine={message.sender_id === currentAccountId} />,
            );
        }
        return rows;
    }

    /** Рисует временную шкалу сообщений. */
    private renderTimeline() {
        const {loadingMessages, messages, messagesEndRef} = this.props;
        return (
            <div className="im-thread-body" data-test-id="im-messages-list">
                {loadingMessages ? (
                    <div className="support-empty-line">{t.User_Loading()}</div>
                ) : messages.length === 0 ? (
                    <div className="support-empty-line">{t.IM_NoMessages()}</div>
                ) : (
                    this.renderMessages()
                )}
                <div ref={messagesEndRef} />
            </div>
        );
    }

    /** Рисует поле ответа. */
    private renderReply() {
        const {replyText, replyFiles, onReplyFilesChange, sending, onReply} = this.props;
        return (
            <div className="im-thread-reply" data-test-id="im-reply-form">
                <textarea
                    data-test-id="im-reply-input"
                    className="im-thread-input"
                    rows={2}
                    aria-label={t.A11y_WriteMessage()}
                    placeholder={t.IM_MessagePlaceholder() + CTRL_ENTER_HINT}
                    value={replyText}
                    onChange={this.changeReply}
                    onKeyDown={this.submitOnShortcut}
                />
                <div className="im-thread-actions">
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
        );
    }

    /** Рисует содержимое компонента. */
    render() {
        return <>{this.renderHeading()}{this.renderTimeline()}{this.renderReply()}</>;
    }
}
