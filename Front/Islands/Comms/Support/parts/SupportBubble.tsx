import * as React from 'react';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {SupportMessage} from './supportTypes';
import AttachmentDisplay from '../../../../Common/attachments/AttachmentDisplay';

/**
 * Сообщение в переписке глазами клиента.
 *
 * Системная запись стоит по центру и без автора — это не чей-то ответ, а
 * отметка о случившемся. Остальные расходятся по сторонам: свои справа,
 * поддержка слева.
 *
 * Отличается от `SupportMessageBubble` в админке намеренно: там показывается
 * внутренний комментарий, который клиент видеть не должен.
 */
export const SupportBubble: React.FC<{msg: SupportMessage; tight?: boolean}> = ({msg, tight = false}) => {
    // Всплывающее окно у́же страницы, и те же пузыри в нём набраны плотнее.
    // Разница только в классах — ради неё копировать разметку не стоит.

    if (msg.msg_type === 'system') {
        return (
            <div className="support-message-system" data-tight={tight}>
                {msg.body}
                <div className="support-message-system-time">{formatTs(msg.created_at)}</div>
            </div>
        );
    }

    const isUser = msg.msg_type === 'user';

    return (
        <div className="support-message-row" data-tight={tight} data-own={isUser}>
            <div className="support-message-bubble" data-tight={tight} data-own={isUser}>
                {!isUser && msg.author_name && <div className="support-message-author" data-tight={tight}>{msg.author_name}</div>}
                <div className="support-message-body">{msg.body}</div>
                {msg.attachments && msg.attachments.length > 0 && <AttachmentDisplay attachments={msg.attachments} />}
                <div className="support-message-time">{formatTs(msg.created_at)}</div>
            </div>
        </div>
    );
};
