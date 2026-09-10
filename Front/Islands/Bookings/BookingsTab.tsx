import * as React from 'react';
import {D} from '@common/Debug/D';
import {useSending} from '@common/hooks/useSending';
import {showToast} from '@common/Components/GlobalToast';
import {sendPost} from '@common/Api/sendPost';
import {PageResponse} from '@common/hooks/usePagination';
import Pagination from '@common/Components/Pagination';
import {appUrl} from '@common/Utils/appUrl';
import {refreshLiveCounts} from '@common/Utils/liveCounts';
import {DEFAULT_PAGE_SIZE} from '@common/Utils/pagination';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {
    actionImpact,
    actionReasonLabel,
    actionReasonPlaceholder,
    actionSubmitLabel,
    actionSuccessToast,
    actionTitle,
} from '../../Common/bookingAction';
import {ReasonModal} from '../../Common/Components/ReasonModal';
import {CancelRefundDetails} from './CancelRefundDetails';
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
import {BookingsFilterTabs} from './card/BookingsFilterTabs';

export type {SlotInfo, ExpertInfo, UserInfo, BookingCounts, BookingsViewAs} from './card/bookingCardTypes';

interface BookingsPageResponse extends PageResponse<Booking> {
    slots: Record<number, SlotInfo>;
    experts: Record<number, ExpertInfo>;
    users?: Record<number, UserInfo>;
    counts?: BookingCounts;
}

