import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import Pagination from '@common/Components/Layout/Paging/Pagination';
import {PageResponse} from '@common/hooks/data/usePagination';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {translateStatus} from '@/Common/booking/status/statusHelpers';
import {AccountOption, buildAccountOptions} from '@/Islands/AdminPanel/Shell/shared/adminShared';
import {adminPaginationLabels} from '@/Islands/AdminPanel/Shell/navigation/adminPaginationLabels';
import {AdminPageController} from '@/Islands/AdminPanel/Shell/AdminPageController';
import {AdminFilterBar, FilterCell} from '@/Islands/AdminPanel/Bookings/AdminFilterBar';
import {AdminBookingRow, BookingsFilters, copyRow} from '@/Islands/AdminPanel/Bookings/shared/bookingsTypes';
import {EMPTY_FILTERS} from '@/Islands/AdminPanel/Bookings/shared/emptyFilters';
import {AdminBookingsTable} from './AdminBookingsTable';

interface Props {
    initialData: PageResponse<AdminBookingRow> | null;
    pageUrl: string;
    allowedStatuses: string[];
    experts: AccountOption[];
    users: AccountOption[];
}

interface PagerState {
    page: number;
    perPage: number;
    totalPages: number;
    total: number;
    loading: boolean;
}

    /** Формирует представление данных для соответствующего раздела панели. */
function statusOption(status: string) {
    return {value: status, label: translateStatus(status)};
}

const buildBody = (f: BookingsFilters, page: number, perPage: number) => ({
    page,
    perPage,
    search: f.search,
    status: f.status,
    expert_id: f.expertId,
    user_id: f.userId,
    date_from: f.dateFrom,
    date_to: f.dateTo,
});

class FilterStore extends Carburetor<BookingsFilters> {
    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    constructor() {
        super(EMPTY_FILTERS);
    }

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    readonly snapshot = () => this.getData();
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    readonly subscribeSnapshot = (listener: () => void) => {
        const id = this.subscribe(listener);
        return () => this.unsubscribe(id);
    };

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private replace(next: BookingsFilters): void {
        const before = this.getData();
        if (next === before) return;
        const version = this.getVersion();
        this.setData(next);
        if (this.getData() !== before && this.getVersion() === version) {
            this.markAllChanged();
            this.emitUpdate();
        }
    }

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    readonly patch = (patch: Partial<BookingsFilters>) => this.replace({...this.getData(), ...patch});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    readonly reset = () => this.replace(EMPTY_FILTERS);
}

export class AdminBookingsTab extends AntiHookComponent<Props> {
    private readonly filterStore = new FilterStore();
    private readonly pagination = new AdminPageController<AdminBookingRow, BookingsFilters>({
        url: this.props.pageUrl,
        initialData: this.props.initialData,
        filters: this.filterStore.getData(),
        buildBody,
    });
    private unsubscribeFilters?: () => void;

    /** Синхронизирует жизненный цикл компонента с его внешними подписками. */
    componentDidMount(): void {
        super.componentDidMount();
        // Подписка на стор фильтров заменяет прежний эффект с debounce: срабатывает на каждую запись фильтров.
        this.unsubscribeFilters = this.filterStore.subscribeSnapshot(this.onFiltersChanged);
        this.pagination.start();
    }

    /** Синхронизирует жизненный цикл компонента с его внешними подписками. */
    componentWillUnmount(): void {
        this.unsubscribeFilters?.();
        this.unsubscribeFilters = undefined;
        this.pagination.stop();
        super.componentWillUnmount();
    }

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private readonly onFiltersChanged = () => this.pagination.setFilters(this.filterStore.getData());

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly changeSearch = (value: string) => this.filterStore.patch({search: value});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly changeExpertId = (value: number) => this.filterStore.patch({expertId: value});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly changeUserId = (value: number) => this.filterStore.patch({userId: value});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly changeDateFrom = (value: string) => this.filterStore.patch({dateFrom: value});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly changeDateTo = (value: string) => this.filterStore.patch({dateTo: value});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly changeStatus = (value: string) => this.filterStore.patch({status: value});

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private filterCells(filters: BookingsFilters): FilterCell[] {
        const {experts, users, allowedStatuses} = this.props;
        const expertOptions = buildAccountOptions(experts);
        const userOptions = buildAccountOptions(users);
        return [
            {
                kind: 'select',
                id: 'admin-bookings-status',
                label: t.Admin_Filter_Status(),
                value: filters.status,
                options: [{value: '', label: t.Admin_Filter_All()}, ...allowedStatuses.map(statusOption)],
                onChange: this.changeStatus,
            },
            {kind: 'text', id: 'admin-bookings-search', label: t.Admin_Filter_SearchID(), value:
        filters.search, onChange: this.changeSearch},
            {
                kind: 'person',
                id: 'admin-bookings-expert',
                label: t.Admin_Filter_Expert(),
                value: filters.expertId,
                options: expertOptions,
                placeholder: t.Admin_Filter_SelectExpert(),
                searchPlaceholder: t.Admin_Filter_SearchExpert(),
                onChange: this.changeExpertId,
            },
            {
                kind: 'person',
                id: 'admin-bookings-user',
                label: t.Admin_Filter_User(),
                value: filters.userId,
                options: userOptions,
                placeholder: t.Admin_Filter_SelectUser(),
                searchPlaceholder: t.Admin_Filter_SearchUser(),
                onChange: this.changeUserId,
            },
            {kind: 'date', id: 'admin-bookings-date-from', label: t.Admin_Filter_DateFrom(), value:
        filters.dateFrom, onChange: this.changeDateFrom},
            {kind: 'date', id: 'admin-bookings-date-to', label: t.Admin_Filter_DateTo(), value:
        filters.dateTo, onChange: this.changeDateTo},
        ];
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    private renderPager(pager: PagerState) {
        const {page, perPage, totalPages, total, loading} = pager;
        return (
            <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                loading={loading}
                onPageChange={this.pagination.goToPage}
                labels={adminPaginationLabels}
                pageSize={perPage}
                onPageSizeChange={this.pagination.setPerPage}
            />
        );
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    render() {
        const filters = this.useCarburetor(this.filterStore);
        const pagination = this.useCarburetor(this.pagination);
        const {loading} = pagination;
        const items = pagination.items.map(copyRow);
        const cells = this.filterCells(filters);

        const pager = this.renderPager(pagination);

        return (
            <div data-test-id="admin-bookings-tab">
                <AdminFilterBar cells={cells} loading={loading} resetTestId="admin-bookings-reset"
        onReset={this.filterStore.reset} />
                <div className="admin-grid-pagination-top">{pager}</div>
                {items.length === 0 && <p className="admin-bookings-empty">{t.Admin_NoBookings()}</p>}
                {items.length > 0 && <AdminBookingsTable items={items} />}
                <div className="admin-bookings-pager-bottom">{pager}</div>
            </div>
        );
    }
}
