import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {Paperclip} from 'lucide-react';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {ImConversation} from '@/Islands/Comms/Im/imTypes';
import {formatTs} from '@common/Utils/Time/DateUtils/format/formatTs';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {UserAvatar} from '@/Common/media/UserAvatar';

const supportHasAttachments = t.Support_HasAttachments;
const imYouPrefix = t.IM_YouPrefix;

const CONVERSATION_PARTNER_NAME_TEMPLATE = <a className="conversation-partner-name" />;

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
            className="conversation-attachments"
            data-test-id={`im-conv-attachments-${convId}`}
            title={supportHasAttachments([count])}
        >
            <Paperclip size={12} aria-hidden="true" />
            {count}
        </span>
    );
};

/** Обрабатывает stopClick. */
function stopClick(event: React.MouseEvent<HTMLAnchorElement>): void {
    event.stopPropagation();
}

const ConversationHead: React.FC<{conv: ImConversation; partnerName: string}> = ({conv, partnerName}) => (
    <div className="support-ticket-heading">
        {/* Клик по имени открывает карточку человека, а не диалог —
            поэтому всплытие останавливается. */}
        <UserLink
            id={conv.partner_id}
            name={partnerName}
            anchor={CONVERSATION_PARTNER_NAME_TEMPLATE}
            onClick={stopClick}
        />
        {conv.unread_count > 0 && (
            <span data-test-id={`im-unread-badge-${conv.id}`} className="support-ticket-unread">
                {conv.unread_count}
            </span>
        )}
    </div>
);

const ConversationMeta: React.FC<{conv: ImConversation}> = ({conv}) => (
    <div className="support-ticket-metadata">
        <span className="conversation-snippet">
            {conv.last_message_is_mine && <span className="conversation-you">{imYouPrefix()}</span>}
            {conv.last_message_snippet}
        </span>
        <AttachmentsMark count={conv.attachments_count ?? 0} convId={conv.id} />
        <span className="conversation-time">{formatTs(conv.last_message_at)}</span>
    </div>
);

interface Props {
    conv: ImConversation;
    active: boolean;
    onSelect: (id: number) => void;
}

/** Строка диалога: собеседник, последнее сообщение, непрочитанное, время. */
export class ConversationRow extends AntiHookComponent<Props> {
    /** Выбирает строку списка. */
    private readonly select = () => this.props.onSelect(this.props.conv.id);

    /** Рисует содержимое компонента. */
    render() {
        const {conv, active} = this.props;
        const partnerName = conv.partner_name || t.User_Anonymous();

        return (
            <div
                data-test-id={`im-conversation-${conv.id}`}
                className="support-page-ticket-row" data-active={active}
                onClick={this.select}
            >
                <div className="conversation-row-content">
                    <UserAvatar
                        name={partnerName}
                        avatar={conv.partner_avatar}
                        disabled={!!conv.partner_is_disabled}
                        testId={`im-conv-avatar-${conv.id}`}
                    />
                    <div className="conversation-summary">
                        <ConversationHead conv={conv} partnerName={partnerName} />
                        <ConversationMeta conv={conv} />
                    </div>
                </div>
            </div>
        );
    }
}
