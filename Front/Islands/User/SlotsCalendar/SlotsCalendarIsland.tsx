import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {D} from '@common/Support/Debug/D';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {SlotsCalendarProps, SlotItem, SlotStatusFilter} from './State/view/types';
import type {ReadonlyFiltersState} from './State/filters/slotsCalendarSelectors';
import {SlotsCalendarFilterStore} from './State/filters/SlotsCalendarFilterStore';
import {SlotsCalendarBookingStore} from './State/calendar/SlotsCalendarBookingStore';
import {SlotsCalendarBookingActions} from './State/calendar/SlotsCalendarBookingActions';
import {SlotsCalendarView} from './State/view/slotsCalendarView';
import type {CalendarDerived} from './State/view/slotsCalendarView';
import {SlotBookingController} from './Booking/logic/SlotBookingController';
import {OwnSlotsHiddenNotice} from './OwnSlotsHiddenNotice';
import {SlotsNoMatch} from './SlotsNoMatch';
import {SlotsFilters} from './Slot/Filters/SlotsFilters';
import {SlotsStatusFilter} from './Slot/Filters/SlotsStatusFilter';
import {WeekGrid} from './Week/WeekGrid';
import {WeekNavigation} from './Week/WeekNavigation';
import {WeekSlotCount} from './Week/WeekSlotCount';
import BookingModal from './Booking/components/BookingModal';
import SlotDetailModal from './Slot/SlotDetailModal';
import {IrabiPreviewProvider} from '../../../Common/people/preview/IrabiPreviewProvider';
import {TimezoneNotice} from '@common/Components/Feedback/TimezoneNotice';
import {PageHeader} from '@common/Components/Layout/PageHeader';

import {CalendarDays} from 'lucide-react';

const slotsPageHint = t.Slots_PageHint;
type CalendarWeekGridProps = Omit<
    React.ComponentProps<typeof WeekGrid>,
    'onBookClick'
> & {
    controller: SlotBookingController;
};

class CalendarWeekGrid extends AntiHookComponent<CalendarWeekGridProps> {
    /** Открывает бронь или карточку выбранного слота. */
    private readonly selectSlot = (slot: SlotItem) => {
        const {controller, bookedIds, canBook} = this.props;
        if (canBook && !bookedIds?.has(slot.id)) controller.showBooking(slot);
        else controller.showDetail(slot);
    };

    /** Отрисовывает сетку недели с обработчиком выбора слота. */
    render() {
        const {controller: _controller, ...week} = this.props;
        return <WeekGrid {...week} onBookClick={this.selectSlot} />;
    }
}

const CALENDAR_ICON = <CalendarDays size={22} aria-hidden="true" />;

type SlotStatusesView = Readonly<Record<string, string>>;
type WeekData = CalendarDerived['weekData'];
type PagerCounts = CalendarDerived['pagerCounts'];

export class SlotsCalendarIsland extends AntiHookComponent<SlotsCalendarProps> {
    // D-198: занятия приезжали в пропсах и не менялись уже никогда. Всё
    // остальное после брони обновлялось — кнопка, баланс, список своих
    // броней, — а остаток мест на карточке оставался прежним до
    // перезагрузки. Человек видел итог собственного действия наполовину.
    // Теперь слот после мутации перечитывается с сервера: не арифметикой на
    // клиенте, а тем, что там на самом деле, — иначе чужая параллельная бронь
    // всё равно осталась бы незамеченной.
    private readonly booking = new SlotsCalendarBookingStore(this.props);
    private readonly bookingActions = new SlotsCalendarBookingActions(
        this.booking,
    );
    private readonly controller = new SlotBookingController({
        booking: this.booking,
        actions: this.bookingActions,
    });
    private readonly filterStore = new SlotsCalendarFilterStore();
    private readonly view = new SlotsCalendarView();
    // Данные острова — снимки сторов, а не вью-прокси useCarburetor:
    // `SlotsCalendarView` сравнивает входы по ссылке, а прокси пересоздаётся
    // при каждой замене корня стора (`nextWeek()`, открытие/закрытие модалки).
    // Снимок `connectSelection` меняет идентичность только вместе с
    // содержимым, поэтому производные значения и счётчики переживают и переход
    // по неделе, и модалку, пока сами слоты, брони и фильтры не изменились.
    private readonly bookingSnapshot = this.connectSelection(
        this.booking,
        state => ({
            slots: state.slots,
            bookedIds: state.bookedIds,
            slotStatuses: state.slotStatuses,
            bookingSlot: state.bookingSlot,
            detailSlot: state.detailSlot,
        }),
    );
    private readonly filterSnapshot = this.connectSelection(
        this.filterStore,
        state => ({
            filters: state.filters,
            statusFilter: state.statusFilter,
            weekOffset: state.weekOffset,
        }),
    );
    private readonly initialBooking = {
        bookingIds: {...this.props.bookedSlotBookingIds},
        currentBalance: this.props.balance ?? 0,
    };

    /** Формирует заголовок календаря. */
    private renderHeader() {
        return (
            <PageHeader
                title={this.props.title}
                subtitle={slotsPageHint()}
                icon={CALENDAR_ICON}
            />
        );
    }

