import * as React from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {ImConversation} from '../imTypes';
import {formatTs} from '@common/Utils/DateUtils';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {UserAvatar} from '../../../Common/UserAvatar';

interface Props {
    conversations: ImConversation[];
    selectedId: number | null;
    onSelectConversation: (id: number) => void;
    onNewMessage: () => void;
}

export default function ConversationList({conversations, selectedId, onSelectConversation, onNewMessage}: Props) {
    const sortedConversations = [...conversations]
        .sort((a, b) => b.last_message_at - a.last_message_at);

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
                {sortedConversations.length === 0 ? (
                    <div className="support-empty">{t.IM_NoConversations()}</div>
                ) : (
                    sortedConversations.map(conv => (
                        <div
                            key={conv.id}
                            data-test-id={`im-conversation-${conv.id}`}
                            className={`support-ticket-row ${selectedId === conv.id ? 'support-ticket-row-active' : 'support-ticket-row-inactive'}`}
                            onClick={() => onSelectConversation(conv.id)}
                        >
                            <div className="flex items-start gap-2">
                                <UserAvatar
                                    name={conv.partner_name || t.User_Anonymous()}
                                    avatar={conv.partner_avatar}
                                    disabled={!!conv.partner_is_disabled}
                                    testId={`im-conv-avatar-${conv.id}`}
                                    className="mt-0.5"
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="support-ticket-row-head">
                                        <UserLink
                                            id={conv.partner_id}
                                            name={conv.partner_name || t.User_Anonymous()}
                                            className="support-ticket-title common-link"
                                            onClick={e => e.stopPropagation()}
                                        />

                                        {conv.unread_count > 0 && (
                                            <span
                                                data-test-id={`im-unread-badge-${conv.id}`}
                                                className="support-unread-badge"
                                            >
                                                {conv.unread_count}
                                            </span>
                                        )}
                                    </div>
                                    <div className="support-ticket-row-meta">
                                        <span className="im-conv-snippet">{conv.last_message_snippet}</span>
                                        <span className="im-conv-time">{formatTs(conv.last_message_at)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
