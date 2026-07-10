import * as React from 'react';
import {useState, useEffect, useRef} from 'react';
import {sendPost} from '@common/Api/sendPost';
import {sendPostFormData, ApiError} from '@common/Api/sendPostFormData';
import {D} from '@common/Debug/D';
import {useSending} from '@common/hooks/useSending';

import {showToast} from '@common/Components/GlobalToast';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {ImConversation, ImMessage} from './imTypes';
import {PendingFile} from '../../Common/AttachmentPicker';

const getSendErrorMessage = (err: unknown): string => {
    if (err instanceof ApiError) {
        if (err.status === 413) return t.Im_FileTooLarge();
        if (err.status === 0) return t.Im_NetworkError();
        const resp = err.response;
        if (resp && typeof resp === 'object' && 'error' in resp) {
            return String((resp as {error: unknown}).error);
        }
    }
    return (err instanceof Error && err.message) || t.General_Error();
};
import ConversationList from './Components/ConversationList';
import MessageThread from './Components/MessageThread';
import NewMessageForm from './Components/NewMessageForm';
import {IrabiPreviewProvider} from '../../Common/IrabiPreviewProvider';
import {PageHeader} from '@common/Components/PageHeader';
import {MessagesSquare, ChevronLeft} from 'lucide-react';

interface Props {
    conversations: ImConversation[];
    messagesUrl: string;
    sendUrl: string;
    conversationsUrl: string;
    downloadUrl: string;
    searchRecipientsUrl: string;
    currentAccountId: number;
    isModerator?: boolean;
}

