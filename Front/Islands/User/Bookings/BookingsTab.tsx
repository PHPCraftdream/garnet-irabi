import * as React from 'react';
import {AntiHookComponent, type TReadonly} from '@react-carburetor/core';
import {D} from '@common/Support/Debug/D';
import {useSending} from '@common/hooks/data/useSending';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {sendPost} from '@common/Api/Send/sendPost';
import {PageResponse} from '@common/hooks/data/usePagination';
import Pagination from '@common/Components/Layout/Paging/Pagination';
import {appUrl} from '@common/Utils/Url/appUrl';
import {refreshLiveCounts} from '@common/Utils/Data/liveCounts';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {
    actionImpact,
    actionReasonLabel,
    actionReasonPlaceholder,
    actionSubmitLabel,
    actionSuccessToast,
    actionTitle,
} from '../../../Common/booking/bookingAction';
import {ReasonModal} from '../../../Common/Components/ReasonModal';
import {RescheduleModal} from './forms/RescheduleModal';
import {CancelRefundDetails} from './card/cancel/CancelRefundDetails';
import {
    Booking,
    BookingCounts,
    BookingsViewAs,
    ExpertInfo,
    SlotInfo,
    StatusFilter,
    UserInfo,
    groupBookings,
} from './card/bookingCardTypes';
import {BookingGroup} from './card/BookingGroup';
import {
    BookingsNavigation, BookingsStateStore, readBookingsPage,
    type BookingsPageData, type BookingsState,
} from './bookingsTabState';
import {BookingsFilterTabs} from './card/BookingsFilterTabs';

export type {SlotInfo, ExpertInfo, UserInfo, BookingCounts, BookingsViewAs} from './card/bookingCardTypes';

export interface BookingsTabProps {
    bookingsPagination: PageResponse<Booking>;
    bookingsPageUrl: string;
    slots: Record<number, SlotInfo>;
    experts: Record<number, ExpertInfo>;
    users?: Record<number, UserInfo>;
    viewAs?: BookingsViewAs;
    /** D-184: преподавателю доступны обе стороны — свои занятия и входящие заявки. */
    canSwitchView?: boolean;
    confirmUrl?: string;
    rejectUrl?: string;
    title: string;
    isModerator?: boolean;
    initialStatus?: StatusFilter;
    initialShowPast?: boolean;
    initialCounts?: BookingCounts;
}

const paginationLabels = {
    prev: t.Pagination_Prev(),
    next: t.Pagination_Next(),
    of: t.Pagination_Of(),
    items: t.Pagination_Items(),
};

function findBooking(bookings: readonly Booking[], id: number | null): Booking | undefined {
    return bookings.find(booking => booking.id === id);
}

/** Состояние брони по её номеру — для окон, которым дана только ссылка. */
function statusOf(bookings: readonly Booking[], bookingId: number | null): string | undefined {
    return findBooking(bookings, bookingId)?.status;
}

type WithSending = ReturnType<typeof useSending>['withSending'];

/** Три независимых флага отправки: у отмены, отказа и переноса свои. */
interface SendingProps {
    cancelSending: boolean;
    rejectSending: boolean;
    rescheduleSending: boolean;
    withCancelSending: WithSending;
    withRejectSending: WithSending;
    withRescheduleSending: WithSending;
}

/** Значения из BookingsTabProps, которые после монтирования не меняются. */
interface StaticProps {
    title: BookingsTabProps['title'];
    canSwitchView: boolean;
    isModerator: boolean;
    confirmUrl: string;
    rejectUrl: string;
}

/** То, из чего собирается начальное состояние: раньше это читалось в useRef. */
interface InitialProps {
    bookingsPagination: PageResponse<Booking>;
    bookingsPageUrl: string;
    slots: Record<number, SlotInfo>;
    experts: Record<number, ExpertInfo>;
    users: Record<number, UserInfo>;
    viewAs: BookingsViewAs;
    statusFilter: StatusFilter;
    showPast: boolean;
    counts: BookingCounts;
}

type TabProps = StaticProps & InitialProps & SendingProps;

interface ViewProps extends StaticProps, SendingProps {
    store: BookingsStateStore;
    navigation: BookingsNavigation;
}

function initialState(props: InitialProps): BookingsState {
    const {bookingsPagination, slots, experts, users, viewAs, statusFilter, showPast, counts} = props;
    return {
        bookings: bookingsPagination.items, page: bookingsPagination.page,
        totalPages: bookingsPagination.totalPages, total: bookingsPagination.total,
        pageLoading: false, slots, experts, users, viewAs, statusFilter, showPast, counts,
        cancelBookingId: null, rejectBookingId: null, rescheduleBookingId: null,
        rescheduleError: undefined, confirmingId: null,
    };
}

