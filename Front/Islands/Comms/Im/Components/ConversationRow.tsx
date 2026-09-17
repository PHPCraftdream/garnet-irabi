import * as React from 'react';
import {Paperclip} from 'lucide-react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {ImConversation} from '../imTypes';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {UserAvatar} from '../../../../Common/media/UserAvatar';

/**
 * Значок скрепки в строке диалога.
 *
 * Есть ли в переписке файлы, из списка было не видно вовсе — единственным
 * способом узнать было открыть каждую.
 */
const AttachmentsMark: React.FC<{count: number; convId: number}> = ({count, convId}) => {
    if (count <= 0) return null;

    return (
        <span
            className="text-muted text-xs inline-flex items-center gap-0.5 shrink-0"
            data-test-id={`im-conv-attachments-${convId}`}
            title={t.Support_HasAttachments([count])}
        >
            <Paperclip size={12} aria-hidden="true" />
            {count}
        </span>
    );
};

interface Props {
    conv: ImConversation;
    active: boolean;
    onSelect: (id: number) => void;
}

/** Строка диалога: собеседник, последнее сообщение, непрочитанное, время. */
export const ConversationRow: React.FC<Props> = ({conv, active, onSelect}) => {
    const partnerName = conv.partner_name || t.User_Anonymous();

    return (
        <div
            data-test-id={`im-conversation-${conv.id}`}
            className={`support-ticket-row ${active ? 'support-ticket-row-active' : 'support-ticket-row-inactive'}`}
            onClick={() => onSelect(conv.id)}
        >
            <div className="flex items-start gap-2">
                <UserAvatar
                    name={partnerName}
                    avatar={conv.partner_avatar}
                    disabled={!!conv.partner_is_disabled}
                    testId={`im-conv-avatar-${conv.id}`}
                    className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                    <div className="support-ticket-row-head">
                        {/* Клик по имени открывает карточку человека, а не диалог —
                            поэтому всплытие останавливается. */}
                        <UserLink
                            id={conv.partner_id}
                            name={partnerName}
                            className="support-ticket-title common-link"
                            onClick={e => e.stopPropagation()}
                        />
                        {conv.unread_count > 0 && (
                            <span data-test-id={`im-unread-badge-${conv.id}`} className="support-unread-badge">
                                {conv.unread_count}
                            </span>
                        )}
                    </div>
                    <div className="support-ticket-row-meta">
                        <span className="im-conv-snippet">
                            {conv.last_message_is_mine && <span className="im-conv-you-prefix">{t.IM_YouPrefix()}</span>}
                            {conv.last_message_snippet}
                        </span>
                        <AttachmentsMark count={conv.attachments_count ?? 0} convId={conv.id} />
                        <span className="im-conv-time">{formatTs(conv.last_message_at)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
