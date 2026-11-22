import {Carburetor} from '@react-carburetor/core';
import {sendPost} from '@common/Api/Send/sendPost';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import type {PageResponse} from '@common/hooks/data/usePagination';
import {DEFAULT_PAGE_SIZE} from '@common/Utils/Data/pagination';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import type {Booking, BookingCounts, BookingsViewAs, ExpertInfo, SlotInfo, StatusFilter, UserInfo} from './card/bookingCardTypes';

interface BookingsPageResponse extends PageResponse<Booking> {
    slots: Record<number, SlotInfo>;
    experts: Record<number, ExpertInfo>;
    users?: Record<number, UserInfo>;
    counts?: BookingCounts;
}

export interface BookingsState {
    bookings: Booking[];
    page: number;
    totalPages: number;
    total: number;
    pageLoading: boolean;
    slots: Record<number, SlotInfo>;
    experts: Record<number, ExpertInfo>;
    users: Record<number, UserInfo>;
    viewAs: BookingsViewAs;
    statusFilter: StatusFilter;
    showPast: boolean;
    counts: BookingCounts;
    cancelBookingId: number | null;
    rejectBookingId: number | null;
    rescheduleBookingId: number | null;
    rescheduleError: string | undefined;
    confirmingId: number | null;
}

export class BookingsStateStore extends Carburetor<BookingsState> {
    applyPage(data: BookingsPageResponse): void {
        const before = this.getData();
        this.replace(before, {...before, bookings: data.items, page: data.page, totalPages: data.totalPages,
            total: data.total, slots: data.slots || {}, experts: data.experts || {}, users: data.users || {},
            counts: data.counts || before.counts, pageLoading: false});
    }

    readonly setPageLoading = (value: boolean) => this.set('pageLoading', value);
    readonly setViewAs = (value: BookingsViewAs) => this.set('viewAs', value);
    readonly setStatusFilter = (value: StatusFilter) => this.set('statusFilter', value);
    readonly setShowPast = (value: boolean) => this.set('showPast', value);
    readonly setCancelBookingId = (value: number | null) => this.set('cancelBookingId', value);
    readonly setRejectBookingId = (value: number | null) => this.set('rejectBookingId', value);
    readonly setRescheduleBookingId = (value: number | null) => this.set('rescheduleBookingId', value);
    readonly setRescheduleError = (value: string | undefined) => this.set('rescheduleError', value);
    readonly setConfirmingId = (value: number | null) => this.set('confirmingId', value);
    readonly closeCancel = () => this.setCancelBookingId(null);
    readonly closeReject = () => this.setRejectBookingId(null);
    readonly closeReschedule = () => {
        this.setRescheduleBookingId(null);
        this.setRescheduleError(undefined);
    };

    readonly set = <K extends keyof BookingsState>(key: K, value: BookingsState[K]) => {
        const before = this.getData();
        if (Object.is(before[key], value)) return;
        this.replace(before, {...before, [key]: value});
    };

    private replace(before: BookingsState, next: BookingsState): void {
        const version = this.getVersion();
        this.setData(next);
        if (this.getData() !== before && this.getVersion() === version) {
            this.markAllChanged();
            this.emitUpdate();
        }
    }
}

export class BookingsNavigation {
    constructor(private readonly store: BookingsStateStore, private readonly bookingsPageUrl: string) {}

    readonly fetchPage = async (
        targetPage: number,
        opts: {status?: StatusFilter; showPast?: boolean; view?: BookingsViewAs} = {},
    ) => {
        const {store, bookingsPageUrl} = this;
        const {statusFilter, showPast, viewAs} = store.getData();
        const status = opts.status ?? statusFilter;
        const past = opts.showPast ?? showPast;
        // Вид передаётся явно: при переключении стороны состояние ещё не
        // применилось, а сервер должен отдать список уже новой стороны.
        const view = opts.view ?? viewAs;
        store.setPageLoading(true);
        try {
            const resp = await sendPost<
                {page: number; perPage: number; status: string; showPast: boolean; view: BookingsViewAs},
                BookingsPageResponse
            >(bookingsPageUrl, {
                page: targetPage,
                perPage: DEFAULT_PAGE_SIZE,
                status: status === 'all' ? '' : status,
                showPast: past,
                view,
            });
            const data = ('data' in resp && resp.data) ? resp.data : resp as unknown as BookingsPageResponse;
            store.applyPage(data);
        } catch {
            showToast(t.User_LoadError(), 'danger');
        } finally {
            store.setPageLoading(false);
        }
    };

    readonly handlePageChange = (p: number) => {
        const {totalPages, page, pageLoading} = this.store.getData();
        if (p < 1 || p > totalPages || (p === page && !pageLoading)) return;
        void this.fetchPage(p);
    };

    readonly handleStatusChange = (s: StatusFilter) => {
        const {store} = this;
        const {statusFilter} = store.getData();
        if (s === statusFilter) return;
        store.setStatusFilter(s);
        void this.fetchPage(1, {status: s});
    };

    readonly handleViewChange = (next: BookingsViewAs) => {
        const {store} = this;
        const {viewAs} = store.getData();
        if (next === viewAs) return;
        store.setViewAs(next);
        // Фильтр по статусу и «показать прошедшие» осмысленны на обеих
        // сторонах, поэтому сохраняются; страница сбрасывается на первую —
        // списки разной длины, и третья страница входящих ничего не значит
        // для своих занятий.
        void this.fetchPage(1, {view: next});
    };

    readonly handleTogglePast = () => {
        const {store} = this;
        const {showPast} = store.getData();
        const next = !showPast;
        store.setShowPast(next);
        void this.fetchPage(1, {showPast: next});
    };
}
