import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {useState} from 'react';
import {fetchMessages, refreshConversations} from './ImPageRequests';
import {sendPostFormData, ApiError} from '@common/Api/Send/sendPostFormData';
import {D} from '@common/Support/Debug/D';
import {useSending} from '@common/hooks/data/useSending';

import {showToast} from '@common/Components/Feedback/GlobalToast';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import type {ImConversation} from './imTypes';
import {ImPageState} from './ImPageState';
import {PendingFile} from '../../../Common/attachments/AttachmentPicker';
import {reportAttachmentErrors} from '../../../Common/attachments/attachmentHelpers';

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
import {IrabiPreviewProvider} from '../../../Common/people/IrabiPreviewProvider';
import {PageHeader} from '@common/Components/Layout/PageHeader';
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

type Snapshot = ReturnType<ImPageState['snapshot']>;

interface ViewProps extends Props, ReturnType<typeof useSending> {
    ui: ImPageState;
    snapshot: Snapshot;
    newFiles: PendingFile[];
    replyFiles: PendingFile[];
    setNewFiles: (files: PendingFile[]) => void;
    setReplyFiles: (files: PendingFile[]) => void;
}

const PAGE_ICON = <MessagesSquare size={22} aria-hidden="true" />;

function findConversation(conversations: ImConversation[], selectedId: number | null): ImConversation | undefined {
    return conversations.find(conversation => conversation.id === selectedId);
}

class ImPageView extends AntiHookComponent<ViewProps> {
    private readonly messagesEndRef = React.createRef<HTMLDivElement>();
    private timer?: ReturnType<typeof setInterval>;

    componentDidMount(): void {
        super.componentDidMount();
        const {hash, search} = window.location;
        const id = hash.includes('to=') ? hash.split('to=')[1]?.split('&')[0] || '' : new URLSearchParams(search).get('to') || '';
        if (!id) return;
        this.handleRecipientPicked(id);
        if (!this.props.ui.getData().selectedId) this.props.ui.setShowNewForm(true);
        window.history.replaceState?.(null, '', window.location.pathname);
    }

    componentDidUpdate(previous: Readonly<ViewProps>): void {
        super.componentDidUpdate(previous);
        const {snapshot, messagesUrl} = this.props;
        if (previous.snapshot.messages !== snapshot.messages) this.messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
        if (previous.snapshot.selectedId !== snapshot.selectedId || previous.messagesUrl !== messagesUrl) {
            clearInterval(this.timer);
            if (snapshot.selectedId) this.timer = setInterval(this.poll, 15000);
        }
    }

    componentWillUnmount(): void {
        clearInterval(this.timer);
        super.componentWillUnmount();
    }

    private readonly poll = () => {
        const {ui, messagesUrl, snapshot: {selectedId}} = this.props;
        if (selectedId && !document.hidden) void fetchMessages(ui, messagesUrl, selectedId);
    };

    private readonly back = () => {
        this.props.ui.setSelectedId(null);
        this.props.ui.setShowNewForm(false);
    };

    private readonly selectConversation = (conversationId: number) => {
        const {ui, messagesUrl, setReplyFiles} = this.props;
        const {setSelectedId, setShowNewForm, setReplyText} = ui;
        D('im.click', {action: 'selectConversation', conversationId});
        setSelectedId(conversationId);
        setShowNewForm(false);
        setReplyText('');
        setReplyFiles([]);
        void fetchMessages(ui, messagesUrl, conversationId);
    };

