import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';

import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {SupportTicket, SupportMessage} from '@/Islands/Comms/Support/parts/supportTypes';
import {StatusBadge} from '@/Islands/Comms/Support/parts/supportRenders';
import {SupportMessageList} from '@/Islands/Comms/Support/parts/render/SupportMessageList';
import AttachmentPicker, {PendingFile} from '@/Common/attachments/AttachmentPicker';
import SendButton from '@common/Components/Controls/SendButton';
import {CTRL_ENTER_HINT} from '@common/hooks/ui/useCtrlEnter';
import {formatTs} from '@common/Utils/Time/DateUtils/format/formatTs';

interface ConversationProps {
    selectedTicket: SupportTicket | null;
    messages: SupportMessage[];
    loading: boolean;
    endRef: React.RefObject<HTMLDivElement>;
    replyText: string;
    onReplyTextChange: (v: string) => void;
    replyFiles: PendingFile[];
    onReplyFilesChange: (files: PendingFile[]) => void;
    onReply: () => void;
    sending: boolean;
}

/** Рисует заголовок обращения и его статус. */
function renderHeader(selectedTicket: SupportTicket) {
    return (
        <div className="support-conv-header">
            <div className="support-conv-header-row">
                <h3 className="support-conv-title">{selectedTicket.subject}</h3>
                <StatusBadge status={selectedTicket.status} />
            </div>
            <div className="support-conv-meta">
                {t.Support_Created()}: {formatTs(selectedTicket.created_at)}{' '}
                &middot; {t.Support_Updated()}: {formatTs(selectedTicket.updated_at)}
            </div>
        </div>
    );
}

/** Переписка по обращению. */
export class PageConversation extends AntiHookComponent<ConversationProps> {
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

    /** Рисует поле ответа. */
    private renderReply() {
        const {replyText, replyFiles, onReplyFilesChange, onReply, sending} = this.props;
        return (
            <div className="im-thread-reply">
                <textarea
                    data-test-id="support-reply-input"
                    className="im-thread-input"
                    rows={2}
                    aria-label={t.Support_Reply()}
                    placeholder={t.Support_Reply() + '...' + CTRL_ENTER_HINT}
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
                        label={t.Support_Send()}
                        testId="support-reply-btn"
                    />
                </div>
            </div>
        );
    }

    /** Рисует содержимое компонента. */
    render() {
        const {selectedTicket, messages, loading, endRef} = this.props;
        if (!selectedTicket) return null;
        return (
            <>
                {renderHeader(selectedTicket)}
                <SupportMessageList messages={messages} loading={loading} emptyText={t.Support_NoMessages()}
                    loadingText={t.User_Loading()} endRef={endRef} />
                {this.renderReply()}
            </>
        );
    }
}
