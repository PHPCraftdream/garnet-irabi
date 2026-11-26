import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {sendPostFormData} from '@common/Api/Send/sendPostFormData';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {formatTs} from '@common/Utils/Time/DateUtils/format/formatTs';
import {NewsPagination} from './NewsPagination';
import {SlotBookingController} from '@/Islands/User/SlotsCalendar/Booking/logic/SlotBookingController';
import {SlotBookingModalHost} from '@/Islands/User/SlotsCalendar/Booking/components/SlotBookingModalHost';
import {NewsEvent} from './newsTypes';
import {NewsGroup, NewsGroupRow} from './NewsGroupRow';
import {EventMessage} from './EventMessage';

interface FeedResponse {
    items: NewsEvent[];
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
    unreadCount: number;
}

interface Props {
    feedUrl: string;
    initialUnreadCount: number;
}

/** Формирует ключ событий, которые можно объединить в ленте. */
function groupKey(event: NewsEvent): string | null {
    const p = event.payload || {};
    switch (event.event_type) {
        case 'slot_booked':
            return p.slot_id ? `slot_booked:${p.slot_id}` : null;
        case 'new_slot':
        case 'booking_confirmed':
        case 'booking_rejected':
        case 'booking_cancelled':
        case 'booking_rescheduled':
            if (p.expert_id && p.time) return `${event.event_type}:${p.expert_id}:${p.time}`;
            return null;
        case 'new_message':
            return p.sender_id ? `new_message:${p.sender_id}` : null;
        case 'support_reply': {
            const k = p.ticket_id ?? p.subject;
            return k ? `support_reply:${k}` : null;
        }
        default:
            return null;
    }
}

/** Объединяет соседние события с одинаковым ключом в группы. */
function groupConsecutive(items: readonly NewsEvent[]): NewsGroup[] {
    const out: NewsGroup[] = [];
    let current: NewsGroup | null = null;
    let currentKey: string | null = null;
    for (const ev of items) {
        const k = groupKey(ev);
        if (current && k !== null && k === currentKey) {
            current.others.push(ev);
            continue;
        }
        current = {first: ev, others: []};
        currentKey = k;
        out.push(current);
    }
    return out;
}

/**
 * Подробность записи — время самого занятия.
 *
 * Подпись обязательна: ниже стоит вторая дата, время самого события, и без
 * слова «Занятие» две даты подряд читаются как загадка — какая из них что.
 * Нашла user-8 на записи «подтвердил(а) вашу бронь».
 */
function eventDetail(event: NewsEvent): string | null {
    const p = event.payload;
    if ((event.event_type === 'new_slot' || event.event_type === 'slot_booked' ||
         event.event_type === 'booking_confirmed' || event.event_type === 'booking_rejected' ||
         event.event_type === 'booking_cancelled' || event.event_type === 'booking_rescheduled') && p.time) {
        return t.News_LessonAt([formatTs(p.time)]) + (p.cost ? ` · ${p.cost}₽` : '');
    }
    return null;
}

interface FeedState {
    items: NewsEvent[];
    page: number;
    totalPages: number;
    total: number;
    unreadCount: number;
    loading: boolean;
    showArchived: boolean;
}

export class NewsFeed extends AntiHookComponent<Props> {
    private readonly ui = new Carburetor<FeedState>({
        items: [], page: 1, totalPages: 1, total: 0,
        unreadCount: this.props.initialUnreadCount, loading: false, showArchived: false,
    });
    private readonly items = this.connectSelection(this.ui, state => state.items);
    private loadedArchived = false;
    private unmounted = false;
    private readonly controller = new SlotBookingController();
    /** Открывает бронирование занятия из события ленты. */
    private readonly handleBookSlot = (slotId: number) => void this.controller.openBooking(slotId);

    /** Загружает первую страницу ленты при монтировании. */
    componentDidMount(): void {
        super.componentDidMount();
        void this.loadFeed(1, false);
    }

    /** Помечает компонент размонтированным перед очисткой базового класса. */
    componentWillUnmount(): void {
        this.unmounted = true;
        super.componentWillUnmount();
    }

    /** Перезагружает ленту при изменении режима архива. */
    componentDidUpdate(previous: Readonly<Props>): void {
        super.componentDidUpdate(previous);
        const {showArchived} = this.ui.getData();
        if (showArchived !== this.loadedArchived) {
            this.loadedArchived = showArchived;
            void this.loadFeed(1, showArchived);
        }
    }

    /** Применяет изменения к состоянию ленты. */
    private patch(changes: Partial<FeedState>): void {
        this.ui.setData({...this.ui.getData(), ...changes});
    }

    /** Загружает выбранную страницу событий и обновляет счётчики. */
    private async loadFeed(p: number, archived: boolean): Promise<void> {
        this.patch({loading: true});
        const fd = new FormData();
        fd.append('page', String(p));
        fd.append('perPage', '10');
        if (archived) fd.append('includeArchived', '1');
        try {
            const res = await sendPostFormData<FormData, FeedResponse>(this.props.feedUrl + '/~feed', fd);
            this.patch({
                items: res.items,
                page: res.page,
                totalPages: res.totalPages,
                total: res.total,
                unreadCount: res.unreadCount,
            });
        } catch {
        } finally {
            this.patch({loading: false});
        }
    }

    /** Обновляет ленту после завершившегося бронирования. */
    public readonly reloadAfterBooking = (): void => {
        if (this.unmounted) return;
        const {page, showArchived} = this.ui.getData();
        void this.loadFeed(page, showArchived);
    };

