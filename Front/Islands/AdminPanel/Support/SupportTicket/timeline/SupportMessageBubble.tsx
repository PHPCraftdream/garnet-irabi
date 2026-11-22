import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {SupportMessage} from '../../../../Comms/Support/parts/supportTypes';
import AttachmentDisplay from '../../../../../Common/attachments/AttachmentDisplay';
import {AdminUserLink} from '../../../../../Common/people/EntityLinks';
import {formatTs} from '@common/Utils/Time/DateUtils';

/**
 * Одно сообщение в переписке по обращению.
 *
 * Три вида, и различать их важно: системная запись стоит по центру и не имеет
 * автора; внутренний комментарий видят только сотрудники и он подписан прямо,
 * иначе его легко принять за ответ клиенту; обычные сообщения расходятся по
 * сторонам — клиент справа, поддержка слева.
 */
const Author: React.FC<{msg: SupportMessage}> = ({msg}) => {
    if (!msg.author_name) return null;

    return msg.author_id > 0
        ? <AdminUserLink id={msg.author_id} name={msg.author_name} variant="support-author" />
        : <span className="admin-support-author-muted">{msg.author_name}</span>;
};

export const SupportMessageBubble: React.FC<{msg: SupportMessage}> = ({msg}) => {
    if (msg.msg_type === 'system') {
        return (
            <div className="support-message-system" data-test-id={`support-msg-${msg.id}`}>
                {msg.body}
                <div className="support-message-system-time">{formatTs(msg.created_at)}</div>
            </div>
        );
    }

    const isInternal = !!msg.is_internal;
    const isUser = msg.msg_type === 'user';

    return (
        <div className="support-message-row" data-own={isUser} data-test-id={`support-msg-${msg.id}`}>
            <div className="support-message-bubble" data-own={!isUser && !isInternal} data-admin-internal={isInternal}>
                <div className="admin-support-message-heading">
                    <Author msg={msg} />
                    {isInternal && <span className="admin-support-internal-label">({t.Support_InternalComment()})</span>}
                </div>
                <div className="support-message-body">{msg.body}</div>
                {msg.attachments && msg.attachments.length > 0 && <AttachmentDisplay attachments={msg.attachments} />}
                <div className="support-message-time">{formatTs(msg.created_at)}</div>
            </div>
        </div>
    );
};
