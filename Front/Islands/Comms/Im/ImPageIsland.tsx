import * as React from 'react';
import {AntiHookComponent, type TReadonly} from '@react-carburetor/core';
import {fetchMessages} from './fetchMessages';
import {refreshConversations} from './ImPageRequests';
import {sendPostFormData, ApiError} from '@common/Api/Send/sendPostFormData';
import {D} from '@common/Support/Debug/D';
import {useSending} from '@common/hooks/data/useSending';

import {showToast} from '@common/Components/Feedback/GlobalToast';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import type {ImMessage, ImConversation, ImAttachment} from './imTypes';
import {ImPageState} from './ImPageState';
import type {ImPageSnapshot} from './ImPageState';
import {PendingFile} from '@/Common/attachments/AttachmentPicker';
import {reportAttachmentErrors} from '@/Common/attachments/helpers/reportAttachmentErrors';

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
import {IrabiPreviewProvider} from '@/Common/people/preview/IrabiPreviewProvider';
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

type IslandProps = Props & ReturnType<typeof useSending>;

const PAGE_ICON = <MessagesSquare size={22} aria-hidden="true" />;

// Подписка = пути, прочитанные в этом render: поля строк читаем здесь, иначе их
// изменение не разбудит остров (см. RULES.md, «Подписки useCarburetor»).
/** Преобразует данные вложения в типизированное вложение. */
function readAttachment(row: TReadonly<ImAttachment>): ImAttachment {
    return {
        id: row.id,
        message_id: row.message_id,
        original_name: row.original_name,
        stored_name: row.stored_name,
        mime_type: row.mime_type,
        size: row.size,
        download_url: row.download_url,
    };
}

/** Преобразует данные сервера в сообщение. */
function readMessage(row: TReadonly<ImMessage>): ImMessage {
    return {
        id: row.id,
        conversation_id: row.conversation_id,
        sender_id: row.sender_id,
        sender_name: row.sender_name,
        body: row.body,
        created_at: row.created_at,
        attachments: row.attachments?.map(readAttachment),
    };
}

/** Преобразует данные сервера в переписку. */
function readConversation(row: TReadonly<ImConversation>): ImConversation {
    return {
        id: row.id,
        partner_id: row.partner_id,
        partner_name: row.partner_name,
        partner_avatar: row.partner_avatar,
        partner_has_expert_profile: row.partner_has_expert_profile,
        partner_is_disabled: row.partner_is_disabled,
        last_message_snippet: row.last_message_snippet,
        last_message_at: row.last_message_at,
        last_message_is_mine: row.last_message_is_mine,
        unread_count: row.unread_count,
        attachments_count: row.attachments_count,
    };
}

/** Находит переписку по идентификатору. */
function findConversation(conversations: readonly ImConversation[],
    selectedId: number | null): ImConversation | undefined {
    return conversations.find(conversation => conversation.id === selectedId);
}

class ImPageView extends AntiHookComponent<IslandProps> {
    private readonly ui = new ImPageState(this.props.conversations);
    private readonly messagesEndRef = React.createRef<HTMLDivElement>();
    private timer?: ReturnType<typeof setInterval>;
    private previous?: ImPageSnapshot;
    private newFiles: PendingFile[] = [];
    private replyFiles: PendingFile[] = [];

    /** Обновляет вложения нового сообщения. */
    private readonly setNewFiles = (files: PendingFile[]) => {
        this.newFiles = files;
        this.forceUpdate();
    };

    /** Обновляет вложения ответа. */
    private readonly setReplyFiles = (files: PendingFile[]) => {
        this.replyFiles = files;
        this.forceUpdate();
    };

    /** Запускает действия после монтирования компонента. */
    componentDidMount(): void {
        super.componentDidMount();
        this.previous = this.ui.getData();
        const {hash, search} = window.location;
        const id = hash.includes('to=') ? hash.split('to=')[1]?.split('&')[0] || '' : new URLSearchParams(search).get('to') || '';
        if (!id) return;
        this.handleRecipientPicked(id);
        if (!this.ui.getData().selectedId) this.ui.setShowNewForm(true);
        window.history.replaceState?.(null, '', window.location.pathname);
    }

    /** Обновляет данные после изменения свойств. */
    componentDidUpdate(previousProps: Readonly<IslandProps>): void {
        super.componentDidUpdate(previousProps);
        const state = this.ui.getData();
        const previous = this.previous;
        this.previous = state;
        if (previous && previous.messages !== state.messages)
            this.messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
        if (!previous || previous.selectedId !== state.selectedId
            || previousProps.messagesUrl !== this.props.messagesUrl) {
            clearInterval(this.timer);
            if (state.selectedId) this.timer = setInterval(this.poll, 15000);
        }
    }

    /** Останавливает ресурсы перед размонтированием. */
    componentWillUnmount(): void {
        clearInterval(this.timer);
        super.componentWillUnmount();
    }

    /** Запускает периодическое обновление. */
    private readonly poll = () => {
        const {messagesUrl} = this.props;
        const {selectedId} = this.ui.getData();
        if (selectedId && !document.hidden) void fetchMessages(this.ui, messagesUrl, selectedId);
    };

    /** Возвращает к списку обращений. */
    private readonly back = () => {
        this.ui.setSelectedId(null);
        this.ui.setShowNewForm(false);
    };

