import * as React from 'react';
import {useState, useEffect, useRef} from 'react';
import {sendPost} from '@common/Api/sendPost';
import {useSending} from '@common/hooks/useSending';
import {useCtrlEnter, CTRL_ENTER_HINT} from '@common/hooks/useCtrlEnter';
import SendButton from '@common/Components/SendButton';
import {I18nForeground as t} from '../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/DateUtils';

interface QuickMessage {
    id: number;
    sender_id: number;
    sender_name?: string;
    body: string;
    created_at: number;
}

interface Props {
    partnerId: number;
    quickChatUrl: string;
    sendUrl: string;
    currentAccountId: number;
    maxMessages?: number;
}

export default function QuickChat({partnerId, quickChatUrl, sendUrl, currentAccountId, maxMessages = 10}: Props) {
    const [messages, setMessages] = useState<QuickMessage[]>([]);
    const [conversationId, setConversationId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');
    const {sending, withSending} = useSending();
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const fetchMessages = React.useCallback(() => {
        return sendPost(quickChatUrl, {partner_id: partnerId, limit: maxMessages})
            .then((resp: any) => {
                setMessages(resp?.messages || []);
                setConversationId(resp?.conversation_id ?? null);
            });
    }, [partnerId, quickChatUrl, maxMessages]);

    useEffect(() => {
        setLoading(true);
        fetchMessages()
            .catch(() => setError(t.User_LoadError()))
            .finally(() => setLoading(false));
    }, [fetchMessages]);

    useEffect(() => {
        const id = window.setInterval(() => {
            if (document.hidden) return; // don't poll from a backgrounded tab
            fetchMessages().catch(() => {});
        }, 20000);
        return () => window.clearInterval(id);
    }, [fetchMessages]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
    }, [messages]);

    const handleSend = () => {
        if (!replyText.trim()) return;
        withSending(async () => {
            try {
                await sendPost(sendUrl, {
                    recipient_id: partnerId,
                    message: replyText.trim(),
                });
                setReplyText('');
                await fetchMessages();
            } catch {
                setError(t.General_Error());
            }
        });
    };

    return (
        <div className="flex flex-col" data-test-id="quick-chat">
            {/* Messages */}
            <div className="overflow-y-auto px-3 py-2" style={{maxHeight: '240px'}} data-test-id="quick-chat-messages">
                {loading ? (
                    <div className="text-center text-muted text-xs py-4">{t.User_Loading()}</div>
                ) : error ? (
                    <div className="text-center text-danger text-xs py-4">{error}</div>
                ) : messages.length === 0 ? (
                    <div className="text-center text-muted text-xs py-4">{t.QuickChat_NoMessages()}</div>
                ) : (
                    messages.map(msg => {
                        const isMine = msg.sender_id === currentAccountId;
                        return (
                            <div
                                key={msg.id}
                                className={`flex mb-2 ${isMine ? 'justify-end' : 'justify-start'}`}
                                data-test-id={`quick-chat-msg-${msg.id}`}
                            >
                                <div className={`max-w-[80%] rounded-lg px-3 py-2 text-xs ${
                                    isMine
                                        ? 'bg-accent-subtle text-on-surface'
                                        : 'bg-surface-hover text-on-surface'
                                }`}>
                                    {!isMine && msg.sender_name && (
                                        <div className="text-[10px] font-medium text-muted mb-0.5">{msg.sender_name}</div>
                                    )}
                                    <div className="whitespace-pre-wrap break-words">{msg.body}</div>
                                    <div className="text-[10px] mt-0.5 text-muted">{formatTs(msg.created_at)}</div>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-3 py-2 border-t border-default">
                <textarea
                    data-test-id="quick-chat-input"
                    className="form-control text-xs mb-1.5"
                    rows={2}
                    aria-label={t.A11y_WriteMessage()}
                    placeholder={t.IM_MessagePlaceholder() + CTRL_ENTER_HINT}
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={useCtrlEnter(handleSend, sending || !replyText.trim())}
                />
                <div className="flex justify-end">
                    <SendButton
                        onClick={handleSend}
                        disabled={!replyText.trim()}
                        sending={sending}
                        label={t.IM_Send()}
                        testId="quick-chat-send"
                    />
                </div>
            </div>
        </div>
    );
}
