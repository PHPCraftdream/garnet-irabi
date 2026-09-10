import * as React from 'react';
import {formatTs} from '@common/Utils/DateUtils';
import {SupportMessage} from './supportTypes';
import AttachmentDisplay from '../../Common/AttachmentDisplay';

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
    const suffix = tight ? '-tight' : '';

    if (msg.msg_type === 'system') {
        return (
            <div className={`support-system-line${suffix}`}>
                {msg.body}
                <div className="text-muted mt-0.5">{formatTs(msg.created_at)}</div>
            </div>
        );
    }

    const isUser = msg.msg_type === 'user';

    return (
        <div className={`im-bubble-row${suffix} ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div className={`im-bubble${suffix} ${isUser ? 'im-bubble-mine' : 'im-bubble-theirs'}`}>
                {!isUser && msg.author_name && <div className={`im-bubble-author${suffix}`}>{msg.author_name}</div>}
                <div className="im-bubble-body">{msg.body}</div>
                {msg.attachments && msg.attachments.length > 0 && <AttachmentDisplay attachments={msg.attachments} />}
                <div className="im-bubble-time">{formatTs(msg.created_at)}</div>
            </div>
        </div>
    );
};

interface ListProps {
    messages: SupportMessage[];
    loading: boolean;
    emptyText: string;
    loadingText: string;
    endRef: React.RefObject<HTMLDivElement>;
    className?: string;
    tight?: boolean;
}

/** Лента сообщений с якорем для автопрокрутки вниз. */
export const SupportMessageList: React.FC<ListProps> = ({
    messages,
    loading,
    emptyText,
    loadingText,
    endRef,
    className = 'support-thread-body',
    tight = false,
}) => (
    <div className={className}>
        {loading && <div className="support-empty-line">{loadingText}</div>}
        {!loading && messages.length === 0 && <div className="support-empty-line">{emptyText}</div>}
        {!loading && messages.map(msg => <SupportBubble key={msg.id} msg={msg} tight={tight} />)}
        <div ref={endRef} />
    </div>
);
