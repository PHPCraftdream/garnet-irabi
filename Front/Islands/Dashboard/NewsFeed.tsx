import * as React from 'react';
import {useState, useEffect, useCallback} from 'react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {sendPostFormData} from '@common/Api/sendPostFormData';
import {AsyncIconButton} from '@common/Components/AsyncIconButton';
import {Archive, ArchiveRestore} from 'lucide-react';
import {formatTs} from '@common/Utils/DateUtils';
import Pagination from '@common/Components/Pagination';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {appUrl} from '@common/Utils/appUrl';
import {useSlotBooking} from '../SlotsCalendar/useSlotBooking';

interface NewsEvent {
    id: number;
    event_type: string;
    payload: Record<string, any>;
    actor_id: number;
    created_at: number;
    is_read: boolean;
    read_at: number | null;
    is_archived: boolean;
}

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

const EVENT_ICONS: Record<string, string> = {
    new_slot: 'bi-calendar-plus',
    slot_booked: 'bi-calendar-check',
    booking_confirmed: 'bi-check-circle',
    booking_rejected: 'bi-x-circle',
    support_reply: 'bi-headset',
    new_message: 'bi-chat-dots',
};

const EVENT_COLORS: Record<string, string> = {
    new_slot: 'text-accent',
    slot_booked: 'text-success',
    booking_confirmed: 'text-success',
    booking_rejected: 'text-danger',
    support_reply: 'text-warning',
    new_message: 'text-accent',
};

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
            return <><PersonLink id={p.expert_id} name={p.name} isExpert />{t.News_NewSlot_Action()}{link}</>;
        }
        case 'slot_booked':
            return <><PersonLink id={p.user_id} name={p.name} />{t.News_SlotBooked_Action()}<a href={appUrl('/expert/~slots')} className={linkCls}>{t.News_SlotBooked_Link()}</a></>;
        case 'booking_confirmed':
            return <><PersonLink id={p.expert_id} name={p.name} isExpert />{t.News_BookingConfirmed_Action()}<a href={appUrl('/bookings')} className={linkCls}>{t.News_BookingConfirmed_Link()}</a></>;
        case 'booking_rejected':
            return <><PersonLink id={p.expert_id} name={p.name} isExpert />{t.News_BookingRejected_Action()}<a href={appUrl('/bookings')} className={linkCls}>{t.News_BookingRejected_Link()}</a></>;
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

interface NewsGroup {
    first: NewsEvent;
    others: NewsEvent[];
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

function eventDetail(event: NewsEvent): string | null {
    const p = event.payload;
    if ((event.event_type === 'new_slot' || event.event_type === 'slot_booked' ||
         event.event_type === 'booking_confirmed' || event.event_type === 'booking_rejected') && p.time) {
        return formatTs(p.time) + (p.cost ? ` · ${p.cost}₽` : '');
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
                {groupConsecutive(items).map(group => {
                    const event = group.first;
                    const groupCount = group.others.length;
                    const allIds = [event.id, ...group.others.map(o => o.id)];
                    const anyUnread = !event.is_read || group.others.some(o => !o.is_read);
                    return (
                    <div
                        key={event.id}
                        className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                            anyUnread ? 'bg-accent-subtle' : ''
                        } ${event.is_archived ? 'opacity-60' : ''}`}
                        data-test-id={`news-event-${event.id}`}
                        onMouseEnter={() => {
                            const unread = allIds.filter(id => {
                                if (id === event.id) return !event.is_read;
                                const o = group.others.find(x => x.id === id);
                                return o ? !o.is_read : false;
                            });
                            if (unread.length > 0) markRead(unread);
                        }}
                    >
                        {/* Body */}
                        <div className="flex-1 min-w-0">
                            <p className={`text-sm ${anyUnread ? 'font-semibold text-on-surface' : 'text-on-surface'}`}>
                                <EventMessage event={event} onBookSlot={handleBookSlot} />
                            </p>
                            {eventDetail(event) && (
                                <p className="text-sm text-muted mt-0.5">{eventDetail(event)}</p>
                            )}
                            {groupCount > 0 && (
                                <p className="news-group-suffix" data-test-id={`news-group-suffix-${event.id}`}>
                                    {t.News_GroupSuffix([groupCount])}
                                </p>
                            )}
                            <p className="text-xs text-muted mt-1">
                                {formatTs(event.created_at)}
                                {event.is_archived && (
                                    <span className="ml-2 text-warning">{t.News_Archived()}</span>
                                )}
                            </p>
                        </div>

                        {/* Actions */}
                        <div className="flex-shrink-0 mt-0.5">
                            {event.is_archived ? (
                                <AsyncIconButton
                                    icon={<ArchiveRestore size={14} aria-hidden="true" />}
                                    label={t.News_Unarchive()}
                                    className="inline-flex items-center gap-1.5 px-2 py-1 text-sm rounded border border-accent text-accent hover:bg-accent hover:text-accent-text transition-colors"
                                    testId={`news-unarchive-${event.id}`}
                                    iconSize={14}
                                    errorToast={t.News_UnarchiveError()}
                                    onAction={() => unarchiveEvent(event.id)}
                                />
                            ) : (
                                <AsyncIconButton
                                    icon={<Archive size={14} aria-hidden="true" />}
                                    label={t.News_Archive()}
                                    className="inline-flex items-center gap-1.5 px-2 py-1 text-sm rounded border border-default text-muted hover:text-on-surface hover:bg-surface-hover transition-colors"
                                    testId={`news-archive-${event.id}`}
                                    iconSize={14}
                                    errorToast={t.News_ArchiveError()}
                                    onAction={() => archiveEvent(event.id)}
                                />
                            )}
                        </div>
                    </div>
                    );
                })}
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