const ImPageIslandInner: React.FC<Props> = ({
    conversations: initialConversations,
    messagesUrl,
    sendUrl,
    conversationsUrl,
    downloadUrl: _downloadUrl,
    searchRecipientsUrl,
    currentAccountId,
    isModerator = false,
}) => {
    const [conversations, setConversations] = useState<ImConversation[]>(initialConversations);
    const [selectedId, setSelectedId]       = useState<number | null>(null);
    const [messages, setMessages]           = useState<ImMessage[]>([]);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [showNewForm, setShowNewForm]     = useState(false);
    const [recipientId, setRecipientId]     = useState('');
    const [newMessage, setNewMessage]       = useState('');
    const [replyText, setReplyText]         = useState('');
    const [newFiles, setNewFiles]           = useState<PendingFile[]>([]);
    const [replyFiles, setReplyFiles]       = useState<PendingFile[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const {sending, withSending} = useSending();
    

    const fetchMessages = (conversationId: number) => {
        setLoadingMessages(true);
        D('im.messages', {conversationId});
        sendPost(messagesUrl, {conversation_id: conversationId}).then((r: any) => {
            setMessages(r?.messages ?? []);
            D('im.messages.loaded', {conversationId, count: r?.messages?.length ?? 0});
            setConversations(prev => prev.map(c => c.id === conversationId ? {...c, unread_count: 0} : c));
            setLoadingMessages(false);
        }).catch((err) => {
            D('im.error', {action: 'fetchMessages', conversationId, error: err});
            setLoadingMessages(false);
            showToast(t.User_LoadError(), 'danger');
        });
    };

    const refreshConversations = () => {
        D('im.refreshConversations');
        sendPost(conversationsUrl, {}).then((r: any) => {
            if (r?.conversations) {
                setConversations(r.conversations);
                D('im.conversations.loaded', {count: r.conversations.length});
            }
        }).catch((err) => {
            D('im.error', {action: 'refreshConversations', error: err});
            showToast(t.User_LoadError(), 'danger');
        });
    };

    // On mount: check hash #to={id} or query ?to={id} — auto-open new message to that recipient
    useEffect(() => {
        const hash = window.location.hash; // #to=16
        const search = window.location.search; // ?to=16
        let toId = '';
        if (hash.includes('to=')) {
            toId = hash.split('to=')[1]?.split('&')[0] || '';
        } else if (search.includes('to=')) {
            toId = new URLSearchParams(search).get('to') || '';
        }
        if (toId) {
            // Check if we already have a conversation with this person
            const existing = conversations.find(c => c.partner_id === parseInt(toId, 10));
            if (existing) {
                selectConversation(existing.id);
            } else {
                setShowNewForm(true);
                setRecipientId(toId);
            }
            // Clean up URL hash
            if (window.history.replaceState) {
                window.history.replaceState(null, '', window.location.pathname);
            }
        }
    }, []);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({behavior: 'smooth'});
        }
    }, [messages]);

    // Auto-refresh: poll messages every 15 seconds when a conversation is selected
    useEffect(() => {
        if (!selectedId) return;
        const interval = setInterval(() => { if (!document.hidden) fetchMessages(selectedId); }, 15000);
        return () => clearInterval(interval);
    }, [selectedId]);

    const selectConversation = (conversationId: number) => {
        D('im.click', {action: 'selectConversation', conversationId});
        setSelectedId(conversationId);
        setShowNewForm(false);
        setReplyText('');
        setReplyFiles([]);
        fetchMessages(conversationId);
    };

    const handleSendNew = () => {
        const rid = parseInt(recipientId, 10);
        if (!rid || !newMessage.trim()) return;
        withSending(async () => {
            try {
                D('im.sendNew', {recipientId: rid, hasAttachments: newFiles.length > 0});
                const fd = new FormData();
                fd.append('recipient_id', String(rid));
                fd.append('message', newMessage.trim());
                for (const f of newFiles) {
                    fd.append('attachments[]', f.file, f.name);
                }
                const r = await sendPostFormData<FormData, {success?: boolean; conversation_id?: number; error?: string}>(sendUrl, fd);
                if (!r?.success) {
                    D('im.error', {action: 'sendNew', error: r?.error});
                    showToast(r?.error || t.General_Error(), 'danger');
                    return;
                }
                D('im.sent', {conversationId: r.conversation_id});
                setShowNewForm(false);
                setRecipientId('');
                setNewMessage('');
                setNewFiles([]);
                refreshConversations();
                if (r.conversation_id) {
                    setSelectedId(r.conversation_id);
                    fetchMessages(r.conversation_id);
                }
            } catch (err: unknown) {
                const msg = getSendErrorMessage(err);
                D('im.error', {action: 'sendNew', error: msg});
                showToast(msg, 'danger');
            }
        });
    };

    const handleReply = () => {
        if (!replyText.trim() || !selectedId) return;
        const conv = conversations.find(c => c.id === selectedId);
        if (!conv) return;
        withSending(async () => {
            try {
                D('im.reply', {conversationId: selectedId, hasAttachments: replyFiles.length > 0});
                const fd = new FormData();
                fd.append('recipient_id', String(conv.partner_id));
                fd.append('message', replyText.trim());
                for (const f of replyFiles) {
                    fd.append('attachments[]', f.file, f.name);
                }
                const r = await sendPostFormData<FormData, {success?: boolean; error?: string}>(sendUrl, fd);
                if (!r?.success) {
                    D('im.error', {action: 'reply', error: r?.error});
                    showToast(r?.error || t.General_Error(), 'danger');
                    return;
                }
                setReplyText('');
                setReplyFiles([]);
                fetchMessages(selectedId!);
                refreshConversations();
            } catch (err: unknown) {
                const msg = getSendErrorMessage(err);
                D('im.error', {action: 'reply', error: msg});
                showToast(msg, 'danger');
            }
        });
    };

    const handleNewMessage = () => {
        setShowNewForm(true);
        setSelectedId(null);
        setRecipientId('');
        setNewMessage('');
        setNewFiles([]);
    };

    const selectedConversation = conversations.find(c => c.id === selectedId);

    return (
        <div className="page-narrow">
            <PageHeader title={t.IM_Title()} icon={<MessagesSquare size={22} aria-hidden="true" />} />

            <div className={`support-layout ${(selectedConversation || showNewForm) ? 'support-layout-detail' : ''}`}>
                <ConversationList
                    conversations={conversations}
                    selectedId={selectedId}
                    onSelectConversation={selectConversation}
                    onNewMessage={handleNewMessage}
                />

                <div className="support-thread-panel">
                    {(selectedConversation || showNewForm) && (
                        <button
                            type="button"
                            className="support-back-btn"
                            onClick={() => { setSelectedId(null); setShowNewForm(false); }}
                        >
                            <ChevronLeft size={16} aria-hidden="true" />
                            {t.Support_BackToList()}
                        </button>
                    )}
                    {showNewForm ? (
                        <NewMessageForm
                            searchRecipientsUrl={searchRecipientsUrl}
                            recipientId={recipientId}
                            onRecipientIdChange={setRecipientId}
                            newMessage={newMessage}
                            onNewMessageChange={setNewMessage}
                            newFiles={newFiles}
                            onNewFilesChange={setNewFiles}
                            sending={sending}
                            onSend={handleSendNew}
                        />
                    ) : selectedConversation ? (
                        <MessageThread
                            conversation={selectedConversation}
                            messages={messages}
                            loadingMessages={loadingMessages}
                            currentAccountId={currentAccountId}
                            isModerator={isModerator}
                            replyText={replyText}
                            onReplyTextChange={setReplyText}
                            replyFiles={replyFiles}
                            onReplyFilesChange={setReplyFiles}
                            sending={sending}
                            onReply={handleReply}
                            messagesEndRef={messagesEndRef}
                        />
                    ) : (
                        <div className="support-empty-flex">
                            {conversations.length === 0 ? t.IM_NoConversations() : t.IM_NoMessages()}
                        </div>
                    )}
                </div>
            </div>

            
        </div>
    );
};

export const ImPageIsland: React.FC<Props> = (props) => (
    <IrabiPreviewProvider>
        <ImPageIslandInner {...props} />
    </IrabiPreviewProvider>
);