/**
 * Список броней — общий для ученика и преподавателя, различаются только
 * `viewAs` и набор действий.
 *
 * Разметка живёт в `card/`. Здесь — загрузка страницы, два окна с причиной и
 * три действия над бронью.
 */
class BookingsView extends AntiHookComponent<ViewProps> {
    /**
     * После действия страница перечитывается целиком, а не правится на месте.
     *
     * Дописанная вручную строка — это догадка о том, что стало на сервере, и
     * она была неполной: причина отмены, роль отменившего и счётчики вкладок
     * оставались прежними, и человек видел голое «Отменён» до перезагрузки
     * (нашёл user-2). Заодно обновляется цифра в шапке: она попала на страницу
     * один раз при рендере, а деньги только что вернулись.
     */
    private async refreshAfterAction(): Promise<void> {
        const {navigation, store} = this.props;
        await navigation.fetchPage(store.getData().page);
        refreshLiveCounts();
    }

    private readonly handleCancelSubmit = (reason: string) => {
        const {store, withCancelSending} = this.props;
        const {cancelBookingId, bookings} = store.getData();
        const cancelStatus = statusOf(bookings, cancelBookingId);
        withCancelSending(async () => {
            D('booking.cancel', {bookingId: cancelBookingId, reason});
            try {
                const res = await sendPost<{reason: string}, {error?: string}>(
                    appUrl(`/bookings/id~${cancelBookingId}/~cancel`),
                    {reason},
                );
                const data = ('data' in res && res.data) ? res.data : (res as unknown as {error?: string});
                if (data?.error) {
                    showToast(data.error, 'danger');
                    return;
                }
                showToast(actionSuccessToast('user', cancelStatus), 'success');
                store.setCancelBookingId(null);
                await this.refreshAfterAction();
            } catch (err) {
                D('booking.error', {action: 'cancel', bookingId: cancelBookingId, error: err});
                showToast(t.General_Error(), 'danger');
            }
        });
    };

    private readonly handleRejectSubmit = (reason: string) => {
        const {store, rejectUrl, withRejectSending} = this.props;
        const {rejectBookingId, bookings} = store.getData();
        const rejectStatus = statusOf(bookings, rejectBookingId);
        withRejectSending(async () => {
            try {
                const csrf = (window as any).__GARNET_CSRF__ ?? '';
                const res = await sendPost<{booking_id: number | null; reason: string; CSRF_TOKEN: string}, {error?: string}>(
                    rejectUrl,
                    {booking_id: rejectBookingId, reason, CSRF_TOKEN: csrf},
                );
                const data = ('data' in res && res.data) ? res.data : (res as unknown as {error?: string});
                if (data?.error) {
                    showToast(data.error, 'danger');
                    return;
                }
                showToast(actionSuccessToast('expert', rejectStatus), 'success');
                store.setRejectBookingId(null);
                await this.refreshAfterAction();
            } catch (err) {
                D('booking.error', {action: 'reject', bookingId: rejectBookingId, error: err});
                showToast(t.General_Error(), 'danger');
            }
        });
    };

    private readonly handleRescheduleSubmit = (slotId: number) => {
        const {store, withRescheduleSending} = this.props;
        const bookingId = store.getData().rescheduleBookingId;
        store.setRescheduleError(undefined);
        withRescheduleSending(async () => {
            try {
                const res = await sendPost<{slot_id: number}, {error?: string; message?: string}>(
                    appUrl(`/bookings/id~${bookingId}/~reschedule`),
                    {slot_id: slotId},
                );
                const data = ('data' in res && res.data) ? res.data : (res as unknown as {error?: string; message?: string});
                if (data?.error) {
                    store.setRescheduleError(data.error);
                    return;
                }
                showToast(data?.message || t.Reschedule_Success(), 'success');
                store.setRescheduleBookingId(null);
                await this.refreshAfterAction();
            } catch (err) {
                D('booking.error', {action: 'reschedule', bookingId, error: err});
                showToast(t.General_Error(), 'danger');
            }
        });
    };

