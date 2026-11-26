import * as React from 'react';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import QuickChat from '@/Common/people/chat/QuickChat';
import {SlotItem} from '@/Islands/User/SlotsCalendar/State/view/types';

const quickChatTitle = t.QuickChat_Title;

interface Props {
    slot: SlotItem;
    quickChatUrl: string;
    sendUrl: string;
    currentAccountId: number;
}

/** Обновляет данные календаря. */
export function QuickChatSection({slot, quickChatUrl, sendUrl, currentAccountId}: Props) {
    return (
        <div className="slot-chat-panel" data-test-id="slot-detail-quickchat">
            <div className="slot-chat-heading">
                {quickChatTitle()}
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
