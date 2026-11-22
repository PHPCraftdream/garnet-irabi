import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import QuickChat from '../../../../../Common/people/QuickChat';
import {SlotItem} from '../../State/types';

interface Props {
    slot: SlotItem;
    quickChatUrl: string;
    sendUrl: string;
    currentAccountId: number;
}

export function QuickChatSection({slot, quickChatUrl, sendUrl, currentAccountId}: Props) {
    return (
        <div className="slot-chat-panel" data-test-id="slot-detail-quickchat">
            <div className="slot-chat-heading">
                {t.QuickChat_Title()}
            </div>
            <QuickChat
                partnerId={slot.expert_id}
                quickChatUrl={quickChatUrl}
                sendUrl={sendUrl}
                currentAccountId={currentAccountId}
                maxMessages={5}
            />
        </div>
    );
}