    private readonly handleConfirm = async (bookingId: number) => {
        const {store, confirmUrl} = this.props;
        if (store.getData().confirmingId !== null) return;
        store.setConfirmingId(bookingId);
        try {
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            const res = await sendPost<{booking_id: number; CSRF_TOKEN: string}, {error?: string}>(
                confirmUrl,
                {booking_id: bookingId, CSRF_TOKEN: csrf},
            );
            const data = ('data' in res && res.data) ? res.data : (res as unknown as {error?: string});
            if (data?.error) {
                showToast(data.error, 'danger');
                return;
            }
            showToast(t.Booking_ConfirmSuccess(), 'success');
            await this.refreshAfterAction();
        } catch (err) {
            D('booking.error', {action: 'confirm', bookingId, error: err});
            showToast(t.General_Error(), 'danger');
        } finally {
            store.setConfirmingId(null);
        }
    };

    private readonly viewExpert = () => this.props.navigation.handleViewChange('expert');
    private readonly viewUser = () => this.props.navigation.handleViewChange('user');

    private renderGroup(state: TReadonly<BookingsState>, page: BookingsPageData, group: ReturnType<typeof groupBookings>[number]) {
        const {store, isModerator} = this.props;
        const {viewAs, confirmingId} = state;
        return (
            <BookingGroup
                key={group.key}
                group={group}
                slots={page.slots}
                experts={page.experts}
                users={page.users}
                viewAs={viewAs}
                isModerator={isModerator}
                onCancelOpen={store.setCancelBookingId}
                onConfirm={this.handleConfirm}
                onReject={store.setRejectBookingId}
                onRescheduleOpen={store.setRescheduleBookingId}
                confirmingId={confirmingId}
            />
        );
    }

    private renderGroups(state: TReadonly<BookingsState>, page: BookingsPageData) {
        const groups = groupBookings(page.bookings, page.slots);
        return (
            <div className="bookings-groups">
                {page.bookings.length === 0 && <p className="booking-list-empty">{t.Booking_UserNoBookings()}</p>}
                {groups.map(group => this.renderGroup(state, page, group))}
            </div>
        );
    }

    private renderModals(state: TReadonly<BookingsState>, page: BookingsPageData) {
        const {store, cancelSending, rejectSending, rescheduleSending} = this.props;
        const {cancelBookingId, rejectBookingId, rescheduleBookingId, rescheduleError} = state;
        const {bookings, slots} = page;
        return (
            <>
                <ReasonModal
                    open={cancelBookingId !== null}
                    title={actionTitle('user', statusOf(bookings, cancelBookingId))}
                    impact={actionImpact('user', statusOf(bookings, cancelBookingId))}
                    details={<CancelRefundDetails booking={findBooking(bookings, cancelBookingId)} slots={slots} />}
                    reasonLabel={actionReasonLabel('user', statusOf(bookings, cancelBookingId))}
                    reasonPlaceholder={actionReasonPlaceholder('user', statusOf(bookings, cancelBookingId))}
                    requiredMessage={t.User_Cancel_ReasonRequired()}
                    submitLabel={actionSubmitLabel('user', statusOf(bookings, cancelBookingId))}
                    sending={cancelSending}
                    testId="user-cancel-modal"
                    onSubmit={this.handleCancelSubmit}
                    onClose={store.closeCancel}
                />

                <ReasonModal
                    open={rejectBookingId !== null}
                    title={actionTitle('expert', statusOf(bookings, rejectBookingId))}
                    impact={actionImpact('expert', statusOf(bookings, rejectBookingId))}
                    reasonLabel={actionReasonLabel('expert', statusOf(bookings, rejectBookingId))}
                    reasonPlaceholder={actionReasonPlaceholder('expert', statusOf(bookings, rejectBookingId))}
                    requiredMessage={t.Booking_RejectReasonRequired()}
                    submitLabel={actionSubmitLabel('expert', statusOf(bookings, rejectBookingId))}
                    sending={rejectSending}
                    testId="expert-reject-modal"
                    onSubmit={this.handleRejectSubmit}
                    onClose={store.closeReject}
                />

                <RescheduleModal
                    open={rescheduleBookingId !== null}
                    bookingId={rescheduleBookingId}
                    sending={rescheduleSending}
                    error={rescheduleError}
                    onSubmit={this.handleRescheduleSubmit}
                    onClose={store.closeReschedule}
                />
            </>
        );
    }

    private renderViewSwitch(state: TReadonly<BookingsState>) {
        const {canSwitchView} = this.props;
        const {viewAs} = state;
        if (!canSwitchView) return null;
        return (
            <div className="bookings-view-switch" data-test-id="bookings-view-switch">
                <button
                    type="button"
                    className="bookings-view-button" data-tone={viewAs === 'expert' ? 'active' : 'neutral'}
                    aria-pressed={viewAs === 'expert'}
                    data-test-id="bookings-view-expert"
                    onClick={this.viewExpert}
                >
                    {t.Bookings_IncomingTitle()}
                </button>
                <button
                    type="button"
                    className="bookings-view-button" data-tone={viewAs === 'user' ? 'active' : 'neutral'}
                    aria-pressed={viewAs === 'user'}
                    data-test-id="bookings-view-user"
                    onClick={this.viewUser}
                >
                    {t.Bookings_Title()}
                </button>
            </div>
        );
    }

