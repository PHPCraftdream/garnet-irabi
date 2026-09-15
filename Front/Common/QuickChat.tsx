import * as React from 'react';
import {useState, useEffect, useRef} from 'react';
import {sendPost} from '@common/Api/sendPost';
import {useSending} from '@common/hooks/useSending';
import {useCtrlEnter, CTRL_ENTER_HINT} from '@common/hooks/useCtrlEnter';
import SendButton from '@common/Components/SendButton';
import {I18nForeground as t} from '../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/DateUtils';
import AttachmentDisplay from './AttachmentDisplay';
import type {SupportAttachment} from '../Islands/Support/supportTypes';

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

/** Сообщение в коротком просмотре переписки. */
const QuickChatBubble: React.FC<{msg: QuickMessage; mine: boolean}> = ({msg, mine}) => (
    <div className={`flex mb-2 ${mine ? 'justify-end' : 'justify-start'}`} data-test-id={`quick-chat-msg-${msg.id}`}>
        <div className={`max-w-[80%] rounded-lg px-3 py-2 text-xs ${mine ? 'bg-accent-subtle' : 'bg-surface-hover'} text-on-surface`}>
            {!mine && msg.sender_name && (
                <div className="text-[10px] font-medium text-muted mb-0.5">{msg.sender_name}</div>
            )}
            <div className="whitespace-pre-wrap break-words">{msg.body}</div>
            {/* Сервер отдавал вложения всегда; этот вид их терял, и сообщение
                с файлом читалось здесь как сообщение без файла. */}
            {msg.attachments && msg.attachments.length > 0 && (
                <div className="mt-1"><AttachmentDisplay attachments={msg.attachments} /></div>
            )}
            <div className="text-[10px] mt-0.5 text-muted">{formatTs(msg.created_at)}</div>
        </div>
    </div>
);

export default function QuickChat({partnerId, quickChatUrl, sendUrl, currentAccountId, maxMessages = 10}: Props) {
    const [messages, setMessages] = useState<QuickMessage[]>([]);
    const [_conversationId, setConversationId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');
    const {sending, withSending} = useSending();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    // The mount effect, the 20s poll interval and a just-sent message can all
    // call fetchMessages() within the same tick — without a guard each call
    // fired its own POST, and a losing one sometimes came back 403 (D-203/D-185).
    // A call that lands while one is already in flight doesn't fire a second
    // request; it queues a single coalesced re-fetch for right after the
    // current one resolves, so a send during an in-flight poll still shows up.
    const fetchInFlight = useRef<Promise<void> | null>(null);
    const refetchQueued = useRef(false);

    const fetchMessages = React.useCallback((): Promise<void> => {
        if (fetchInFlight.current) {
            refetchQueued.current = true;
            return fetchInFlight.current;
        }
        const req = sendPost(quickChatUrl, {partner_id: partnerId, limit: maxMessages})
            .then((resp: any) => {
                setMessages(resp?.messages || []);
                setConversationId(resp?.conversation_id ?? null);
            })
            .finally(() => {
                fetchInFlight.current = null;
                if (refetchQueued.current) {
                    refetchQueued.current = false;
                    fetchMessages();
                }
            });
        fetchInFlight.current = req;
        return req;
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
                {loading && <div className="text-center text-muted text-xs py-4">{t.User_Loading()}</div>}
                {!loading && error && <div className="text-center text-danger text-xs py-4">{error}</div>}
                {!loading && !error && messages.length === 0 && (
                    <div className="text-center text-muted text-xs py-4">{t.QuickChat_NoMessages()}</div>
                )}
                {!loading && !error && messages.map(msg => (
                    <QuickChatBubble key={msg.id} msg={msg} mine={msg.sender_id === currentAccountId} />
                ))}
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
