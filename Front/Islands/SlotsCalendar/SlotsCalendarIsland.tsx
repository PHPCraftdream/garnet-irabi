import * as React from 'react';
import {useState, useMemo, useCallback} from 'react';
import {D} from '@common/Support/Debug/D';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {pluralize} from '@common/Utils/Ui/pluralize';
import {SlotsCalendarProps, SlotItem, FiltersState, DayInfo, SlotStatusFilter} from './types';
import {SlotsFilters} from './SlotsFilters';
import {SlotsStatusFilter} from './SlotsStatusFilter';
import {WeekGrid} from './WeekGrid';
import {WeekNavigation} from './WeekNavigation';
import BookingModal from './BookingModal';
import SlotDetailModal from './SlotDetailModal';
import {IrabiPreviewProvider} from '../../Common/people/IrabiPreviewProvider';
import {TimezoneNotice} from '@common/Components/Feedback/TimezoneNotice';
import {PageHeader} from '@common/Components/Layout/PageHeader';
import {CalendarDays} from 'lucide-react';
import {weekStartTs, addDaysTs, tsToInputDate, tsToHour} from '@common/Utils/Time/DateUtils';
import {refreshLiveCounts} from '@common/Utils/Data/liveCounts';
import {sendPost} from '@common/Api/Send/sendPost';
import {appUrl} from '@common/Utils/Url/appUrl';

function buildWeekDays(weekStartUnix: number, nowSec: number): DayInfo[] {
    const todayStr = tsToInputDate(nowSec);
    const days: DayInfo[] = [];
    for (let i = 0; i < 7; i++) {
        const dayTs = addDaysTs(weekStartUnix, i);
        const dateStr = tsToInputDate(dayTs);
        const dayNum = dateStr.slice(8, 10);
        days.push({
            dayTs,
            dayOfWeek: i, // 0 = Sun, deterministic since week starts Sunday
            dateStr,
            dayNum,
            isToday: dateStr === todayStr,
            isPast: dateStr < todayStr,
        });
    }
    return days;
}

const DEFAULT_FILTERS: FiltersState = {
    expertIds: new Set(),
    priceMin: '',
    priceMax: '',
    timeOfDay: 'all',
    slotType: 'all',
    onlineFilter: 'all',
};

