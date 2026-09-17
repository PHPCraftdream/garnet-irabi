import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {SupportMessage} from '../../../Support/supportTypes';
import AttachmentDisplay from '../../../../Common/attachments/AttachmentDisplay';
import {AdminUserLink} from '../../../../Common/people/EntityLinks';
import {formatTs} from '@common/Utils/DateUtils';

/**
 * Одно сообщение в переписке по обращению.
 *
 * Три вида, и различать их важно: системная запись стоит по центру и не имеет
 * автора; внутренний комментарий видят только сотрудники и он подписан прямо,
 * иначе его легко принять за ответ клиенту; обычные сообщения расходятся по
 * сторонам — клиент справа, поддержка слева.
 */
const bubbleClass = (isInternal: boolean, isUser: boolean): string => {
    if (isInternal) return 'bg-warning-subtle border border-default text-on-surface';

    return isUser ? 'bg-surface-hover text-on-surface' : 'bg-accent-subtle text-on-surface';
};

const Author: React.FC<{msg: SupportMessage}> = ({msg}) => {
    if (!msg.author_name) return null;

    return msg.author_id > 0
        ? <AdminUserLink id={msg.author_id} name={msg.author_name} className="text-xs font-medium" />
        : <span className="text-xs font-medium text-muted">{msg.author_name}</span>;
};

export const SupportMessageBubble: React.FC<{msg: SupportMessage}> = ({msg}) => {
    if (msg.msg_type === 'system') {
        return (
            <div className="text-center text-xs text-muted italic my-3 px-4" data-test-id={`support-msg-${msg.id}`}>
                {msg.body}
                <div className="text-muted mt-0.5">{formatTs(msg.created_at)}</div>
            </div>
        );
    }

    const isInternal = !!msg.is_internal;
    const isUser = msg.msg_type === 'user';

    return (
        <div className={`flex mb-3 ${isUser ? 'justify-end' : 'justify-start'}`} data-test-id={`support-msg-${msg.id}`}>
            <div className={`max-w-[70%] rounded-lg px-4 py-3 text-sm ${bubbleClass(isInternal, isUser)}`}>
                <div className="flex items-center gap-2 mb-1">
                    <Author msg={msg} />
                    {isInternal && <span className="text-xs font-medium text-warning">({t.Support_InternalComment()})</span>}
                </div>
                <div className="whitespace-pre-wrap break-words">{msg.body}</div>
                {msg.attachments && msg.attachments.length > 0 && <AttachmentDisplay attachments={msg.attachments} />}
                <div className="text-xs text-muted mt-1">{formatTs(msg.created_at)}</div>
            </div>
        </div>
    );
};
