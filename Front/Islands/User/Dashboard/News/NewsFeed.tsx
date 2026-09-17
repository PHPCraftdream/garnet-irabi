import * as React from 'react';
import {useState, useEffect, useCallback} from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {sendPostFormData} from '@common/Api/Send/sendPostFormData';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {formatTs} from '@common/Utils/Time/DateUtils';
import Pagination from '@common/Components/Layout/Paging/Pagination';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {appUrl} from '@common/Utils/Url/appUrl';
import {useSlotBooking} from '../../SlotsCalendar/Booking/useSlotBooking';
import {NewsEvent} from './newsTypes';
import {NewsGroup, NewsGroupRow} from './NewsGroupRow';

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

const linkCls = 'text-accent hover:underline font-medium';

function PersonLink({id, name, isExpert}: {id?: number; name: string; isExpert?: boolean}) {
    if (!id) return <>{name}</>;
    return <UserLink id={id} name={name} isExpert={isExpert} className={linkCls} />;
}

function EventMessage({event, onBookSlot}: {event: NewsEvent; onBookSlot: (slotId: number) => void}) {
    const p = event.payload;
    switch (event.event_type) {
        case 'new_slot': {
            const slotId = Number(p.slot_id) || 0;
            const link = slotId > 0 ? (
                <button
                    type="button"
                    className={`${linkCls} bg-transparent border-0 p-0 cursor-pointer`}
                    onClick={() => onBookSlot(slotId)}
                    data-test-id={`news-book-slot-${slotId}`}
                >
                    {t.News_NewSlot_Link()}
                </button>
            ) : (
                <a href={appUrl('/slots')} className={linkCls}>{t.News_NewSlot_Link()}</a>
            );
            return <><PersonLink id={p.expert_id} name={p.name} isExpert />{t.News_NewSlot_Action()}{link}{t.News_NewSlot_Suffix()}</>;
        }
        case 'slot_booked':
            return <><PersonLink id={p.user_id} name={p.name} />{t.News_SlotBooked_Action()}<a href={appUrl('/expert/~slots')} className={linkCls}>{t.News_SlotBooked_Link()}</a></>;
        case 'booking_confirmed':
            return <><PersonLink id={p.expert_id} name={p.name} isExpert />{t.News_BookingConfirmed_Action()}<a href={appUrl('/bookings')} className={linkCls}>{t.News_BookingConfirmed_Link()}</a>{t.News_BookingConfirmed_Suffix()}</>;
        case 'booking_rejected':
            return <><PersonLink id={p.expert_id} name={p.name} isExpert />{t.News_BookingRejected_Action()}<a href={appUrl('/bookings')} className={linkCls}>{t.News_BookingRejected_Link()}</a>{t.News_BookingRejected_Suffix()}</>;
        case 'booking_cancelled':
            // Одно событие, две стороны: ученик снял бронь — узнаёт
            // преподаватель; преподаватель отменил занятие — узнаёт ученик.
            // Отличаются они тем, кто назван в полезной нагрузке.
            return p.user_id
                ? <><PersonLink id={p.user_id} name={p.name} />{t.News_BookingCancelledByUser_Action()}<a href={appUrl('/expert/~slots')} className={linkCls}>{t.News_BookingCancelledByUser_Link()}</a>{t.News_BookingCancelledByUser_Suffix()}</>
                : <><PersonLink id={p.expert_id} name={p.name} isExpert />{t.News_BookingCancelled_Action()}<a href={appUrl('/bookings')} className={linkCls}>{t.News_BookingCancelled_Link()}</a>{t.News_BookingCancelled_Suffix()}</>;
        case 'booking_rescheduled':
            // Тот же расклад «кто есть в payload», что у booking_cancelled —
            // перенести может любая сторона, и текст называет её.
            return p.user_id
                ? <><PersonLink id={p.user_id} name={p.name} />{t.News_BookingRescheduledByUser_Action()}<a href={appUrl('/expert/~slots')} className={linkCls}>{t.News_BookingRescheduledByUser_Link()}</a>{t.News_BookingRescheduledByUser_Suffix()}</>
                : <><PersonLink id={p.expert_id} name={p.name} isExpert />{t.News_BookingRescheduled_Action()}<a href={appUrl('/bookings')} className={linkCls}>{t.News_BookingRescheduled_Link()}</a>{t.News_BookingRescheduled_Suffix()}</>;
        case 'comment_approved':
            return <>{t.News_CommentApproved_Prefix()}<PersonLink id={p.expert_id} name={p.name} isExpert />{t.News_CommentApproved_Suffix()}<a href={appUrl(`/expert/id~${p.expert_id}`)} className={linkCls}>{t.News_CommentApproved_Link()}</a></>;
        case 'support_reply':
            return <>{t.News_SupportReply_Prefix()}<a href={appUrl('/support')} className={linkCls}>«{p.subject}»</a></>;
        case 'new_message':
            return <>{t.News_NewMessage_Prefix()}<a href={appUrl('/im/')} className={linkCls}>{t.News_NewMessage_Link()}</a>{t.News_NewMessage_From()}<PersonLink id={p.sender_id} name={p.name} /></>;
        default:
            return <>{event.event_type}</>;
    }
}

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

