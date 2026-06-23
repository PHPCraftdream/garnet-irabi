import * as React from 'react';
import {D} from '@common/Debug/D';
import {useSending} from '@common/hooks/useSending';
import {useBodyScrollLock} from '@common/hooks/useBodyScrollLock';

import {showToast} from '@common/Components/GlobalToast';
import SendButton from '@common/Components/SendButton';
import {ExternalLink} from '@common/Components/ExternalLink';
import {Portal} from '@common/Components/Portal';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/DateUtils';
import {UniversalBadge} from '../../Common/StatusBadge';
import {translateStatus} from '../../Common/statusHelpers';
import {EntityLink, userLinks} from '../../Common/EntityLinks';
import {sendPost} from '@common/Api/sendPost';
import {PageResponse} from '@common/hooks/usePagination';
import Pagination from '@common/Components/Pagination';
import {appUrl} from '@common/Utils/appUrl';
import {DEFAULT_PAGE_SIZE} from '@common/Utils/pagination';

interface Booking {
    id: number;
    user_id?: number;
    bookable_id: number;
    bookable_type: string;
    status: string;
    created_at: number;
}

export interface SlotInfo {
    start_at: number;
    is_online: number;
    location: string;
    expert_id: number;
    cost: number;
    cancellation_penalty_percent: number;
}

export interface ExpertInfo {
    display_name: string;
}

export interface UserInfo {
    name: string;
}

export type BookingsViewAs = 'user' | 'expert';

type StatusFilter = 'all' | 'pending' | 'confirmed' | 'cancelled' | 'completed';

export interface BookingCounts {
    all: number;
    pending: number;
    confirmed: number;
    cancelled: number;
    completed: number;
    past: number;
}

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

const BookingCard: React.FC<{
    booking: Booking;
    slots: Record<number, SlotInfo>;
    experts: Record<number, ExpertInfo>;
    users: Record<number, UserInfo>;
    viewAs: BookingsViewAs;
    isModerator: boolean;
    onCancelOpen: (bookingId: number) => void;
    onConfirm: (bookingId: number) => void;
    onReject: (bookingId: number) => void;
    confirmingId: number | null;
}> = ({booking, slots, experts, users, viewAs, isModerator, onCancelOpen, onConfirm, onReject, confirmingId}) => {
    const isSlot = booking.bookable_type === 'time_slot';
    const slot   = isSlot ? slots[booking.bookable_id] : null;
    const expert = experts[(slot?.expert_id ?? 0)];
    const bookingUser = booking.user_id ? users[booking.user_id] : undefined;
    const isExpertView = viewAs === 'expert';
    const isPending = booking.status === 'pending';
    const cancellable = isPending || booking.status === 'confirmed';

    return (
        <div className="card" data-test-id={`booking-card-${booking.id}`}>
            <div className="card-body">
                <div className="flex justify-between items-start mb-2">
                    <h5 className="card-title mb-0">
                        {isSlot && slot
                            ? formatTs(slot.start_at)
                            : t.Booking_NA()}
                    </h5>
                    <span data-test-id={`booking-status-${booking.id}`}>
                        <UniversalBadge status={booking.status} label={translateStatus(booking.status)} />
                    </span>
                </div>

                {isExpertView ? (
                    bookingUser && booking.user_id ? (
                        <p className="card-text mb-1" data-test-id={`booking-user-${booking.id}`}>
                            <span className="text-muted text-sm">{t.Booking_User()}:</span>{' '}
                            <EntityLink
                                name={bookingUser.name}
                                {...userLinks(booking.user_id, false)}
                                isModerator={isModerator}
                            />
                        </p>
                    ) : null
                ) : (
                    expert && (
                        <p className="card-text mb-1" data-test-id={`booking-expert-${booking.id}`}>
                            <span className="text-muted text-sm">{t.Slot_Expert()}:</span>{' '}
                            <EntityLink
                                name={expert.display_name}
                                {...userLinks(slot?.expert_id ?? 0, true)}
                                isModerator={isModerator}
                            />
                        </p>
                    )
                )}

                {isSlot && slot && (
                    <p className="card-text mb-1">
                        <span className="text-muted text-sm">
                            {slot.is_online ? t.Slot_Online() : t.Slot_Location()}:
                        </span>{' '}
                        {slot.is_online
                            ? (slot.location
                                ? <ExternalLink href={slot.location} className="text-accent hover:underline" data-test-id={`booking-meeting-${booking.id}`}>{slot.location}</ExternalLink>
                                : <span data-test-id={`booking-meeting-${booking.id}`}>{t.Slot_Online()}</span>)
                            : <span data-test-id={`booking-meeting-${booking.id}`}>{slot.location || t.Booking_NA()}</span>
                        }
                    </p>
                )}

                <p className="card-text mb-0 text-sm text-muted">
                    {t.Booking_Created()}: {formatTs(booking.created_at)}
                </p>

                <div className="mt-3 flex items-center gap-2 flex-wrap">
                    {isExpertView ? (
                        <>
                            {isPending && (
                                <button
                                    className="btn btn-sm btn-success"
                                    data-test-id={`confirm-btn-${booking.id}`}
                                    disabled={confirmingId === booking.id}
                                    onClick={() => onConfirm(booking.id)}
                                >
                                    {t.Booking_Confirm()}
                                </button>
                            )}
                            {cancellable && (
                                <button
                                    className="btn btn-sm btn-outline-danger"
                                    data-test-id={`reject-btn-${booking.id}`}
                                    onClick={() => onReject(booking.id)}
                                >
                                    {t.Booking_Reject()}
                                </button>
                            )}
                        </>
                    ) : (
                        cancellable && (
                            <button
                                className="btn btn-sm btn-outline-danger"
                                data-test-id={`cancel-btn-${booking.id}`}
                                onClick={() => onCancelOpen(booking.id)}
                            >
                                {t.Booking_Cancel()}
                            </button>
                        )
                    )}
                </div>
            </div>
        </div>
    );
};

