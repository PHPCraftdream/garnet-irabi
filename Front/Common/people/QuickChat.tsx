import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {sendPost} from '@common/Api/Send/sendPost';
import {CTRL_ENTER_HINT} from '@common/hooks/ui/useCtrlEnter';
import SendButton from '@common/Components/Controls/SendButton';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/Time/DateUtils';
import AttachmentDisplay from '../attachments/AttachmentDisplay';
import type {SupportAttachment} from '../../Islands/Comms/Support/parts/supportTypes';

interface QuickMessage {
    id: number;
    sender_id: number;
    sender_name?: string;
    body: string;
    created_at: number;
    attachments?: SupportAttachment[];
}

interface Props {
    partnerId: number;
    quickChatUrl: string;
    sendUrl: string;
    currentAccountId: number;
    maxMessages?: number;
}

interface QuickChatState {
    messages: QuickMessage[];
    conversationId: number | null;
    loading: boolean;
    error: string | null;
    replyText: string;
    sending: boolean;
}

const QuickChatBubble: React.FC<{msg: QuickMessage; mine: boolean}> = ({msg, mine}) => (
    <div className="quick-chat-message-row" data-own={mine} data-test-id={`quick-chat-msg-${msg.id}`}>
        <div className="quick-chat-message-bubble" data-own={mine}>
            {!mine && msg.sender_name && (
                <div className="quick-chat-message-author">{msg.sender_name}</div>
            )}
            <div className="quick-chat-message-body">{msg.body}</div>
            {msg.attachments && msg.attachments.length > 0 && (
                <div className="quick-chat-message-attachments"><AttachmentDisplay attachments={msg.attachments} /></div>
            )}
            <div className="quick-chat-message-time">{formatTs(msg.created_at)}</div>
        </div>
    </div>
);

export default class QuickChat extends AntiHookComponent<Props> {
    private readonly ui = new Carburetor<QuickChatState>({messages: [], conversationId: null, loading: true, error: null, replyText: '', sending: false});
    private readonly messages = this.connectSelection(this.ui, state => state.messages);
    private readonly messagesEndRef = React.createRef<HTMLDivElement>();
    private fetchInFlight: Promise<void> | null = null;
    private refetchQueued = false;
    private timer?: number;
    private mounted = false;
    private lastMessages?: QuickMessage[];

    componentDidMount(): void {
        super.componentDidMount();
        this.mounted = true;
        void this.load();
        this.timer = window.setInterval(this.poll, 20000);
        this.messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
    }

    componentDidUpdate(previous: Readonly<Props>): void {
        super.componentDidUpdate(previous);
        const {partnerId, quickChatUrl, maxMessages} = this.props;
        if (partnerId !== previous.partnerId || quickChatUrl !== previous.quickChatUrl || maxMessages !== previous.maxMessages) {
            void this.load();
            window.clearInterval(this.timer);
            this.timer = window.setInterval(this.poll, 20000);
        }
        const {messages} = this.ui.getData();
        if (messages !== this.lastMessages) {
            this.lastMessages = messages;
            this.messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
        }
    }

    componentWillUnmount(): void {
        this.mounted = false;
        this.refetchQueued = false;
        window.clearInterval(this.timer);
        super.componentWillUnmount();
    }

    private patch(changes: Partial<QuickChatState>): void {
        this.ui.setData({...this.ui.getData(), ...changes});
    }

    private fetchMessages(): Promise<void> {
        if (this.fetchInFlight) {
            this.refetchQueued = true;
            return this.fetchInFlight;
        }
        const request = this.requestMessages().finally(this.finishFetch);
        this.fetchInFlight = request;
        return request;
    }

    private async requestMessages(): Promise<void> {
        const {quickChatUrl, partnerId, maxMessages = 10} = this.props;
        const response = await sendPost(quickChatUrl, {partner_id: partnerId, limit: maxMessages}) as any;
        if (this.mounted && this.props.partnerId === partnerId && this.props.quickChatUrl === quickChatUrl) {
            this.patch({messages: response?.messages || [], conversationId: response?.conversation_id ?? null});
        }
    }

    private readonly finishFetch = () => {
        this.fetchInFlight = null;
        if (this.mounted && this.refetchQueued) {
            this.refetchQueued = false;
            this.refreshSilently();
        }
    };

    private async load(): Promise<void> {
        this.patch({loading: true});
        try {
            await this.fetchMessages();
        } catch {
            this.patch({error: t.User_LoadError()});
        } finally {
            this.patch({loading: false});
        }
    }

    private refreshSilently(): void {
        void this.fetchMessages().catch(ignorePollError);
    }

    private readonly poll = () => {
        if (!document.hidden) this.refreshSilently();
    };

    private readonly handleSend = async () => {
        const {replyText, sending} = this.ui.getData();
        if (!replyText.trim() || sending) return;
        const {sendUrl, partnerId} = this.props;
        this.patch({sending: true});
        try {
            await sendPost(sendUrl, {recipient_id: partnerId, message: replyText.trim()});
            if (!this.mounted || this.props.partnerId !== partnerId) return;
            this.patch({replyText: ''});
            await this.fetchMessages();
        } catch {
            this.patch({error: t.General_Error()});
        } finally {
            this.patch({sending: false});
        }
    };

    private readonly handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => this.patch({replyText: event.target.value});
    private readonly handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const {replyText, sending} = this.ui.getData();
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !sending && replyText.trim()) {
            event.preventDefault();
            void this.handleSend();
        }
    };
    private readonly renderMessage = (msg: QuickMessage) => (
        <QuickChatBubble key={msg.id} msg={msg} mine={msg.sender_id === this.props.currentAccountId} />
    );

    private renderReply(replyText: string, sending: boolean) {
        return (
            <div className="quick-chat-reply">
                <textarea
                    data-test-id="quick-chat-input"
                    className="quick-chat-input"
                    rows={2}
                    aria-label={t.A11y_WriteMessage()}
                    placeholder={t.IM_MessagePlaceholder() + CTRL_ENTER_HINT}
                    value={replyText}
                    onChange={this.handleChange}
                    onKeyDown={this.handleKeyDown}
                />
                <div className="quick-chat-actions">
                    <SendButton
                        onClick={this.handleSend}
                        disabled={!replyText.trim()}
                        sending={sending}
                        label={t.IM_Send()}
                        testId="quick-chat-send"
                    />
                </div>
            </div>
        );
    }

    render() {
        const {loading, error, replyText, sending} = this.useCarburetor(this.ui);
        const messages = this.messages();
        return (
            <div className="quick-chat" data-test-id="quick-chat">
                <div className="quick-chat-messages" data-test-id="quick-chat-messages">
                    {loading && <div className="quick-chat-status">{t.User_Loading()}</div>}
                    {!loading && error && <div className="quick-chat-status" data-tone="error">{error}</div>}
                    {!loading && !error && messages.length === 0 && (
                        <div className="quick-chat-status">{t.QuickChat_NoMessages()}</div>
                    )}
                    {!loading && !error && messages.map(this.renderMessage)}
                    <div ref={this.messagesEndRef} />
                </div>
                {this.renderReply(replyText, sending)}
            </div>
        );
    }
}

function ignorePollError(): void {}