export interface BookingsTabProps {
    bookingsPagination: PageResponse<Booking>;
    bookingsPageUrl: string;
    slots: Record<number, SlotInfo>;
    experts: Record<number, ExpertInfo>;
    users?: Record<number, UserInfo>;
    viewAs?: BookingsViewAs;
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
const BookingsTab: React.FC<BookingsTabProps> = ({
    bookingsPagination,
    bookingsPageUrl,
    slots: initialSlots,
    experts: initialExperts,
    users: initialUsers,
    viewAs = 'user',
    confirmUrl = appUrl('/expert/~confirmBooking'),
    rejectUrl = appUrl('/expert/~cancelBooking'),
    title,
    isModerator = false,
    initialStatus = 'all',
    initialShowPast = false,
    initialCounts,
}) => {
    const [bookings, setBookings] = React.useState<Booking[]>(bookingsPagination.items);
    const [page, setPage] = React.useState(bookingsPagination.page);
    const [totalPages, setTotalPages] = React.useState(bookingsPagination.totalPages);
    const [total, setTotal] = React.useState(bookingsPagination.total);
    const [pageLoading, setPageLoading] = React.useState(false);
    const [slots, setSlots] = React.useState<Record<number, SlotInfo>>(initialSlots);
    const [experts, setExperts] = React.useState<Record<number, ExpertInfo>>(initialExperts);
    const [users, setUsers] = React.useState<Record<number, UserInfo>>(initialUsers || {});
    const [statusFilter, setStatusFilter] = React.useState<StatusFilter>(initialStatus);
    const [showPast, setShowPast] = React.useState<boolean>(initialShowPast);
    const [counts, setCounts] = React.useState<BookingCounts>(initialCounts || {
        all: bookingsPagination.total, pending: 0, confirmed: 0, cancelled: 0, completed: 0, past: 0,
    });

    // Окна отмены и отказа: снаружи остаётся только «какая бронь открыта».
    // Текст причины, его проверка, Escape и блокировка прокрутки живут внутри
    // ReasonModal — раньше каждое окно несло свою копию всего этого.
    const [cancelBookingId, setCancelBookingId] = React.useState<number | null>(null);
    const {sending: cancelSending, withSending: withCancelSending} = useSending();

    const [rejectBookingId, setRejectBookingId] = React.useState<number | null>(null);
    const {sending: rejectSending, withSending: withRejectSending} = useSending();

    const [confirmingId, setConfirmingId] = React.useState<number | null>(null);

    const fetchPage = React.useCallback(async (
        targetPage: number,
        opts: {status?: StatusFilter; showPast?: boolean} = {},
    ) => {
        const status = opts.status ?? statusFilter;
        const past = opts.showPast ?? showPast;
        setPageLoading(true);
        try {
            const resp = await sendPost<
                {page: number; perPage: number; status: string; showPast: boolean},
                BookingsPageResponse
            >(bookingsPageUrl, {
                page: targetPage,
                perPage: DEFAULT_PAGE_SIZE,
                status: status === 'all' ? '' : status,
                showPast: past,
            });
            const data = ('data' in resp && resp.data) ? resp.data : resp as unknown as BookingsPageResponse;
            setBookings(data.items);
            setPage(data.page);
            setTotalPages(data.totalPages);
            setTotal(data.total);
            setSlots(data.slots || {});
            setExperts(data.experts || {});
            setUsers(data.users || {});
            if (data.counts) setCounts(data.counts);
        } catch {
            showToast(t.User_LoadError(), 'danger');
        } finally {
            setPageLoading(false);
        }
    }, [bookingsPageUrl, statusFilter, showPast]);

    const handlePageChange = React.useCallback((p: number) => {
        if (p < 1 || p > totalPages || (p === page && !pageLoading)) return;
        fetchPage(p);
    }, [fetchPage, totalPages, page, pageLoading]);

    const handleStatusChange = React.useCallback((s: StatusFilter) => {
        if (s === statusFilter) return;
        setStatusFilter(s);
        fetchPage(1, {status: s});
    }, [statusFilter, fetchPage]);

    const handleTogglePast = React.useCallback(() => {
        const next = !showPast;
        setShowPast(next);
        fetchPage(1, {showPast: next});
    }, [showPast, fetchPage]);

    const groups = React.useMemo(() => groupBookings(bookings, slots), [bookings, slots]);

    /** Состояние брони по её номеру — для окон, которым дана только ссылка. */
    const statusOf = (bookingId: number | null): string | undefined =>
        bookings.find(b => b.id === bookingId)?.status;

    /**
     * После действия страница перечитывается целиком, а не правится на месте.
     *
     * Дописанная вручную строка — это догадка о том, что стало на сервере, и
     * она была неполной: причина отмены, роль отменившего и счётчики вкладок
     * оставались прежними, и человек видел голое «Отменён» до перезагрузки
     * (нашёл user-2). Заодно обновляется цифра в шапке: она попала на страницу
     * один раз при рендере, а деньги только что вернулись.
     */
    const refreshAfterAction = async () => {
        await fetchPage(page);
        refreshLiveCounts();
    };

    const handleCancelSubmit = (reason: string) => {
        const cancelStatus = statusOf(cancelBookingId);
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
                setCancelBookingId(null);
                await refreshAfterAction();
            } catch (err) {
                D('booking.error', {action: 'cancel', bookingId: cancelBookingId, error: err});
                showToast(t.General_Error(), 'danger');
            }
        });
    };

    const handleRejectSubmit = (reason: string) => {
        const rejectStatus = statusOf(rejectBookingId);
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
                setRejectBookingId(null);
                await refreshAfterAction();
            } catch (err) {
                D('booking.error', {action: 'reject', bookingId: rejectBookingId, error: err});
                showToast(t.General_Error(), 'danger');
            }
        });
    };

    const handleConfirm = async (bookingId: number) => {
        if (confirmingId !== null) return;
        setConfirmingId(bookingId);
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
            await refreshAfterAction();
        } catch (err) {
            D('booking.error', {action: 'confirm', bookingId, error: err});
            showToast(t.General_Error(), 'danger');
        } finally {
            setConfirmingId(null);
        }
    };

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
            <BookingsFilterTabs
                title={title}
                counts={counts}
                statusFilter={statusFilter}
                showPast={showPast}
                onStatusChange={handleStatusChange}
                onTogglePast={handleTogglePast}
            />

            <div className="mb-4">{pager}</div>

            <div className="flex flex-col gap-3">
                {bookings.length === 0 && <p className="text-muted">{t.Booking_UserNoBookings()}</p>}
                {groups.map(group => (
                    <BookingGroup
                        key={group.key}
                        group={group}
                        slots={slots}
                        experts={experts}
                        users={users}
                        viewAs={viewAs}
                        isModerator={isModerator}
                        onCancelOpen={setCancelBookingId}
                        onConfirm={handleConfirm}
                        onReject={setRejectBookingId}
                        confirmingId={confirmingId}
                    />
                ))}
            </div>

            <div className="mt-4">{pager}</div>

            <ReasonModal
                open={cancelBookingId !== null}
                title={actionTitle('user', statusOf(cancelBookingId))}
                impact={actionImpact('user', statusOf(cancelBookingId))}
                details={<CancelRefundDetails booking={bookings.find(b => b.id === cancelBookingId)} slots={slots} />}
                reasonLabel={actionReasonLabel('user', statusOf(cancelBookingId))}
                reasonPlaceholder={actionReasonPlaceholder('user', statusOf(cancelBookingId))}
                requiredMessage={t.User_Cancel_ReasonRequired()}
                submitLabel={actionSubmitLabel('user', statusOf(cancelBookingId))}
                sending={cancelSending}
                testId="user-cancel-modal"
                onSubmit={handleCancelSubmit}
                onClose={() => setCancelBookingId(null)}
            />

            <ReasonModal
                open={rejectBookingId !== null}
                title={actionTitle('expert', statusOf(rejectBookingId))}
                impact={actionImpact('expert', statusOf(rejectBookingId))}
                reasonLabel={actionReasonLabel('expert', statusOf(rejectBookingId))}
                reasonPlaceholder={actionReasonPlaceholder('expert', statusOf(rejectBookingId))}
                requiredMessage={t.Booking_RejectReasonRequired()}
                submitLabel={actionSubmitLabel('expert', statusOf(rejectBookingId))}
                sending={rejectSending}
                testId="expert-reject-modal"
                onSubmit={handleRejectSubmit}
                onClose={() => setRejectBookingId(null)}
            />
        </div>
    );
};

export default BookingsTab;
