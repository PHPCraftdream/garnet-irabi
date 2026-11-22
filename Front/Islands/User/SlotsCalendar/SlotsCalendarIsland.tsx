import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {useState, useMemo} from 'react';
import {D} from '@common/Support/Debug/D';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {SlotsCalendarProps, SlotItem} from './types';
import {SlotsCalendarFilterStore} from './SlotsCalendarFilterStore';
import {SlotsCalendarBookingStore} from './SlotsCalendarBookingStore';
import {SlotsCalendarBookingActions} from './SlotsCalendarBookingActions';
import {indexSlotStatuses, getEffectiveBookedIds, applyCalendarFilters, applyStatusFilter, getCalendarWeek, getPagerCounts} from './slotsCalendarSelectors';
import {OwnSlotsHiddenNotice} from './OwnSlotsHiddenNotice';
import {SlotsNoMatch} from './SlotsNoMatch';
import {SlotsFilters} from './Slot/SlotsFilters';
import {SlotsStatusFilter} from './Slot/SlotsStatusFilter';
import {WeekGrid} from './Week/WeekGrid';
import {WeekNavigation} from './Week/WeekNavigation';
import {WeekSlotCount} from './Week/WeekSlotCount';
import BookingModal from './Booking/BookingModal';
import SlotDetailModal from './Slot/SlotDetailModal';
import {IrabiPreviewProvider} from '../../../Common/people/IrabiPreviewProvider';
import {TimezoneNotice} from '@common/Components/Feedback/TimezoneNotice';
import {PageHeader} from '@common/Components/Layout/PageHeader';
import {CalendarDays} from 'lucide-react';

type CalendarWeekGridProps = Omit<React.ComponentProps<typeof WeekGrid>, 'onBookClick'> & {
    booking: SlotsCalendarBookingStore;
};

class CalendarWeekGrid extends AntiHookComponent<CalendarWeekGridProps> {
    private readonly selectSlot = (slot: SlotItem) => {
        const {booking, bookedIds, canBook} = this.props;
        if (canBook && !bookedIds?.has(slot.id)) booking.showBooking(slot);
        else booking.showDetail(slot);
    };

    render() {
        const {booking: _booking, ...week} = this.props;
        return <WeekGrid {...week} onBookClick={this.selectSlot} />;
    }
}

const CALENDAR_ICON = <CalendarDays size={22} aria-hidden="true" />;
const createFilterStore = () => new SlotsCalendarFilterStore();