function groupConsecutive(items: NewsEvent[]): NewsGroup[] {
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

export const NewsFeed: React.FC<Props> = ({feedUrl, initialUnreadCount}) => {
    const [items, setItems] = useState<NewsEvent[]>([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
    const [loading, setLoading] = useState(false);
    const [showArchived, setShowArchived] = useState(false);

    const loadFeed = useCallback((p: number, archived: boolean) => {
        setLoading(true);
        const fd = new FormData();
        fd.append('page', String(p));
        fd.append('perPage', '10');
        if (archived) fd.append('includeArchived', '1');

        sendPostFormData<FormData, FeedResponse>(feedUrl + '/~feed', fd)
            .then(res => {
                setItems(res.items);
                setPage(res.page);
                setTotalPages(res.totalPages);
                setTotal(res.total);
                setUnreadCount(res.unreadCount);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [feedUrl]);

    useEffect(() => {
        loadFeed(1, showArchived);
    }, [showArchived]);

    const handlePageChange = (p: number) => {
        loadFeed(p, showArchived);
    };

    const markAllRead = () => {
        const fd = new FormData();
        sendPostFormData<FormData, {success: boolean}>(feedUrl + '/~markAllRead', fd)
            .then(() => {
                setUnreadCount(0);
                setItems(prev => prev.map(e => ({...e, is_read: true})));
            });
    };

    const markRead = (ids: number[]) => {
        const fd = new FormData();
        fd.append('event_ids', JSON.stringify(ids));
        sendPostFormData<FormData, {success: boolean; unreadCount: number}>(feedUrl + '/~markRead', fd)
            .then(res => {
                setUnreadCount(res.unreadCount);
                setItems(prev => prev.map(e => ids.includes(e.id) ? {...e, is_read: true} : e));
            });
    };

    /**
     * Убрать запись в архив.
     *
     * Запись исчезает мгновенно, и до этого экран не говорил ни слова: узнать,
     * что действие обратимо, можно было только самому найдя «Показать архив».
     * Пока возврат из архива к тому же был сломан, это выглядело как
     * безвозвратное удаление (нашла user-8). Говорим вслух — и не окном
     * подтверждения: спрашивать разрешение на обратимое действие дороже, чем
     * сказать, как его отменить.
     */
    const archiveEvent = (id: number) => {
        const fd = new FormData();
        fd.append('event_ids', JSON.stringify([id]));
        return sendPostFormData<FormData, {success: boolean}>(feedUrl + '/~archive', fd)
            .then(() => {
                if (!showArchived) {
                    setItems(prev => prev.filter(e => e.id !== id));
                    setTotal(prev => prev - 1);
                } else {
                    setItems(prev => prev.map(e => e.id === id ? {...e, is_archived: true} : e));
                }
                showToast(t.News_ArchivedHint(), 'primary');
            });
    };

    // Centralised booking-modal flow (shared with RecommendedSlots etc.).
    const {openBooking: handleBookSlot, bookingModal} = useSlotBooking({
        onBooked: () => loadFeed(page, showArchived),
    });

    const unarchiveEvent = (id: number) => {
        const fd = new FormData();
        fd.append('event_ids', JSON.stringify([id]));
        return sendPostFormData<FormData, {success: boolean}>(feedUrl + '/~unarchive', fd)
            .then(() => {
                setItems(prev => prev.map(e => e.id === id ? {...e, is_archived: false} : e));
            });
    };

    return (
        <div className="rounded-lg border border-default bg-surface" data-test-id="news-feed">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-default">
                <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-on-surface">
                        {t.News_Title()}
                    </h2>
                    {unreadCount > 0 && (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold rounded-full bg-accent text-accent-text" data-test-id="news-unread-badge">
                            {unreadCount} {t.News_Unread()}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                        <button
                            type="button"
                            className="text-sm text-accent hover:underline"
                            onClick={markAllRead}
                            data-test-id="news-mark-all-read"
                        >
                            {t.News_MarkAllRead()}
                        </button>
                    )}
                    <button
                        type="button"
                        className={`toggle-pill ${showArchived ? 'toggle-pill-on' : 'toggle-pill-off'}`}
                        onClick={() => setShowArchived(prev => !prev)}
                        data-test-id="news-toggle-archived"
                    >
                        {showArchived ? t.News_HideArchived() : t.News_ShowArchived()}
                    </button>
                </div>
            </div>

            {/* Pagination top */}
            {totalPages > 1 && (
                <div className="px-4 pt-3">
                    <Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} total={total} loading={loading} compact />
                </div>
            )}

            {/* Content */}
            <div className={`divide-subtle ${loading ? 'opacity-50' : ''}`}>
                {items.length === 0 && !loading && (
                    <div className="px-4 py-8 text-center text-muted text-sm">
                        {t.News_Empty()}
                    </div>
                )}
                {groupConsecutive(items).map(group => (
                    <NewsGroupRow
                        key={group.first.id}
                        group={group}
                        detail={eventDetail(group.first)}
                        message={<EventMessage event={group.first} onBookSlot={handleBookSlot} />}
                        onMarkRead={markRead}
                        onArchive={archiveEvent}
                        onUnarchive={unarchiveEvent}
                    />
                ))}
            </div>

            {/* Pagination bottom */}
            {totalPages > 1 && (
                <div className="px-4 py-3 border-t border-default">
                    <Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} loading={loading} compact />
                </div>
            )}

            {bookingModal}
        </div>
    );
};