interface BookingGroupData {
    key: string;
    slotId: number | null;
    slot: SlotInfo | null;
    bookings: Booking[];
    sortKey: number;
}

function groupBookings(
    bookings: Booking[],
    slots: Record<number, SlotInfo>,
): BookingGroupData[] {
    const map = new Map<string, BookingGroupData>();
    for (const b of bookings) {
        const isSlot = b.bookable_type === 'time_slot';
        const key = isSlot ? `time_slot:${b.bookable_id}` : `b:${b.id}`;
        const slot = isSlot ? (slots[b.bookable_id] ?? null) : null;
        let g = map.get(key);
        if (!g) {
            g = {
                key,
                slotId: isSlot ? b.bookable_id : null,
                slot,
                bookings: [],
                sortKey: slot ? slot.start_at : b.created_at,
            };
            map.set(key, g);
        }
        g.bookings.push(b);
    }
    const arr = Array.from(map.values());
    for (const g of arr) {
        g.bookings.sort((a, c) => c.created_at - a.created_at);
    }
    arr.sort((a, c) => c.sortKey - a.sortKey);
    return arr;
}

const BookingGroup: React.FC<{
    group: BookingGroupData;
    slots: Record<number, SlotInfo>;
    experts: Record<number, ExpertInfo>;
    users: Record<number, UserInfo>;
    viewAs: BookingsViewAs;
    isModerator: boolean;
    onCancelOpen: (bookingId: number) => void;
    onConfirm: (bookingId: number) => void;
    onReject: (bookingId: number) => void;
    confirmingId: number | null;
}> = ({group, slots, experts, users, viewAs, isModerator, onCancelOpen, onConfirm, onReject, confirmingId}) => {
    const renderCard = (booking: Booking) => (
        <BookingCard
            key={booking.id}
            booking={booking}
            slots={slots}
            experts={experts}
            users={users}
            viewAs={viewAs}
            isModerator={isModerator}
            onCancelOpen={onCancelOpen}
            onConfirm={onConfirm}
            onReject={onReject}
            confirmingId={confirmingId}
        />
    );

    if (group.bookings.length === 1) {
        return renderCard(group.bookings[0]);
    }

    const slot = group.slot;
    return (
        <div className="booking-group" data-test-id={`booking-group-${group.slotId ?? group.key}`}>
            <div className="booking-group-header">
                <div>
                    <div className="booking-group-title">
                        {slot ? formatTs(slot.start_at) : t.Booking_NA()}
                    </div>
                    {slot && (
                        <div className="booking-group-meta">
                            {slot.is_online ? t.Slot_Online() : t.Slot_Location()}
                            {slot.cost ? ` · ${slot.cost} ₽` : ''}
                        </div>
                    )}
                </div>
                <span className="booking-group-count" data-test-id={`booking-group-count-${group.slotId ?? group.key}`}>
                    {t.Booking_GroupCount([group.bookings.length])}
                </span>
            </div>
            <div className="booking-group-list">
                {group.bookings.map(renderCard)}
            </div>
        </div>
    );
};