    /** Выбирает переписку. */
    private readonly selectConversation = (conversationId: number) => {
        const {ui} = this;
        const {messagesUrl} = this.props;
        const {setSelectedId, setShowNewForm, setReplyText} = ui;
        D('im.click', {action: 'selectConversation', conversationId});
        setSelectedId(conversationId);
        setShowNewForm(false);
        setReplyText('');
        this.setReplyFiles([]);
        void fetchMessages(ui, messagesUrl, conversationId);
    };

    /** Отправляет новое сообщение. */
    private readonly handleSendNew = () => {
        const {ui} = this;
        const {sendUrl, messagesUrl, conversationsUrl, withSending} = this.props;
        const {recipientId, newMessage} = ui.getData();
        const {setShowNewForm, setRecipientId, setNewMessage, setSelectedId} = ui;
        const newFiles = this.newFiles;
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
                const r = await sendPostFormData<FormData,
                    {success?: boolean; conversation_id?: number; error?: string}>(sendUrl, fd);
                if (!r?.success) {
                    D('im.error', {action: 'sendNew', error: r?.error});
                    showToast(r?.error || t.General_Error(), 'danger');
                    return;
                }
                D('im.sent', {conversationId: r.conversation_id});
                setShowNewForm(false);
                setRecipientId('');
                setNewMessage('');
                this.setNewFiles([]);
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

    /** Обрабатывает отправку ответа. */
    private readonly handleReply = () => {
        const {ui} = this;
        const {sendUrl, messagesUrl, conversationsUrl, withSending} = this.props;
        const {replyText, selectedId, conversations} = ui.getData();
        const {setReplyText} = ui;
        const replyFiles = this.replyFiles;
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
                this.setReplyFiles([]);
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

    /** Обрабатывает создание переписки. */
    private readonly handleNewMessage = () => {
        const {ui} = this;
        const {setShowNewForm, setSelectedId, setRecipientId, setNewMessage} = ui;
        setShowNewForm(true);
        setSelectedId(null);
        setRecipientId('');
        setNewMessage('');
        this.setNewFiles([]);
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
    /** Выбирает получателя и открывает переписку. */
    private readonly handleRecipientPicked = (id: string) => {
        const {ui} = this;
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

    /** Рисует форму нового сообщения. */
    private renderNew(state: TReadonly<ImPageSnapshot>) {
        const {searchRecipientsUrl, sending} = this.props;
        const {recipientId, newMessage} = state;
        return (
            <NewMessageForm
                searchRecipientsUrl={searchRecipientsUrl}
                recipientId={recipientId}
                onRecipientIdChange={this.handleRecipientPicked}
                newMessage={newMessage}
                onNewMessageChange={this.ui.setNewMessage}
                newFiles={this.newFiles}
                onNewFilesChange={this.setNewFiles}
                sending={sending}
                onSend={this.handleSendNew}
            />
        );
    }

    /** Рисует выбранную переписку. */
    private renderThread(state: TReadonly<ImPageSnapshot>, messages: ImMessage[],
        selectedConversation: ImConversation) {
        const {sending, currentAccountId, isModerator = false} = this.props;
        const {loadingMessages, replyText} = state;
        return (
            <MessageThread
                conversation={selectedConversation}
                messages={messages}
                loadingMessages={loadingMessages}
                currentAccountId={currentAccountId}
                isModerator={isModerator}
                replyText={replyText}
                onReplyTextChange={this.ui.setReplyText}
                replyFiles={this.replyFiles}
                onReplyFilesChange={this.setReplyFiles}
                sending={sending}
                onReply={this.handleReply}
                messagesEndRef={this.messagesEndRef}
            />
        );
    }

    /** Рисует панель сообщений. */
    private renderPanel(
        state: TReadonly<ImPageSnapshot>,
        conversations: readonly ImConversation[],
        messages: ImMessage[],
        selectedConversation: ImConversation | undefined,
    ) {
        const {showNewForm} = state;
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
                {showNewForm ? this.renderNew(state) : selectedConversation ? this.renderThread(state, messages,
                    selectedConversation) : (
                    <div className="comms-page-empty">
                        {conversations.length === 0 ? t.IM_NoConversations() : t.IM_NoMessages()}
                    </div>
                )}
            </div>
        );
    }

    /** Рисует содержимое компонента. */
    render() {
        // Подписка = пути, прочитанные в этом render: поля строк копируем здесь, иначе
        // их изменение не разбудит остров (см. RULES.md, «Подписки useCarburetor»).
        const state = this.useCarburetor(this.ui);
        const conversations = state.conversations.map(readConversation);
        const messages = state.messages.map(readMessage);
        const selectedConversation = findConversation(conversations, state.selectedId);
        return (
            <div className="comms-page">
                <PageHeader title={t.IM_Title()} icon={PAGE_ICON} />

                <div className="comms-page-layout" data-detail={Boolean(selectedConversation || state.showNewForm)}>
                    <ConversationList
                        conversations={conversations}
                        selectedId={state.selectedId}
                        onSelectConversation={this.selectConversation}
                        onNewMessage={this.handleNewMessage}
                    />

                    {this.renderPanel(state, conversations, messages, selectedConversation)}
                </div>


            </div>
        );
    }
}

/** Создаёт островок страницы личных сообщений. */
export const ImPageIsland: React.FC<Props> = (props) => {
    const sending = useSending();
    return (
        <IrabiPreviewProvider>
            <ImPageView {...props} {...sending} />
        </IrabiPreviewProvider>
    );
};
