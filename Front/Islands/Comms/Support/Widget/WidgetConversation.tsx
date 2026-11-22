import * as React from 'react';

import SendButton from '@common/Components/Controls/SendButton';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {SupportTicket, SupportMessage} from '../parts/supportTypes';
import {StatusBadge} from '../parts/supportRenders';
import {SupportBubble} from '../parts/SupportBubble';

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

const renderMessage = (msg: SupportMessage) => <SupportBubble key={msg.id} msg={msg} tight />;

/** Переписка по обращению. */
export class WidgetConversation extends React.Component<ConversationProps> {
    private readonly changeReply = (event: React.ChangeEvent<HTMLInputElement>) => {
        this.props.onReplyTextChange(event.target.value);
    };

    private readonly replyOnKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.props.onReply();
        }
    };

    private renderReply() {
        const {replyText, onReply, sending} = this.props;
        return (
            <div className="support-widget-conv-input">
                <div className="widget-reply-row">
                    <input
                        type="text"
                        data-test-id="support-reply-input"
                        className="support-conv-control"
                        placeholder={t.Support_Reply() + '... (Enter)'}
                        value={replyText}
                        onChange={this.changeReply}
                        onKeyDown={this.replyOnKey}
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
        );
    }

    public render() {
        const {loading, messages, endRef, selectedTicket, onBack} = this.props;
        return (
            <div className="widget-ticket-list">
                <div className="support-widget-conv-header">
                    <button type="button" className="support-widget-back-btn" onClick={onBack}>
                        &larr; {t.Support_BackToList()}
                    </button>
                    {selectedTicket && (
                        <div className="widget-header-actions">
                            <span className="support-ticket-title">{selectedTicket.subject}</span>
                            <StatusBadge status={selectedTicket.status} />
                        </div>
                    )}
                </div>
                <div className="support-widget-conv-body">
                    {loading && <div className="support-empty-line">{t.User_Loading()}</div>}
                    {!loading && messages.length === 0 && (
                        <div className="support-empty-line">{t.Support_NoMessages()}</div>
                    )}
                    {!loading && messages.map(renderMessage)}
                    <div ref={endRef} />
                </div>
                {this.renderReply()}
            </div>
        );
    }
}