const paginationLabels = {
    prev: t.Pagination_Prev(),
    next: t.Pagination_Next(),
    of: t.Pagination_Of(),
    items: t.Pagination_Items(),
};

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
            >(
                bookingsPageUrl,
                {page: targetPage, perPage: DEFAULT_PAGE_SIZE, status: status === 'all' ? '' : status, showPast: past}
            );
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

    // Cancel modal state (user view)
    const [cancelBookingId, setCancelBookingId] = React.useState<number | null>(null);
    const [cancelReason, setCancelReason] = React.useState('');
    const [cancelReasonError, setCancelReasonError] = React.useState('');
    const {sending: cancelSending, withSending: withCancelSending} = useSending();
    useBodyScrollLock(cancelBookingId !== null);

    // Reject modal state (expert view)
    const [rejectBookingId, setRejectBookingId] = React.useState<number | null>(null);
    const [rejectReason, setRejectReason] = React.useState('');
    const [rejectReasonError, setRejectReasonError] = React.useState('');
    const {sending: rejectSending, withSending: withRejectSending} = useSending();
    useBodyScrollLock(rejectBookingId !== null);

    // Confirm sending state
    const [confirmingId, setConfirmingId] = React.useState<number | null>(null);

    const groups = React.useMemo(() => groupBookings(bookings, slots), [bookings, slots]);

    const handleCancelOpen = (bookingId: number) => {
        setCancelBookingId(bookingId);
        setCancelReason('');
        setCancelReasonError('');
    };

    const handleCancelClose = () => {
        setCancelBookingId(null);
        setCancelReason('');
        setCancelReasonError('');
    };

    const handleRejectOpen = (bookingId: number) => {
        setRejectBookingId(bookingId);
        setRejectReason('');
        setRejectReasonError('');
    };

    const handleRejectClose = () => {
        setRejectBookingId(null);
        setRejectReason('');
        setRejectReasonError('');
    };

    // Close on Escape
    React.useEffect(() => {
        const open = cancelBookingId !== null || rejectBookingId !== null;
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (cancelBookingId !== null) handleCancelClose();
                if (rejectBookingId !== null) handleRejectClose();
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [cancelBookingId, rejectBookingId]);

    const handleCancelSubmit = () => {
        if (!cancelReason.trim()) {
            setCancelReasonError(t.User_Cancel_ReasonRequired());
            return;
        }
        withCancelSending(async () => {
            D('booking.cancel', {bookingId: cancelBookingId, reason: cancelReason});
            try {
                const res = await sendPost<{reason: string}, {error?: string}>(
                    appUrl(`/bookings/id~${cancelBookingId}/~cancel`),
                    {reason: cancelReason.trim()},
                );
                const data = ('data' in res && res.data) ? res.data : (res as unknown as {error?: string});
                if (data?.error) {
                    showToast(data.error, 'danger');
                } else {
                    setBookings(prev => prev.map(b =>
                        b.id === cancelBookingId ? {...b, status: 'cancelled'} : b
                    ));
                    showToast(t.User_Cancel_Success(), 'success');
                    handleCancelClose();
                }
            } catch (err) {
                D('booking.error', {action: 'cancel', bookingId: cancelBookingId, error: err});
                showToast(t.General_Error(), 'danger');
            }
        });
    };

    const handleConfirm = async (bookingId: number) => {
        if (confirmingId !== null) return;
        setConfirmingId(bookingId);
        try {
            const res = await sendPost<{booking_id: number}, {error?: string}>(
                confirmUrl,
                {booking_id: bookingId},
            );
            const data = ('data' in res && res.data) ? res.data : (res as unknown as {error?: string});
            if (data?.error) {
                showToast(data.error, 'danger');
            } else {
                setBookings(prev => prev.map(b =>
                    b.id === bookingId ? {...b, status: 'confirmed'} : b
                ));
                showToast(t.Booking_ConfirmSuccess(), 'success');
            }
        } catch (err) {
            D('booking.error', {action: 'confirm', bookingId, error: err});
            showToast(t.General_Error(), 'danger');
        } finally {
            setConfirmingId(null);
        }
    };

    const handleRejectSubmit = () => {
        if (!rejectReason.trim()) {
            setRejectReasonError(t.Booking_RejectReasonRequired());
            return;
        }
        withRejectSending(async () => {
            try {
                const res = await sendPost<{booking_id: number | null; reason: string}, {error?: string}>(
                    rejectUrl,
                    {booking_id: rejectBookingId, reason: rejectReason.trim()},
                );
                const data = ('data' in res && res.data) ? res.data : (res as unknown as {error?: string});
                if (data?.error) {
                    showToast(data.error, 'danger');
                } else {
                    setBookings(prev => prev.map(b =>
                        b.id === rejectBookingId ? {...b, status: 'cancelled'} : b
                    ));
                    showToast(t.Booking_RejectSuccess(), 'success');
                    handleRejectClose();
                }
            } catch (err) {
                D('booking.error', {action: 'reject', bookingId: rejectBookingId, error: err});
                showToast(t.General_Error(), 'danger');
            }
        });
    };

    const statusTabs: {key: StatusFilter; label: string; testId: string}[] = [
        {key: 'all', label: t.Bookings_FilterAll(), testId: 'bookings-filter-all'},
        {key: 'pending', label: t.Bookings_FilterPending(), testId: 'bookings-filter-pending'},
        {key: 'confirmed', label: t.Bookings_FilterConfirmed(), testId: 'bookings-filter-confirmed'},
        {key: 'cancelled', label: t.Bookings_FilterCancelled(), testId: 'bookings-filter-cancelled'},
        {key: 'completed', label: t.Bookings_FilterCompleted(), testId: 'bookings-filter-completed'},
    ];

    return (
        <div data-test-id="bookings-tab">
            <div className="section-soft mb-4">
            {title && <h2 className="mb-3 text-xl">{title}</h2>}
            <div className="flex flex-wrap items-center gap-2 mb-0" role="tablist" data-test-id="bookings-filters">
                {statusTabs.map(tab => {
                    const c = counts[tab.key];
                    if (tab.key !== 'all' && c === 0) return null;
                    const isActive = statusFilter === tab.key;
                    return (
                        <button
                            key={tab.key}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            className={`chip ${isActive ? 'chip-active' : ''}`}
                            onClick={() => handleStatusChange(tab.key)}
                            data-test-id={tab.testId}
                        >
                            {tab.label}
                            <span className="chip-count">{c}</span>
                        </button>
                    );
                })}
                {(showPast || counts.past > 0) && (
                    <button
                        type="button"
                        className={`chip ${showPast ? 'chip-active' : ''} ml-auto`}
                        onClick={handleTogglePast}
                        data-test-id="bookings-toggle-past"
                        aria-pressed={showPast}
                    >
                        {showPast ? t.Bookings_HidePast() : t.Bookings_ShowPast()}
                        {!showPast && counts.past > 0 && <span className="chip-count">{counts.past}</span>}
                    </button>
                )}
            </div>
            </div>
            <div className="mb-4">
                <Pagination
                    page={page}
                    totalPages={totalPages}
                    total={total}
                    loading={pageLoading}
                    onPageChange={handlePageChange}
                    labels={paginationLabels}
                />
            </div>
            <div className="flex flex-col gap-3">
                {bookings.length === 0 ? (
                    <div>
                        <p className="text-muted">{t.Booking_UserNoBookings()}</p>
                    </div>
                ) : (
                    groups.map(group => (
                        <BookingGroup
                            key={group.key}
                            group={group}
                            slots={slots}
                            experts={experts}
                            users={users}
                            viewAs={viewAs}
                            isModerator={isModerator}
                            onCancelOpen={handleCancelOpen}
                            onConfirm={handleConfirm}
                            onReject={handleRejectOpen}
                            confirmingId={confirmingId}
                        />
                    ))
                )}
            </div>

            <div className="mt-4">
                <Pagination
                    page={page}
                    totalPages={totalPages}
                    total={total}
                    loading={pageLoading}
                    onPageChange={handlePageChange}
                    labels={paginationLabels}
                />
            </div>

            {/* User cancel booking modal */}
            {cancelBookingId !== null && (
                <Portal><div
                    className="fg-modal-overlay"
                    onClick={(e) => { if (e.target === e.currentTarget) handleCancelClose(); }}
                    data-test-id="user-cancel-modal"
                >
                    <div role="dialog" aria-modal="true" aria-label={t.User_Cancel_Title()} className="fg-modal-card fg-modal-card-md">
                        <div className="fg-modal-header-row">
                            <h3 className="fg-modal-title">{t.User_Cancel_Title()}</h3>
                            <button
                                type="button"
                                className="fg-modal-close-x"
                                onClick={handleCancelClose}
                                title={t.Action_Close()}
                                aria-label={t.Action_Close()}
                                data-test-id="user-cancel-close"
                            >
                                &times;
                            </button>
                        </div>

                        {(() => {
                            const cb = bookings.find(b => b.id === cancelBookingId);
                            const impact = cb?.status === 'confirmed' ? t.Booking_CancelImpact() : t.Booking_WithdrawImpact();
                            return <div className="mb-3 text-sm text-warning" data-test-id="user-cancel-impact">{impact}</div>;
                        })()}

                        {(() => {
                            const cancelBooking = bookings.find(b => b.id === cancelBookingId);
                            if (!cancelBooking || cancelBooking.bookable_type !== 'time_slot') return null;
                            const slot = slots[cancelBooking.bookable_id];
                            if (!slot) return null;
                            const cancelCost = slot.cost ?? 0;
                            if (cancelCost <= 0) return null;

                            const nowSec = Math.floor(Date.now() / 1000);
                            const penaltyPct = slot.cancellation_penalty_percent ?? 0;
                            const penaltyApplies =
                                cancelBooking.status === 'confirmed'
                                && slot.start_at > nowSec
                                && penaltyPct > 0;

                            if (!penaltyApplies) {
                                return (
                                    <div className="user-cancel-info-bar" data-test-id="cancel-refund-info">
                                        {t.Booking_RefundInfo()} {cancelCost} &#x20bd;
                                    </div>
                                );
                            }

                            const penaltyAmount = Math.floor(cancelCost * penaltyPct / 100);
                            const refundAmount = cancelCost - penaltyAmount;
                            return (
                                <div className="user-cancel-info-bar space-y-1" data-test-id="cancel-penalty-preview">
                                    <div className="text-warning">
                                        {t.Booking_PenaltyKeptByExpert([penaltyPct, penaltyAmount])}
                                    </div>
                                    <div className="text-muted">
                                        {t.Booking_RefundAmount([refundAmount])}
                                    </div>
                                </div>
                            );
                        })()}

                        {cancelReasonError && (
                            <div className="mb-3 text-sm text-danger">{cancelReasonError}</div>
                        )}

                        <div className="mb-4">
                            <label className="text-sm text-secondary mb-1 block">{t.User_Cancel_ReasonLabel()}</label>
                            <textarea
                                className="form-control"
                                rows={3}
                                value={cancelReason}
                                onChange={e => { setCancelReason(e.target.value); setCancelReasonError(''); }}
                                placeholder={t.User_Cancel_ReasonPlaceholder()}
                                data-test-id="user-cancel-reason"
                            />
                        </div>

                        <div className="flex gap-2 justify-end">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={handleCancelClose}
                                disabled={cancelSending}
                                data-test-id="user-cancel-dismiss"
                            >
                                {t.Batch_Cancel()}
                            </button>
                            <SendButton
                                onClick={handleCancelSubmit}
                                sending={cancelSending}
                                label={t.User_Cancel_Submit()}
                                testId="user-cancel-submit"
                                variant="outline-warning"
                            />
                        </div>
                    </div>
                </div></Portal>
            )}

            {/* Expert reject booking modal */}
            {rejectBookingId !== null && (
                <Portal><div
                    className="fg-modal-overlay"
                    onClick={(e) => { if (e.target === e.currentTarget) handleRejectClose(); }}
                    data-test-id="expert-reject-modal"
                >
                    <div role="dialog" aria-modal="true" aria-label={t.Booking_RejectTitle()} className="fg-modal-card fg-modal-card-md">
                        <div className="fg-modal-header-row">
                            <h3 className="fg-modal-title">{t.Booking_RejectTitle()}</h3>
                            <button
                                type="button"
                                className="fg-modal-close-x"
                                onClick={handleRejectClose}
                                title={t.Action_Close()}
                                aria-label={t.Action_Close()}
                                data-test-id="expert-reject-close"
                            >
                                &times;
                            </button>
                        </div>

                        {(() => {
                            const rb = bookings.find(b => b.id === rejectBookingId);
                            const impact = rb?.status === 'confirmed' ? t.Booking_CancelImpact() : t.Booking_DeclineImpact();
                            return <div className="mb-3 text-sm text-warning" data-test-id="expert-reject-impact">{impact}</div>;
                        })()}

                        {rejectReasonError && (
                            <div className="mb-3 text-sm text-danger">{rejectReasonError}</div>
                        )}

                        <div className="mb-4">
                            <label className="text-sm text-secondary mb-1 block">{t.Booking_RejectReasonLabel()}</label>
                            <textarea
                                className="form-control"
                                rows={3}
                                value={rejectReason}
                                onChange={e => { setRejectReason(e.target.value); setRejectReasonError(''); }}
                                placeholder={t.Booking_RejectReasonPlaceholder()}
                                data-test-id="expert-reject-reason"
                            />
                        </div>

                        <div className="flex gap-2 justify-end">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={handleRejectClose}
                                disabled={rejectSending}
                                data-test-id="expert-reject-dismiss"
                            >
                                {t.Batch_Cancel()}
                            </button>
                            <SendButton
                                onClick={handleRejectSubmit}
                                sending={rejectSending}
                                label={t.Booking_Reject()}
                                testId="expert-reject-submit"
                                variant="outline-warning"
                            />
                        </div>
                    </div>
                </div></Portal>
            )}
        </div>
    );
};

export default BookingsTab;
