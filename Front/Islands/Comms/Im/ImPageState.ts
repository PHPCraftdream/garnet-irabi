import {Carburetor} from '@react-carburetor/core';
import type {ImConversation, ImMessage} from './imTypes';

export interface ImPageSnapshot {
    conversations: ImConversation[];
    selectedId: number | null;
    messages: ImMessage[];
    loadingMessages: boolean;
    showNewForm: boolean;
    recipientId: string;
    newMessage: string;
    replyText: string;
}

export class ImPageState extends Carburetor<ImPageSnapshot> {
    /** Создаёт состояние контроллера. */
    constructor(conversations: ImConversation[]) {
        super({conversations, selectedId: null, messages: [], loadingMessages: false,
            showNewForm: false, recipientId: '', newMessage: '', replyText: ''});
    }

    /** Обрабатывает key. */
    private change<K extends keyof ImPageSnapshot>(key: K, next: ImPageSnapshot[K]): void {
        const current = this.getData();
        if (!Object.is(current[key], next)) this.setData({...current, [key]: next});
    }

    /** Обрабатывает setConversations. */
    readonly setConversations = (value: ImConversation[]) => this.change('conversations', value);
    /** Обрабатывает setSelectedId. */
    readonly setSelectedId = (value: number | null) => this.change('selectedId', value);
    /** Обрабатывает setLoadingMessages. */
    readonly setLoadingMessages = (value: boolean) => this.change('loadingMessages', value);
    /** Обрабатывает setShowNewForm. */
    readonly setShowNewForm = (value: boolean) => this.change('showNewForm', value);
    /** Обрабатывает setRecipientId. */
    readonly setRecipientId = (value: string) => this.change('recipientId', value);
    /** Обрабатывает setNewMessage. */
    readonly setNewMessage = (value: string) => this.change('newMessage', value);
    /** Обновляет текст ответа. */
    readonly setReplyText = (value: string) => this.change('replyText', value);

    /** Сохраняет загруженные сообщения. */
    finishLoading(conversationId: number, messages: ImMessage[]): void {
        const current = this.getData();
        const index = current.conversations.findIndex(conversation => conversation.id === conversationId);
        const conversations = current.conversations.slice();
        if (index >= 0) conversations[index] = {...conversations[index], unread_count: 0};
        this.setData({...current, conversations, messages, loadingMessages: false});
    }
}
