import {Carburetor} from '@react-carburetor/core';
import type {ImConversation, ImMessage} from './imTypes';

interface State {
    conversations: ImConversation[];
    selectedId: number | null;
    messages: ImMessage[];
    loadingMessages: boolean;
    showNewForm: boolean;
    recipientId: string;
    newMessage: string;
    replyText: string;
}

export class ImPageState extends Carburetor<State> {
    constructor(conversations: ImConversation[]) {
        super({conversations, selectedId: null, messages: [], loadingMessages: false,
            showNewForm: false, recipientId: '', newMessage: '', replyText: ''});
    }

    readonly snapshot = () => this.getData();
    readonly subscribeSnapshot = (listener: () => void) => {
        const id = this.subscribe(listener);
        return () => this.unsubscribe(id);
    };

    private replace(current: State, next: State): void {
        const version = this.getVersion();
        this.setData(next);
        if (this.getData() !== current && version === this.getVersion()) {
            this.markAllChanged();
            this.emitUpdate();
        }
    }

    private change<K extends keyof State>(key: K, next: State[K]): void {
        const current = this.getData();
        if (!Object.is(current[key], next)) this.replace(current, {...current, [key]: next});
    }

    readonly setConversations = (value: ImConversation[]) => this.change('conversations', value);
    readonly setSelectedId = (value: number | null) => this.change('selectedId', value);
    readonly setLoadingMessages = (value: boolean) => this.change('loadingMessages', value);
    readonly setShowNewForm = (value: boolean) => this.change('showNewForm', value);
    readonly setRecipientId = (value: string) => this.change('recipientId', value);
    readonly setNewMessage = (value: string) => this.change('newMessage', value);
    readonly setReplyText = (value: string) => this.change('replyText', value);

    finishLoading(conversationId: number, messages: ImMessage[]): void {
        const current = this.getData();
        const index = current.conversations.findIndex(conversation => conversation.id === conversationId);
        const conversations = current.conversations.slice();
        if (index >= 0) conversations[index] = {...conversations[index], unread_count: 0};
        this.replace(current, {...current, conversations, messages, loadingMessages: false});
    }
}
