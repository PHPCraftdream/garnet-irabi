import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {Archive, ArchiveRestore} from 'lucide-react';
import {formatTs} from '@common/Utils/Time/DateUtils/format/formatTs';
import {AsyncIconButton} from '@common/Components/Controls/AsyncIconButton';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
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

class ArchiveToggle extends AntiHookComponent<ArchiveButtonProps> {
    /** Запускает обработчик архивирования текущего события. */
    private readonly archive = () => this.props.onArchive(this.props.event.id);
    /** Запускает обработчик восстановления текущего события. */
    private readonly unarchive = () => this.props.onUnarchive(this.props.event.id);

    /** Отображает архивное действие, соответствующее состоянию события. */
    render() {
        const {event} = this.props;
        if (event.is_archived) {
            return (
                <AsyncIconButton
                    icon={<ArchiveRestore size={14} aria-hidden="true" />}
                    label={t.News_Unarchive()}
                    variant="accent-outline"
                    testId={`news-unarchive-${event.id}`}
                    iconSize={14}
                    errorToast={t.News_UnarchiveError()}
                    onAction={this.unarchive}
                />
            );
        }
        return (
            <AsyncIconButton
                icon={<Archive size={14} aria-hidden="true" />}
                label={t.News_Archive()}
                variant="muted-outline"
                testId={`news-archive-${event.id}`}
                iconSize={14}
                errorToast={t.News_ArchiveError()}
                onAction={this.archive}
            />
        );
    }
}

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
function unreadIds(group: NewsGroup): number[] {
    const ids: number[] = [];
    if (!group.first.is_read) ids.push(group.first.id);
    for (const event of group.others) {
        if (!event.is_read) ids.push(event.id);
    }
    return ids;
}

/** Возвращает, есть ли в группе непрочитанные события. */
function hasUnread(group: NewsGroup): boolean {
    if (!group.first.is_read) return true;
    for (const event of group.others) {
        if (!event.is_read) return true;
    }
    return false;
}

export class NewsGroupRow extends AntiHookComponent<Props> {
    /** Отмечает все непрочитанные события группы прочитанными. */
    private readonly markGroupRead = (): void => {
        const unread = unreadIds(this.props.group);
        if (unread.length > 0) this.props.onMarkRead(unread);
    };

    /** Рисует содержимое группы и связанные с ней действия. */
    private renderGroupContent(
        event: NewsEvent,
        detail: string | null,
        message: React.ReactNode,
        groupCount: number,
        anyUnread: boolean,
    ) {
        return (
            <>
                <div className="news-row-content">
                    <p className={anyUnread ? 'news-row-message-unread' : 'news-row-message'} data-unread={anyUnread}>
                        {message}
                    </p>
                    {detail && <p className="news-row-detail">{detail}</p>}
                    {groupCount > 0 && (
                        <p className="news-group-suffix" data-test-id={`news-group-suffix-${event.id}`}>
                            {t.News_GroupSuffix([groupCount])}
                        </p>
                    )}
                    <p className="news-row-time">
                        {t.News_HappenedAt([formatTs(event.created_at)])}
                        {event.is_archived && <span className="news-row-archived">{t.News_Archived()}</span>}
                    </p>
                </div>
                <div className="news-row-actions">
                    <ArchiveToggle
                        event={event}
                        onArchive={this.props.onArchive}
                        onUnarchive={this.props.onUnarchive}
                    />
                </div>
            </>
        );
    }

    /** Рисует группу событий и связанные с ней действия. */
    render() {
        const {group, detail, message} = this.props;
        const event = group.first;
        const anyUnread = hasUnread(group);
        return (
            <div
                className={event.is_archived ? 'news-row-archived-item' : 'news-row'}
                data-unread={anyUnread}
                data-archived={event.is_archived}
                data-test-id={`news-event-${event.id}`}
                onMouseEnter={this.markGroupRead}
            >
                {this.renderGroupContent(event, detail, message, group.others.length, anyUnread)}
            </div>
        );
    }
}
