import {sendPost} from '@common/Api/Send/sendPost';
import {D} from '@common/Support/Debug/D';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import type {ImConversation} from './imTypes';
import type {ImPageState} from './ImPageState';

/** Обновляет список переписок. */
export async function refreshConversations(ui: ImPageState, url: string): Promise<void> {
    D('im.refreshConversations');
    try {
        const result = await sendPost(url, {}) as {conversations?: ImConversation[]};
        if (result?.conversations) {
            ui.setConversations(result.conversations);
            D('im.conversations.loaded', {count: result.conversations.length});
        }
    } catch (error) {
        D('im.error', {action: 'refreshConversations', error});
        showToast(t.User_LoadError(), 'danger');
    }
}