const SlotsCalendarIslandInner: React.FC<SlotsCalendarProps> = (props) => {
    const {experts, title, bookedSlotBookingIds = {}, csrf = '', balance = 0, bookUrl = '/slots/~book', isModerator = false, canBook = false, isExpertViewer = false, quickChatUrl, sendUrl, currentAccountId, cancelReasons = {}} = props;
    // D-198: занятия приезжали в пропсах и не менялись уже никогда. Всё
    // остальное после брони обновлялось — кнопка, баланс, список своих
    // броней, — а остаток мест на карточке оставался прежним до
    // перезагрузки. Человек видел итог собственного действия наполовину.
    // Теперь слот после мутации перечитывается с сервера: не арифметикой на
    // клиенте, а тем, что там на самом деле, — иначе чужая параллельная бронь
    // всё равно осталась бы незамеченной.
    const [booking] = useState(() => new SlotsCalendarBookingStore(props));
    const [bookingActions] = useState(() => new SlotsCalendarBookingActions(booking));
    const {slots, bookingSlot, detailSlot, bookedIds, slotStatuses} = React.useSyncExternalStore(booking.subscribeSnapshot, booking.snapshot, booking.snapshot);
    const [filterStore] = useState(createFilterStore);
    const {filters, statusFilter, weekOffset} = React.useSyncExternalStore(filterStore.subscribe, filterStore.getSnapshot, filterStore.getSnapshot);
    const initialBooking = React.useRef<{bookingIds: Record<string, number>; currentBalance: number} | null>(null);
    if (initialBooking.current === null) {
        initialBooking.current = {bookingIds: {...bookedSlotBookingIds}, currentBalance: balance};
    }
    const {bookingIds, currentBalance} = initialBooking.current;

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
    const slotStatusById = useMemo(() => indexSlotStatuses(slots), [slots]);
    const effectiveBookedIds = useMemo(() => getEffectiveBookedIds(bookedIds, slotStatuses, slotStatusById), [bookedIds, slotStatuses, slotStatusById]);

    // Filter slots client-side (property filters)
    const propertyFilteredSlots = useMemo(() => applyCalendarFilters(slots, filters), [slots, filters]);

    // Apply status filter on top of property filters
    const filteredSlots = useMemo(() => applyStatusFilter(propertyFilteredSlots, statusFilter, effectiveBookedIds, slotStatuses), [propertyFilteredSlots, statusFilter, effectiveBookedIds, slotStatuses]);

    // Build current week data (all timestamps resolved in the user's TZ)
    const weekData = useMemo(() => getCalendarWeek(filteredSlots, weekOffset), [filteredSlots, weekOffset]);

    // Check if any filtered slots exist at all (across all time)
    const hasAnyFilteredSlots = filteredSlots.length > 0;

    // Out-of-window counts for the pager hint: free (bookable) + mine (my active
    // bookings), in the weeks before / after the visible one. Property filters
    // apply; the status tab does not (the hint shows the full picture).
    const pagerCounts = useMemo(() => getPagerCounts(propertyFilteredSlots, weekData.weekStartUnix, weekData.weekEndUnix, effectiveBookedIds, slotStatuses), [propertyFilteredSlots, weekData.weekStartUnix, weekData.weekEndUnix, effectiveBookedIds, slotStatuses]);

    return (
        <div data-test-id="slots-calendar">
            <PageHeader
                title={title}
                subtitle={t.Slots_PageHint()}
                icon={CALENDAR_ICON}
            />

            <div className="slots-calendar-status">
                <SlotsStatusFilter
                    slots={propertyFilteredSlots}
                    bookedIds={effectiveBookedIds}
                    slotStatuses={slotStatuses}
                    activeFilter={statusFilter}
                    onChange={filterStore.setStatusFilter}
                    isModerator={isModerator}
                    currentAccountId={currentAccountId ?? 0}
                />
            </div>

            <div className="section-soft" data-slots-calendar-section>
                <SlotsFilters
                    filters={filters}
                    experts={experts}
                    onChange={filterStore.setFilters}
                />

                <div>
                    <TimezoneNotice infoOnly />
                    {isExpertViewer && <OwnSlotsHiddenNotice />}
                <WeekNavigation
                    weekStartUnix={weekData.weekStartUnix}
                    weekEndUnix={weekData.weekEndUnix}
                    onPrev={filterStore.previousWeek}
                    onNext={filterStore.nextWeek}
                    onToday={filterStore.today}
                    prevCounts={pagerCounts.prev}
                    nextCounts={pagerCounts.next}
                    weekCounts={pagerCounts.now}
                />

                <CalendarWeekGrid
                    days={weekData.days}
                    slotsByDay={weekData.slotsByDay}
                    experts={experts}
                    bookedIds={effectiveBookedIds}
                    slotStatuses={slotStatuses}
                    booking={booking}
                    isModerator={isModerator}
                    canBook={canBook}
                />

                {/* Slot count for current week */}
                {weekData.weekSlotCount > 0 && (
                    <WeekSlotCount count={weekData.weekSlotCount} />
                )}
                </div>
            </div>

            {/* No filtered slots at all */}
            {!hasAnyFilteredSlots && (
                <SlotsNoMatch onReset={filterStore.resetFilters} />
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
                    onClose={booking.closeBooking}
                    onBooked={bookingActions.handleBooked}
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
                    onClose={booking.closeDetail}
                    onCancelled={bookingActions.handleCancelled}
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
