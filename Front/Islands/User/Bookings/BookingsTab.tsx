import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
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
import {RescheduleModal} from './RescheduleModal';
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
import {BookingsNavigation, BookingsStateStore, type BookingsState} from './bookingsTabState';
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

/**
 * Список броней — общий для ученика и преподавателя, различаются только
 * `viewAs` и набор действий.
 *
 * Разметка живёт в `card/`. Здесь — загрузка страницы, два окна с причиной и
 * три действия над бронью.
 */
function findBooking(bookings: Booking[], id: number | null): Booking | undefined {
    return bookings.find(booking => booking.id === id);
}

type WithSending = ReturnType<typeof useSending>['withSending'];
interface ViewProps {
    state: BookingsState;
    store: BookingsStateStore;
    navigation: BookingsNavigation;
    currentTitle: BookingsTabProps['title'];
    canSwitchView: boolean;
    isModerator: boolean;
    confirmUrl: string;
    rejectUrl: string;
    cancelSending: boolean;
    rejectSending: boolean;
    rescheduleSending: boolean;
    withCancelSending: WithSending;
    withRejectSending: WithSending;
    withRescheduleSending: WithSending;
}

class BookingsView extends AntiHookComponent<ViewProps> {
    /** Состояние брони по её номеру — для окон, которым дана только ссылка. */
    private statusOf(bookingId: number | null): string | undefined {
        return findBooking(this.props.state.bookings, bookingId)?.status;
    }

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
        const {navigation, state: {page}} = this.props;
        await navigation.fetchPage(page);
        refreshLiveCounts();
    }

    private readonly handleCancelSubmit = (reason: string) => {
        const {store, withCancelSending, state: {cancelBookingId}} = this.props;
        const cancelStatus = this.statusOf(cancelBookingId);
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
        const {store, rejectUrl, withRejectSending, state: {rejectBookingId}} = this.props;
        const rejectStatus = this.statusOf(rejectBookingId);
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
        const {store, withRescheduleSending, state: {rescheduleBookingId}} = this.props;
        const bookingId = rescheduleBookingId;
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

    private readonly renderGroup = (group: ReturnType<typeof groupBookings>[number]) => {
        const {store, isModerator, state: {slots, experts, users, viewAs, confirmingId}} = this.props;
        return (
            <BookingGroup
                key={group.key}
                group={group}
                slots={slots}
                experts={experts}
                users={users}
                viewAs={viewAs}
                isModerator={isModerator}
                onCancelOpen={store.setCancelBookingId}
                onConfirm={this.handleConfirm}
                onReject={store.setRejectBookingId}
                onRescheduleOpen={store.setRescheduleBookingId}
                confirmingId={confirmingId}
            />
        );
    };

    private renderGroups() {
        const {bookings, slots} = this.props.state;
        const groups = groupBookings(bookings, slots);
        return (
            <div className="bookings-groups">
                {bookings.length === 0 && <p className="booking-list-empty">{t.Booking_UserNoBookings()}</p>}
                {groups.map(this.renderGroup)}
            </div>
        );
    }

    private renderModals() {
        const {store, cancelSending, rejectSending, rescheduleSending,
            state: {bookings, slots, cancelBookingId, rejectBookingId, rescheduleBookingId, rescheduleError}} = this.props;
        return (
            <>
                <ReasonModal
                    open={cancelBookingId !== null}
                    title={actionTitle('user', this.statusOf(cancelBookingId))}
                    impact={actionImpact('user', this.statusOf(cancelBookingId))}
                    details={<CancelRefundDetails booking={findBooking(bookings, cancelBookingId)} slots={slots} />}
                    reasonLabel={actionReasonLabel('user', this.statusOf(cancelBookingId))}
                    reasonPlaceholder={actionReasonPlaceholder('user', this.statusOf(cancelBookingId))}
                    requiredMessage={t.User_Cancel_ReasonRequired()}
                    submitLabel={actionSubmitLabel('user', this.statusOf(cancelBookingId))}
                    sending={cancelSending}
                    testId="user-cancel-modal"
                    onSubmit={this.handleCancelSubmit}
                    onClose={store.closeCancel}
                />

                <ReasonModal
                    open={rejectBookingId !== null}
                    title={actionTitle('expert', this.statusOf(rejectBookingId))}
                    impact={actionImpact('expert', this.statusOf(rejectBookingId))}
                    reasonLabel={actionReasonLabel('expert', this.statusOf(rejectBookingId))}
                    reasonPlaceholder={actionReasonPlaceholder('expert', this.statusOf(rejectBookingId))}
                    requiredMessage={t.Booking_RejectReasonRequired()}
                    submitLabel={actionSubmitLabel('expert', this.statusOf(rejectBookingId))}
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

    private renderViewSwitch() {
        const {canSwitchView, state: {viewAs}} = this.props;
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

    render() {
        const {currentTitle, navigation, state: {page, totalPages, total, pageLoading, counts, statusFilter, showPast}} = this.props;
        const {handlePageChange, handleStatusChange, handleTogglePast} = navigation;
        const pager = (
            <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                loading={pageLoading}
                onPageChange={handlePageChange}
                labels={paginationLabels}
            />
        );
        return (
            <div data-test-id="bookings-tab">
                {this.renderViewSwitch()}

                <BookingsFilterTabs
                    title={currentTitle}
                    counts={counts}
                    statusFilter={statusFilter}
                    showPast={showPast}
                    onStatusChange={handleStatusChange}
                    onTogglePast={handleTogglePast}
                />

                <div className="bookings-pager-top">{pager}</div>

                {this.renderGroups()}

                <div className="bookings-pager-bottom">{pager}</div>

                {this.renderModals()}
            </div>
        );
    }
}

const BookingsTab: React.FC<BookingsTabProps> = ({
    bookingsPagination,
    bookingsPageUrl,
    slots: initialSlots,
    experts: initialExperts,
    users: initialUsers,
    viewAs: initialViewAs = 'user',
    canSwitchView = false,
    confirmUrl = appUrl('/expert/~confirmBooking'),
    rejectUrl = appUrl('/expert/~cancelBooking'),
    title,
    isModerator = false,
    initialStatus = 'all',
    initialShowPast = false,
    initialCounts,
}) => {
    const storeRef = React.useRef<BookingsStateStore | null>(null);
    if (!storeRef.current) {
        storeRef.current = new BookingsStateStore({
            bookings: bookingsPagination.items, page: bookingsPagination.page,
            totalPages: bookingsPagination.totalPages, total: bookingsPagination.total,
            pageLoading: false, slots: initialSlots, experts: initialExperts, users: initialUsers || {},
            viewAs: initialViewAs, statusFilter: initialStatus, showPast: initialShowPast,
            counts: initialCounts || {all: bookingsPagination.total, pending: 0, confirmed: 0, cancelled: 0, completed: 0, past: 0},
            cancelBookingId: null, rejectBookingId: null, rescheduleBookingId: null,
            rescheduleError: undefined, confirmingId: null,
        });
    }
    const store = storeRef.current;
    const state = React.useSyncExternalStore(store.subscribeReact, store.snapshot, store.snapshot);
    const {viewAs} = state;
    const {sending: cancelSending, withSending: withCancelSending} = useSending();
    const {sending: rejectSending, withSending: withRejectSending} = useSending();
    const {sending: rescheduleSending, withSending: withRescheduleSending} = useSending();

    const navigation = React.useMemo(
        () => new BookingsNavigation(store, bookingsPageUrl), [store, bookingsPageUrl],
    );

    // Заголовок приходит с сервера для первой отрисовки, но после переключения
    // стороны он обязан меняться вместе с содержимым — иначе «Входящие брони»
    // окажется над списком собственных занятий.
    const currentTitle = canSwitchView
        ? (viewAs === 'expert' ? t.Bookings_IncomingTitle() : t.Bookings_Title())
        : title;

    return <BookingsView {...{state, store, navigation, currentTitle, canSwitchView, isModerator, confirmUrl, rejectUrl,
        cancelSending, rejectSending, rescheduleSending, withCancelSending, withRejectSending, withRescheduleSending}} />;

};

export default BookingsTab;
