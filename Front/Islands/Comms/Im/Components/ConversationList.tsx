import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import type {ImConversation} from '../imTypes';
import {ConversationRow} from './ConversationRow';

interface Props {
    conversations: ImConversation[];
    selectedId: number | null;
    onSelectConversation: (id: number) => void;
    onNewMessage: () => void;
}

function compareByLastMessage(left: ImConversation, right: ImConversation): number {
    return right.last_message_at - left.last_message_at;
}

export default function ConversationList({conversations, selectedId, onSelectConversation, onNewMessage}: Props) {
    // Сортируем копию, не меняя порядок в состоянии острова.
    const sorted = [...conversations];
    // oxlint-disable-next-line unicorn/no-array-sort
    sorted.sort(compareByLastMessage);
    const rows: React.ReactNode[] = [];
    for (const conv of sorted) {
        rows.push(<ConversationRow key={conv.id} conv={conv} active={selectedId === conv.id} onSelect={onSelectConversation} />);
    }

    return (
        <div className="im-conversation-list" data-test-id="im-conversation-list">
            <div className="im-conversation-list-header">
                <button type="button" data-test-id="im-new-message-btn" className="im-conversation-create" onClick={onNewMessage}>
                    + {t.IM_NewMessage()}
                </button>
            </div>
            <div className="support-list-scroll">
                {rows.length === 0 && <div className="support-empty">{t.IM_NoConversations()}</div>}
                {rows}
            </div>
        </div>
    );
}