    /** Загружает выбранную страницу ленты. */
    private readonly handlePageChange = (p: number): void => {
        void this.loadFeed(p, this.ui.getData().showArchived);
    };

    /** Переключает отображение архивных событий. */
    private readonly toggleArchived = (): void => {
        this.patch({showArchived: !this.ui.getData().showArchived});
    };

    /** Отмечает все загруженные события прочитанными. */
    private readonly markAllRead = async (): Promise<void> => {
        const fd = new FormData();
        await sendPostFormData<FormData, {success: boolean}>(this.props.feedUrl + '/~markAllRead', fd);
        const items = this.ui.getData().items.slice();
        for (let i = 0; i < items.length; i++) items[i] = {...items[i], is_read: true};
        this.patch({unreadCount: 0, items});
    };

    /** Отмечает выбранные события прочитанными на сервере и в интерфейсе. */
    private readonly markRead = async (ids: number[]): Promise<void> => {
        const fd = new FormData();
        fd.append('event_ids', JSON.stringify(ids));
        const res = await sendPostFormData<FormData, {success: boolean; unreadCount: number}>(this.props.feedUrl + '/~markRead', fd);
        const items = this.ui.getData().items.slice();
        for (let i = 0; i < items.length; i++) {
            if (ids.includes(items[i].id)) items[i] = {...items[i], is_read: true};
        }
        this.patch({unreadCount: res.unreadCount, items});
    };

    /** Архивирует событие и убирает его из обычной ленты. */
    private readonly archiveEvent = async (id: number): Promise<void> => {
        const {showArchived} = this.ui.getData();
        const fd = new FormData();
        fd.append('event_ids', JSON.stringify([id]));
        await sendPostFormData<FormData, {success: boolean}>(this.props.feedUrl + '/~archive', fd);
        const {items, total} = this.ui.getData();
        if (!showArchived) {
            this.patch({items: items.filter(e => e.id !== id), total: total - 1});
        } else {
            this.setArchived(id, true);
        }
        showToast(t.News_ArchivedHint(), 'primary');
    };

    /** Меняет архивный признак события в локальном списке. */
    private setArchived(id: number, isArchived: boolean): void {
        const items = this.ui.getData().items.slice();
        for (let i = 0; i < items.length; i++) {
            if (items[i].id === id) items[i] = {...items[i], is_archived: isArchived};
        }
        this.patch({items});
    }

    /** Возвращает событие из архива. */
    private readonly unarchiveEvent = async (id: number): Promise<void> => {
        const fd = new FormData();
        fd.append('event_ids', JSON.stringify([id]));
        await sendPostFormData<FormData, {success: boolean}>(this.props.feedUrl + '/~unarchive', fd);
        this.setArchived(id, false);
    };

    /** Рисует заголовок ленты и действия над событиями. */
    private renderHeader(unreadCount: number, showArchived: boolean) {
        return (
            <div className="news-feed-header">
                <div className="news-feed-header-group">
                    <h2 className="news-feed-title">{t.News_Title()}</h2>
                    {unreadCount > 0 && (
                        <span className="news-feed-unread" data-test-id="news-unread-badge">
                            {unreadCount} {t.News_Unread()}
                        </span>
                    )}
                </div>
                <div className="news-feed-header-group">
                    {unreadCount > 0 && (
                        <button type="button" className="news-feed-mark-all" onClick={this.markAllRead} data-test-id="news-mark-all-read">
                            {t.News_MarkAllRead()}
                        </button>
                    )}
                    <button type="button" className="news-archive" aria-pressed={showArchived}
                        onClick={this.toggleArchived} data-test-id="news-toggle-archived">
                        {showArchived ? t.News_HideArchived() : t.News_ShowArchived()}
                    </button>
                </div>
            </div>
        );
    }

    /** Создаёт строку для одной сгруппированной записи ленты. */
    private readonly renderGroup = (group: NewsGroup) => (
        <NewsGroupRow key={group.first.id} group={group} detail={eventDetail(group.first)}
            message={<EventMessage event={group.first} onBookSlot={this.handleBookSlot} />}
            onMarkRead={this.markRead} onArchive={this.archiveEvent} onUnarchive={this.unarchiveEvent} />
    );

    /** Отображает сгруппированные события или пустое состояние. */
    private renderRows(loading: boolean) {
        const items = this.items();
        return (
            <div className={loading ? 'news-feed-content-loading' : 'news-feed-content'}>
                {items.length === 0 && !loading && <div className="news-feed-empty">{t.News_Empty()}</div>}
                {groupConsecutive(items).map(this.renderGroup)}
            </div>
        );
    }

    /** Собирает заголовок, страницы и строки ленты. */
    render() {
        const {page, totalPages, total, unreadCount, loading, showArchived} = this.useCarburetor(this.ui);
        return (
            <div className="news-feed" data-test-id="news-feed">
                {this.renderHeader(unreadCount, showArchived)}
                {totalPages > 1 && (
                    <NewsPagination
                        position="top"
                        page={page}
                        totalPages={totalPages}
                        onPageChange={this.handlePageChange}
                        total={total}
                        loading={loading}
                    />
                )}
                {this.renderRows(loading)}
                {totalPages > 1 && (
                    <NewsPagination
                        position="bottom"
                        page={page}
                        totalPages={totalPages}
                        onPageChange={this.handlePageChange}
                        total={total}
                        loading={loading}
                    />
                )}
                <SlotBookingModalHost controller={this.controller} onBooked={this.reloadAfterBooking} />
            </div>
        );
    }
}
