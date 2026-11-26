import {sendPost} from '@common/Api/Send/sendPost';
import {D} from '@common/Support/Debug/D';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import type {ImMessage} from './imTypes';
import type {ImPageState} from './ImPageState';

/** Загружает сообщения переписки. */
export async function fetchMessages(ui: ImPageState, url: string, conversationId: number): Promise<void> {
    ui.setLoadingMessages(true);
    D('im.messages', {conversationId});
    try {
        const result = await sendPost(url, {conversation_id: conversationId}) as {messages?: ImMessage[]};
        const messages = result?.messages ?? [];
        D('im.messages.loaded', {conversationId, count: messages.length});
        ui.finishLoading(conversationId, messages);
    } catch (error) {
        D('im.error', {action: 'fetchMessages', conversationId, error});
        showToast(t.User_LoadError(), 'danger');
    } finally {
        ui.setLoadingMessages(false);
    }
}
