import * as React from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {ImConversation} from '../imTypes';
import {ConversationRow} from './ConversationRow';

interface Props {
    conversations: ImConversation[];
    selectedId: number | null;
    onSelectConversation: (id: number) => void;
    onNewMessage: () => void;
}

/** Список диалогов, свежие сверху. */
export default function ConversationList({conversations, selectedId, onSelectConversation, onNewMessage}: Props) {
    const sorted = [...conversations].sort((a, b) => b.last_message_at - a.last_message_at);

    return (
        <div className="support-list-panel" data-test-id="im-conversation-list">
            <div className="im-list-header">
                <button
                    type="button"
                    data-test-id="im-new-message-btn"
                    className="support-new-btn"
                    onClick={onNewMessage}
                >
                    + {t.IM_NewMessage()}
                </button>
            </div>
            <div className="support-list-scroll">
                {sorted.length === 0 && <div className="support-empty">{t.IM_NoConversations()}</div>}
                {sorted.map(conv => (
                    <ConversationRow
                        key={conv.id}
                        conv={conv}
                        active={selectedId === conv.id}
                        onSelect={onSelectConversation}
                    />
                ))}
            </div>
        </div>
    );
}
