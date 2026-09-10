import * as React from 'react';
import {Archive, ArchiveRestore} from 'lucide-react';
import {formatTs} from '@common/Utils/DateUtils';
import {AsyncIconButton} from '@common/Components/AsyncIconButton';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {NewsEvent} from './newsTypes';

export interface NewsGroup {
    first: NewsEvent;
    others: NewsEvent[];
}

interface ArchiveButtonProps {
    event: NewsEvent;
    onArchive: (id: number) => Promise<void> | void;
    onUnarchive: (id: number) => Promise<void> | void;
}

const ArchiveToggle: React.FC<ArchiveButtonProps> = ({event, onArchive, onUnarchive}) => {
    if (event.is_archived) {
        return (
            <AsyncIconButton
                icon={<ArchiveRestore size={14} aria-hidden="true" />}
                label={t.News_Unarchive()}
                className="inline-flex items-center gap-1.5 px-2 py-1 text-sm rounded border border-accent text-accent hover:bg-accent hover:text-accent-text transition-colors"
                testId={`news-unarchive-${event.id}`}
                iconSize={14}
                errorToast={t.News_UnarchiveError()}
                onAction={() => onUnarchive(event.id)}
            />
        );
    }

    return (
        <AsyncIconButton
            icon={<Archive size={14} aria-hidden="true" />}
            label={t.News_Archive()}
            className="inline-flex items-center gap-1.5 px-2 py-1 text-sm rounded border border-default text-muted hover:text-on-surface hover:bg-surface-hover transition-colors"
            testId={`news-archive-${event.id}`}
            iconSize={14}
            errorToast={t.News_ArchiveError()}
            onAction={() => onArchive(event.id)}
        />
    );
};

interface Props {
    group: NewsGroup;
    detail: string | null;
    message: React.ReactNode;
    onMarkRead: (ids: number[]) => void;
    onArchive: (id: number) => Promise<void> | void;
    onUnarchive: (id: number) => Promise<void> | void;
}

/**
 * Строка ленты новостей.
 *
 * Подряд идущие однотипные события свёрнуты в одну запись со счётчиком: пять
 * одинаковых строк «новая бронь» подряд не сообщают больше, чем одна с цифрой.
 *
 * Прочитанным отмечается при наведении — и вся группа сразу, а не только
 * верхнее событие: человек прочитал их все одним взглядом.
 */
export const NewsGroupRow: React.FC<Props> = ({group, detail, message, onMarkRead, onArchive, onUnarchive}) => {
    const event = group.first;
    const groupCount = group.others.length;
    const anyUnread = !event.is_read || group.others.some(o => !o.is_read);

    const markGroupRead = () => {
        const unread = [event, ...group.others].filter(e => !e.is_read).map(e => e.id);
        if (unread.length > 0) onMarkRead(unread);
    };

    const rowClass = [
        'flex items-start gap-3 px-4 py-3 transition-colors',
        anyUnread ? 'bg-accent-subtle' : '',
        event.is_archived ? 'opacity-60' : '',
    ].join(' ');

    return (
        <div className={rowClass} data-test-id={`news-event-${event.id}`} onMouseEnter={markGroupRead}>
            <div className="flex-1 min-w-0">
                <p className={`text-sm ${anyUnread ? 'font-semibold text-on-surface' : 'text-on-surface'}`}>
                    {message}
                </p>
                {detail && <p className="text-sm text-muted mt-0.5">{detail}</p>}
                {groupCount > 0 && (
                    <p className="news-group-suffix" data-test-id={`news-group-suffix-${event.id}`}>
                        {t.News_GroupSuffix([groupCount])}
                    </p>
                )}
                <p className="text-xs text-muted mt-1">
                    {t.News_HappenedAt([formatTs(event.created_at)])}
                    {event.is_archived && <span className="ml-2 text-warning">{t.News_Archived()}</span>}
                </p>
            </div>
            <div className="flex-shrink-0 mt-0.5 news-row-actions">
                <ArchiveToggle event={event} onArchive={onArchive} onUnarchive={onUnarchive} />
            </div>
        </div>
    );
};