    /**
     * Заголовок приходит с сервера для первой отрисовки, но после переключения
     * стороны он обязан меняться вместе с содержимым — иначе «Входящие брони»
     * окажется над списком собственных занятий.
     */
    private currentTitle(state: TReadonly<BookingsState>): string {
        const {canSwitchView, title} = this.props;
        if (!canSwitchView) return title;
        return state.viewAs === 'expert' ? t.Bookings_IncomingTitle() : t.Bookings_Title();
    }

    private renderPager(state: TReadonly<BookingsState>) {
        const {page, totalPages, total, pageLoading} = state;
        return (
            <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                loading={pageLoading}
                onPageChange={this.props.navigation.handlePageChange}
                labels={paginationLabels}
            />
        );
    }

    render() {
        const state = this.useCarburetor(this.props.store);
        const page = readBookingsPage(state);
        const {statusFilter, showPast} = state;
        const {handleStatusChange, handleTogglePast} = this.props.navigation;
        const pager = this.renderPager(state);
        return (
            <div data-test-id="bookings-tab">
                {this.renderViewSwitch(state)}

                <BookingsFilterTabs
                    title={this.currentTitle(state)}
                    counts={page.counts}
                    statusFilter={statusFilter}
                    showPast={showPast}
                    onStatusChange={handleStatusChange}
                    onTogglePast={handleTogglePast}
                />

                <div className="bookings-pager-top">{pager}</div>

                {this.renderGroups(state, page)}

                <div className="bookings-pager-bottom">{pager}</div>

                {this.renderModals(state, page)}
            </div>
        );
    }
}

/**
 * Владелец состояния раздела: хранилище и навигация — поля класса.
 *
 * Props после монтирования не меняются: раньше по ним же создавались
 * хранилище в useRef и навигация в useMemo.
 */
class BookingsTabView extends AntiHookComponent<TabProps> {
    private readonly store = new BookingsStateStore(initialState(this.props));
    private readonly navigation = new BookingsNavigation(this.store, this.props.bookingsPageUrl);

    render() {
        const {
            cancelSending, rejectSending, rescheduleSending,
            withCancelSending, withRejectSending, withRescheduleSending,
            title, canSwitchView, isModerator, confirmUrl, rejectUrl,
        } = this.props;
        return (
            <BookingsView {...{
                store: this.store, navigation: this.navigation, title, canSwitchView, isModerator, confirmUrl, rejectUrl,
                cancelSending, rejectSending, rescheduleSending, withCancelSending, withRejectSending, withRescheduleSending,
            }} />
        );
    }
}

const BookingsTab: React.FC<BookingsTabProps> = ({
    bookingsPagination,
    bookingsPageUrl,
    slots,
    experts,
    users,
    viewAs = 'user',
    canSwitchView = false,
    confirmUrl = appUrl('/expert/~confirmBooking'),
    rejectUrl = appUrl('/expert/~cancelBooking'),
    title,
    isModerator = false,
    initialStatus = 'all',
    initialShowPast = false,
    initialCounts,
}) => {
    const {sending: cancelSending, withSending: withCancelSending} = useSending();
    const {sending: rejectSending, withSending: withRejectSending} = useSending();
    const {sending: rescheduleSending, withSending: withRescheduleSending} = useSending();
    return (
        <BookingsTabView
            bookingsPagination={bookingsPagination}
            bookingsPageUrl={bookingsPageUrl}
            slots={slots}
            experts={experts}
            users={users || {}}
            viewAs={viewAs}
            statusFilter={initialStatus}
            showPast={initialShowPast}
            counts={initialCounts || {
                all: bookingsPagination.total, pending: 0, confirmed: 0, cancelled: 0, completed: 0, past: 0,
            }}
            title={title}
            canSwitchView={canSwitchView}
            isModerator={isModerator}
            confirmUrl={confirmUrl}
            rejectUrl={rejectUrl}
            cancelSending={cancelSending}
            rejectSending={rejectSending}
            rescheduleSending={rescheduleSending}
            withCancelSending={withCancelSending}
            withRejectSending={withRejectSending}
            withRescheduleSending={withRescheduleSending}
        />
    );
};

export default BookingsTab;