    private readonly handleSendNew = () => {
        const {ui, sendUrl, messagesUrl, conversationsUrl, newFiles, setNewFiles, withSending} = this.props;
        const {recipientId, newMessage} = ui.getData();
        const {setShowNewForm, setRecipientId, setNewMessage, setSelectedId} = ui;
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
                void refreshConversations(ui, conversationsUrl);
                if (r.conversation_id) {
                    setSelectedId(r.conversation_id);
                    void fetchMessages(ui, messagesUrl, r.conversation_id);
                }
                reportAttachmentErrors(r);
            } catch (err: unknown) {
                const msg = getSendErrorMessage(err);
                D('im.error', {action: 'sendNew', error: msg});
                showToast(msg, 'danger');
            }
        });
    };

    private readonly handleReply = () => {
        const {ui, sendUrl, messagesUrl, conversationsUrl, replyFiles, setReplyFiles, withSending} = this.props;
        const {replyText, selectedId, conversations} = ui.getData();
        const {setReplyText} = ui;
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
                void fetchMessages(ui, messagesUrl, selectedId!);
                void refreshConversations(ui, conversationsUrl);
                reportAttachmentErrors(r);
            } catch (err: unknown) {
                const msg = getSendErrorMessage(err);
                D('im.error', {action: 'reply', error: msg});
                showToast(msg, 'danger');
            }
        });
    };

    private readonly handleNewMessage = () => {
        const {ui, setNewFiles} = this.props;
        const {setShowNewForm, setSelectedId, setRecipientId, setNewMessage} = ui;
        setShowNewForm(true);
        setSelectedId(null);
        setRecipientId('');
        setNewMessage('');
        setNewFiles([]);
    };

    /**
     * D-208: the recipient list in "+ Новый диалог" doesn't distinguish
     * strangers from people already in `conversations` — it can't, it's the
     * same list either way. Picking someone with an existing thread used to
     * just fill in the new-message form, blank, as if nothing had been said
     * before; the person's real history was one click away (the conversation
     * list) and this form gave no hint it existed. The `#to=` deep-link path
     * already checked for this (lines above); the picker didn't.
     */
    private readonly handleRecipientPicked = (id: string) => {
        const {ui} = this.props;
        const {conversations} = ui.getData();
        const {setRecipientId} = ui;
        const partnerId = parseInt(id, 10);
        const existing = conversations.find(c => c.partner_id === partnerId);
        if (existing) {
            this.selectConversation(existing.id);
            return;
        }
        setRecipientId(id);
    };

    private renderNew() {
        const {ui, snapshot: {recipientId, newMessage}, newFiles, setNewFiles, sending, searchRecipientsUrl} = this.props;
        const {setNewMessage} = ui;
        return (
            <NewMessageForm
                searchRecipientsUrl={searchRecipientsUrl}
                recipientId={recipientId}
                onRecipientIdChange={this.handleRecipientPicked}
                newMessage={newMessage}
                onNewMessageChange={setNewMessage}
                newFiles={newFiles}
                onNewFilesChange={setNewFiles}
                sending={sending}
                onSend={this.handleSendNew}
            />
        );
    }

    private renderThread(selectedConversation: ImConversation) {
        const {ui, snapshot: {messages, loadingMessages, replyText}, replyFiles, setReplyFiles, sending, currentAccountId, isModerator = false} = this.props;
        const {setReplyText} = ui;
        return (
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
                onReply={this.handleReply}
                messagesEndRef={this.messagesEndRef}
            />
        );
    }

    private renderPanel(selectedConversation: ImConversation | undefined) {
        const {conversations, showNewForm} = this.props.snapshot;
        return (
            <div className="comms-page-thread">
                {(selectedConversation || showNewForm) && (
                    <button
                        type="button"
                        className="comms-page-back"
                        onClick={this.back}
                    >
                        <ChevronLeft size={16} aria-hidden="true" />
                        {t.Support_BackToList()}
                    </button>
                )}
                {showNewForm ? this.renderNew() : selectedConversation ? this.renderThread(selectedConversation) : (
                    <div className="comms-page-empty">
                        {conversations.length === 0 ? t.IM_NoConversations() : t.IM_NoMessages()}
                    </div>
                )}
            </div>
        );
    }

    render() {
        const {conversations, selectedId, showNewForm} = this.props.snapshot;
        const selectedConversation = findConversation(conversations, selectedId);
        return (
            <div className="comms-page">
                <PageHeader title={t.IM_Title()} icon={PAGE_ICON} />

                <div className="comms-page-layout" data-detail={Boolean(selectedConversation || showNewForm)}>
                    <ConversationList
                        conversations={conversations}
                        selectedId={selectedId}
                        onSelectConversation={this.selectConversation}
                        onNewMessage={this.handleNewMessage}
                    />

                    {this.renderPanel(selectedConversation)}
                </div>


            </div>
        );
    }
}

function ImPageIslandInner(props: Props) {
    const [ui] = useState(() => new ImPageState(props.conversations));
    const snapshot = React.useSyncExternalStore(ui.subscribeSnapshot, ui.snapshot, ui.snapshot);
    const [newFiles, setNewFiles] = useState<PendingFile[]>([]);
    const [replyFiles, setReplyFiles] = useState<PendingFile[]>([]);
    const sending = useSending();
    return <ImPageView {...props} {...sending} ui={ui} snapshot={snapshot}
        newFiles={newFiles} setNewFiles={setNewFiles} replyFiles={replyFiles} setReplyFiles={setReplyFiles} />;
}

export const ImPageIsland: React.FC<Props> = (props) => (
    <IrabiPreviewProvider>
        <ImPageIslandInner {...props} />
    </IrabiPreviewProvider>
);