const SlotsCalendarIslandInner: React.FC<SlotsCalendarProps> = ({slots: initialSlots, experts, title, bookedSlotIds = [], bookedSlotStatuses = {}, bookedSlotBookingIds = {}, csrf = '', balance = 0, bookUrl = '/slots/~book', isModerator = false, canBook = false, isExpertViewer = false, quickChatUrl, sendUrl, currentAccountId, cancelReasons = {}}) => {
    // D-198: занятия приезжали в пропсах и не менялись уже никогда. Всё
    // остальное после брони обновлялось — кнопка, баланс, список своих
    // броней, — а остаток мест на карточке оставался прежним до
    // перезагрузки. Человек видел итог собственного действия наполовину.
    // Теперь слот после мутации перечитывается с сервера: не арифметикой на
    // клиенте, а тем, что там на самом деле, — иначе чужая параллельная бронь
    // всё равно осталась бы незамеченной.
    const [slots, setSlots] = useState<SlotItem[]>(initialSlots);
    const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS);
    const [bookingSlot, setBookingSlot] = useState<SlotItem | null>(null);
    const [detailSlot, setDetailSlot] = useState<SlotItem | null>(null);
    const [bookedIds, setBookedIds] = useState<Set<number>>(() => new Set(bookedSlotIds));
    const [slotStatuses, setSlotStatuses] = useState<Record<string, string>>(() => ({...bookedSlotStatuses}));
    const [bookingIds, _setBookingIds] = useState<Record<string, number>>(() => ({...bookedSlotBookingIds}));
    const [currentBalance, _setCurrentBalance] = useState(balance);
    const [weekOffset, setWeekOffset] = useState(0);
    // Everyone defaults to "all" (free slots of others + the viewer's own bookings).
    const [statusFilter, setStatusFilter] = useState<SlotStatusFilter>('all');

    /**
     * Перечитать одно занятие после действия над ним (D-198).
     *
     * Сервер, а не арифметика на клиенте: пока мы бронировали, место мог
     * занять кто-то ещё, и прибавленная руками единица показала бы неправду
     * увереннее, чем устаревшее число. Молчаливый отказ здесь — это ровно то
     * поведение, что было до правки (значение останется прежним до
     * перезагрузки), поэтому ошибку не показываем: она сама по себе ничего
     * человеку не даёт, а действие его уже состоялось.
     */
    const refreshSlot = useCallback(async (slotId: number) => {
        try {
            const res = await sendPost<{slot_id: number}, {slot?: SlotItem; error?: string}>(
                appUrl('/slots/~slotCard'), {slot_id: slotId}
            );
            const data = ('data' in res && res.data ? res.data : res) as {slot?: SlotItem; error?: string};
            if (!data.slot) return;

            setSlots(prev => prev.map(s => (s.id === slotId ? {...s, ...data.slot} : s)));
        } catch {
            // см. комментарий выше
        }
    }, []);

    D('slots-calendar.init', {slotCount: slots.length, expertCount: Object.keys(experts).length});

    // D-159: `bookedIds` (from `bookedSlotIds`) is deliberately a full
    // lifetime history — the server includes cancelled/completed bookings so
    // old ones stay visible on the calendar. But a slot the server has
    // already reopened (BookingsController::post__cancel flips it back to
    // 'free' once nobody active holds it) must stop being "mine" once my
    // only claim on it is that stale cancellation — otherwise the card is
    // frozen on a dead-end "Отменён" status forever, with no way back to a
    // book button, even though the exact same slot books fine from the
    // expert's public profile (which never remembers the cancellation at
    // all). Any other status (pending/confirmed/completed) still blocks —
    // those really do own the slot right now.
    const slotStatusById = useMemo(() => {
        const m = new Map<number, string>();
        for (const s of slots) m.set(s.id, s.status);
        return m;
    }, [slots]);
    const effectiveBookedIds = useMemo(() => {
        const result = new Set<number>();
        for (const id of bookedIds) {
            const bookingStatus = slotStatuses[String(id)];
            if (bookingStatus === 'cancelled' && slotStatusById.get(id) === 'free') continue;
            result.add(id);
        }
        return result;
    }, [bookedIds, slotStatuses, slotStatusById]);

    // Filter slots client-side (property filters)
    const propertyFilteredSlots = useMemo(() => {
        return slots.filter(slot => {
            if (filters.expertIds.size > 0 && !filters.expertIds.has(String(slot.expert_id))) return false;
            if (filters.priceMin !== '') { const min = Number(filters.priceMin); if (!isNaN(min) && slot.cost < min) return false; }
            if (filters.priceMax !== '') { const max = Number(filters.priceMax); if (!isNaN(max) && slot.cost > max) return false; }
            if (filters.timeOfDay !== 'all') {
                const hour = tsToHour(slot.start_at);
                if (filters.timeOfDay === 'morning' && hour >= 12) return false;
                if (filters.timeOfDay === 'day' && (hour < 12 || hour >= 17)) return false;
                if (filters.timeOfDay === 'evening' && hour < 17) return false;
            }
            // onlineFilter: 'all', 'online', or 'offline'
            if (filters.onlineFilter !== 'all') {
                if (filters.onlineFilter === 'online' && !slot.is_online) return false;
                if (filters.onlineFilter === 'offline' && slot.is_online) return false;
            }
            // D-149: the "Тип" filter existed on screen but never actually
            // filtered anything — a group option wasn't even offered.
            if (filters.slotType !== 'all') {
                const isGroup = (slot.max_users || 1) > 1;
                if (filters.slotType === 'individual' && isGroup) return false;
                if (filters.slotType === 'group' && !isGroup) return false;
            }
            return true;
        });
    }, [slots, filters]);

    // Apply status filter on top of property filters
    const filteredSlots = useMemo(() => {
        if (statusFilter === 'all') return propertyFilteredSlots;
        const nowSec = Math.floor(Date.now() / 1000);
        return propertyFilteredSlots.filter(slot => {
            const isBooked = effectiveBookedIds.has(slot.id);
            if (statusFilter === 'free') return !isBooked;
            if (statusFilter === 'mine') return isBooked;
            if (!isBooked) return false;
            const bookingStatus = slotStatuses[String(slot.id)] || '';
            if (statusFilter === 'past') {
                return slot.start_at < nowSec && bookingStatus !== 'cancelled';
            }
            return bookingStatus === statusFilter;
        });
    }, [propertyFilteredSlots, statusFilter, effectiveBookedIds, slotStatuses]);

    // Build current week data (all timestamps resolved in the user's TZ)
    const weekData = useMemo(() => {
        const nowSec = Math.floor(Date.now() / 1000);
        const currentWeekStart = weekStartTs(nowSec);
        const wsUnix = addDaysTs(currentWeekStart, weekOffset * 7);
        const weekEndUnix = addDaysTs(wsUnix, 7);
        const days = buildWeekDays(wsUnix, nowSec);

        const slotsByDay = new Map<string, SlotItem[]>();
        for (const day of days) slotsByDay.set(day.dateStr, []);

        for (const slot of filteredSlots) {
            if (slot.start_at >= wsUnix && slot.start_at < weekEndUnix) {
                const key = tsToInputDate(slot.start_at);
                const arr = slotsByDay.get(key);
                if (arr) arr.push(slot);
            }
        }
        for (const arr of slotsByDay.values()) arr.sort((a, b) => a.start_at - b.start_at);

        const weekSlotCount = [...slotsByDay.values()].reduce((sum, arr) => sum + arr.length, 0);

        return { weekStartUnix: wsUnix, weekEndUnix, days, slotsByDay, weekSlotCount };
    }, [filteredSlots, weekOffset]);

    // Check if any filtered slots exist at all (across all time)
    const hasAnyFilteredSlots = filteredSlots.length > 0;

    // Out-of-window counts for the pager hint: free (bookable) + mine (my active
    // bookings), in the weeks before / after the visible one. Property filters
    // apply; the status tab does not (the hint shows the full picture).
    const pagerCounts = useMemo(() => {
        const ws = weekData.weekStartUnix, we = weekData.weekEndUnix;
        const blank = () => ({free: 0, mine: 0});
        const prev = blank(), next = blank(), now = blank();
        for (const s of propertyFilteredSlots) {
            const mine = effectiveBookedIds.has(s.id) && (slotStatuses[String(s.id)] || '') !== 'cancelled';
            const free = !effectiveBookedIds.has(s.id) && s.status === 'free';
            if (!mine && !free) continue;
            const bucket = s.start_at < ws ? prev : (s.start_at >= we ? next : now);
            if (mine) bucket.mine++; else bucket.free++;
        }
        const toItems = (c: {free: number; mine: number}) => [
            {key: 'free', count: c.free, label: t.Slots_FilterFree(), cls: 'cal-nav-badge--free'},
            {key: 'mine', count: c.mine, label: t.Slots_FilterMine(), cls: 'cal-nav-badge--mine'},
        ];
        return {prev: toItems(prev), next: toItems(next), now: toItems(now)};
    }, [propertyFilteredSlots, weekData.weekStartUnix, weekData.weekEndUnix, effectiveBookedIds, slotStatuses]);

    const handlePrev = useCallback(() => setWeekOffset(o => o - 1), []);
    const handleNext = useCallback(() => setWeekOffset(o => o + 1), []);
    const handleToday = useCallback(() => setWeekOffset(0), []);

    const handleSlotClick = useCallback((slot: SlotItem) => {
        const isBooked = effectiveBookedIds.has(slot.id);
        if (isBooked) {
            setDetailSlot(slot);
        } else if (canBook) {
            setBookingSlot(slot);
        } else {
            setDetailSlot(slot);
        }
    }, [effectiveBookedIds, canBook]);

    return (
        <div data-test-id="slots-calendar">
            <PageHeader
                title={title}
                subtitle={t.Slots_PageHint()}
                icon={<CalendarDays size={22} aria-hidden="true" />}
            />

            <div className="mb-4">
                <SlotsStatusFilter
                    slots={propertyFilteredSlots}
                    bookedIds={effectiveBookedIds}
                    slotStatuses={slotStatuses}
                    activeFilter={statusFilter}
                    onChange={setStatusFilter}
                    isModerator={isModerator}
                    currentAccountId={currentAccountId ?? 0}
                />
            </div>

            <div className="section-soft space-y-5">
                <SlotsFilters
                    filters={filters}
                    experts={experts}
                    onChange={setFilters}
                />

                <div>
                    <TimezoneNotice infoOnly />
                    {isExpertViewer && (
                        <p className="text-sm text-secondary mb-3" data-test-id="own-slots-hidden-notice">
                            {t.Slots_OwnHiddenNotice()}
                        </p>
                    )}
                <WeekNavigation
                    weekStartUnix={weekData.weekStartUnix}
                    weekEndUnix={weekData.weekEndUnix}
                    onPrev={handlePrev}
                    onNext={handleNext}
                    onToday={handleToday}
                    prevCounts={pagerCounts.prev}
                    nextCounts={pagerCounts.next}
                    weekCounts={pagerCounts.now}
                />

                <WeekGrid
                    days={weekData.days}
                    slotsByDay={weekData.slotsByDay}
                    experts={experts}
                    bookedIds={effectiveBookedIds}
                    slotStatuses={slotStatuses}
                    onBookClick={handleSlotClick}
                    isModerator={isModerator}
                    canBook={canBook}
                />

                {/* Slot count for current week */}
                {weekData.weekSlotCount > 0 && (
                    <div className="text-xs text-muted text-right mt-3" data-test-id="week-slot-count">
                        {pluralize(weekData.weekSlotCount, t.Slot_Plural_1(), t.Slot_Plural_2(), t.Slot_Plural_5())}
                    </div>
                )}
                </div>
            </div>

            {/* No filtered slots at all */}
            {!hasAnyFilteredSlots && (
                <div className="text-center text-muted py-8 mt-4" data-test-id="slots-no-match">
                    <div className="text-lg mb-2">{t.Slots_NoMatch()}</div>
                    <button
                        type="button"
                        className="text-sm text-accent hover:text-accent-hover underline"
                        onClick={() => setFilters(DEFAULT_FILTERS)}
                        data-test-id="slots-reset-filters"
                    >
                        {t.Slot_Reset()}
                    </button>
                </div>
            )}

            {bookingSlot && (
                <BookingModal
                    slot={bookingSlot}
                    allSlots={slots}
                    experts={experts}
                    bookedIds={effectiveBookedIds}
                    balance={currentBalance}
                    bookUrl={bookUrl}
                    csrf={csrf}
                    onClose={() => setBookingSlot(null)}
                    onBooked={() => {
                        // After booking, add slot to booked set with pending status
                        setBookedIds(prev => new Set([...prev, bookingSlot.id]));
                        setSlotStatuses(prev => ({...prev, [String(bookingSlot.id)]: 'pending'}));
                        setBookingSlot(null);
                        // The cost has just left the account; the header still
                        // shows what it held when the page loaded.
                        refreshLiveCounts();
                        // Занятость слота изменило то же самое действие — и
                        // до этой правки она единственная оставалась прежней
                        // до перезагрузки (D-198).
                        void refreshSlot(bookingSlot.id);
                    }}
                />
            )}

            {detailSlot && (
                <SlotDetailModal
                    slot={detailSlot}
                    experts={experts}
                    bookingStatus={slotStatuses[String(detailSlot.id)] || 'pending'}
                    bookingId={bookingIds[String(detailSlot.id)] || 0}
                    csrf={csrf}
                    cancelReason={cancelReasons[String(detailSlot.id)]}
                    quickChatUrl={quickChatUrl}
                    sendUrl={sendUrl}
                    currentAccountId={currentAccountId}
                    onClose={() => setDetailSlot(null)}
                    onCancelled={(slotId) => {
                        setSlotStatuses(prev => ({...prev, [String(slotId)]: 'cancelled'}));
                        setDetailSlot(null);
                        // Отмена освободила место — и деньги вернулись.
                        // Обе половины результата обновляются вместе.
                        refreshLiveCounts();
                        void refreshSlot(slotId);
                    }}
                />
            )}
        </div>
    );
};

export const SlotsCalendarIsland: React.FC<SlotsCalendarProps> = (props) => (
    <IrabiPreviewProvider>
        <SlotsCalendarIslandInner {...props} />
    </IrabiPreviewProvider>
);