    /** Формирует фильтр статуса слотов. */
    private renderStatus(
        propertyFilteredSlots: SlotItem[],
        effectiveBookedIds: Set<number>,
        slotStatuses: SlotStatusesView,
        statusFilter: SlotStatusFilter,
    ) {
        const {isModerator = false, currentAccountId} = this.props;
        return (
            <div className="slots-calendar-status">
                <SlotsStatusFilter
                    slots={propertyFilteredSlots}
                    bookedIds={effectiveBookedIds}
                    slotStatuses={slotStatuses}
                    activeFilter={statusFilter}
                    onChange={this.filterStore.setStatusFilter}
                    isModerator={isModerator}
                    currentAccountId={currentAccountId ?? 0}
                />
            </div>
        );
    }

    /** Формирует фильтры и сетку календарной недели. */
    private renderWeek(
        weekData: WeekData,
        pagerCounts: PagerCounts,
        filters: ReadonlyFiltersState,
        effectiveBookedIds: Set<number>,
        slotStatuses: SlotStatusesView,
    ) {
        const {experts, isModerator = false, canBook = false, isExpertViewer = false} = this.props;
        return (
            <div className="section-soft" data-slots-calendar-section>
                <SlotsFilters
                    filters={filters}
                    experts={experts}
                    onChange={this.filterStore.setFilters}
                />

                <div>
                    <TimezoneNotice infoOnly />
                    {isExpertViewer && <OwnSlotsHiddenNotice />}
                <WeekNavigation
                    weekStartUnix={weekData.weekStartUnix}
                    weekEndUnix={weekData.weekEndUnix}
                    onPrev={this.filterStore.previousWeek}
                    onNext={this.filterStore.nextWeek}
                    onToday={this.filterStore.today}
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
                    controller={this.controller}
                    isModerator={isModerator}
                    canBook={canBook}
                />

                {/* Slot count for current week */}
                {weekData.weekSlotCount > 0 && (
                    <WeekSlotCount count={weekData.weekSlotCount} />
                )}
                </div>
            </div>
        );
    }

    /** Отрисовывает модальные окна брони и подробностей. */
    private renderModals(
        bookingSlot: SlotItem | null,
        detailSlot: SlotItem | null,
        slots: readonly SlotItem[],
        effectiveBookedIds: Set<number>,
        slotStatuses: SlotStatusesView,
    ) {
        const {
            experts,
            csrf = '',
            bookUrl = '/slots/~book',
            quickChatUrl,
            sendUrl,
            currentAccountId,
            cancelReasons = {},
        } = this.props;
        const {bookingIds, currentBalance} = this.initialBooking;
        return (
            <>
                {bookingSlot && (
                    <BookingModal
                        controller={this.controller}
                        slot={bookingSlot}
                        allSlots={slots}
                        experts={experts}
                        bookedIds={effectiveBookedIds}
                        balance={currentBalance}
                        bookUrl={bookUrl}
                        csrf={csrf}
                        onClose={this.controller.closeBooking}
                        onBooked={this.controller.handleBooked}
                    />
                )}

                {detailSlot && (
                    <SlotDetailModal
                        slot={detailSlot}
                        experts={experts}
                        bookingStatus={
                            slotStatuses[String(detailSlot.id)] || 'pending'
                        }
                        bookingId={bookingIds[String(detailSlot.id)] || 0}
                        csrf={csrf}
                        cancelReason={cancelReasons[String(detailSlot.id)]}
                        quickChatUrl={quickChatUrl}
                        sendUrl={sendUrl}
                        currentAccountId={currentAccountId}
                        onClose={this.controller.closeDetail}
                        onCancelled={this.controller.handleCancelled}
                    />
                )}
            </>
        );
    }

    /** Передаёт отрисовку календаря отдельному методу. */
    render() {
        return this.renderCalendar();
    }

    /** Рисует календарь, фильтры и выбранные модальные окна. */
    private renderCalendar() {
        const {slots, bookedIds, slotStatuses, bookingSlot, detailSlot} = this.bookingSnapshot();
        const {filters, statusFilter, weekOffset} = this.filterSnapshot();

        D('slots-calendar.init', {
            slotCount: slots.length,
            expertCount: Object.keys(this.props.experts).length,
        });

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
        const {
            effectiveBookedIds,
            propertyFilteredSlots,
            weekData,
            pagerCounts,
            hasAnyFilteredSlots,
        } = this.view.derive(
            slots, bookedIds, slotStatuses, filters, statusFilter, weekOffset,
        );

        return (
            <IrabiPreviewProvider>
                <div data-test-id="slots-calendar">
                    {this.renderHeader()}
                    {this.renderStatus(
                        propertyFilteredSlots,
                        effectiveBookedIds,
                        slotStatuses,
                        statusFilter,
                    )}
                    {this.renderWeek(
                        weekData,
                        pagerCounts,
                        filters,
                        effectiveBookedIds,
                        slotStatuses,
                    )}

                    {/* No filtered slots at all */}
                    {!hasAnyFilteredSlots && (
                        <SlotsNoMatch onReset={this.filterStore.resetFilters} />
                    )}

                    {this.renderModals(
                        bookingSlot,
                        detailSlot,
                        slots,
                        effectiveBookedIds,
                        slotStatuses,
                    )}
                </div>
            </IrabiPreviewProvider>
        );
    }
}
