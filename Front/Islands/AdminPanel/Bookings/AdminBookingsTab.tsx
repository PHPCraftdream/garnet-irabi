import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import Pagination from '@common/Components/Layout/Paging/Pagination';
import {PageResponse} from '@common/hooks/data/usePagination';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {translateStatus} from '../../../Common/booking/statusHelpers';
import {AccountOption, adminPaginationLabels, buildAccountOptions} from '../Shell/adminShared';
import {useAdminPage} from '../Shell/useAdminPage';
import {AdminFilterBar, FilterCell} from './AdminFilterBar';
import {AdminBookingRow, BookingsFilters, EMPTY_FILTERS} from './bookingsTypes';
import {AdminBookingsTable} from './AdminBookingsTable';

interface Props {
    initialData: PageResponse<AdminBookingRow> | null;
    pageUrl: string;
    allowedStatuses: string[];
    experts: AccountOption[];
    users: AccountOption[];
}

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
    constructor() {
        super(EMPTY_FILTERS);
    }

    readonly snapshot = () => this.getData();
    readonly subscribeSnapshot = (listener: () => void) => {
        const id = this.subscribe(listener);
        return () => this.unsubscribe(id);
    };

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

    readonly patch = (patch: Partial<BookingsFilters>) => this.replace({...this.getData(), ...patch});
    readonly reset = () => this.replace(EMPTY_FILTERS);
}

interface ViewProps extends Props {
    filters: BookingsFilters;
    filterStore: FilterStore;
    pagination: ReturnType<typeof useAdminPage<AdminBookingRow, BookingsFilters>>;
}

export const AdminBookingsTab: React.FC<Props> = (props) => {
    const storeRef = React.useRef<FilterStore | null>(null);
    if (storeRef.current === null) storeRef.current = new FilterStore();
    const filterStore = storeRef.current;
    const filters = React.useSyncExternalStore(filterStore.subscribeSnapshot, filterStore.snapshot, filterStore.snapshot);
    const {initialData, pageUrl} = props;
    const pagination = useAdminPage<AdminBookingRow, BookingsFilters>({
        url: pageUrl,
        initialData,
        filters,
        buildBody,
    });

    return <AdminBookingsTabView {...props} filters={filters} filterStore={filterStore} pagination={pagination} />;
};

class AdminBookingsTabView extends AntiHookComponent<ViewProps> {
    private readonly changeSearch = (value: string) => this.props.filterStore.patch({search: value});
    private readonly changeExpertId = (value: number) => this.props.filterStore.patch({expertId: value});
    private readonly changeUserId = (value: number) => this.props.filterStore.patch({userId: value});
    private readonly changeDateFrom = (value: string) => this.props.filterStore.patch({dateFrom: value});
    private readonly changeDateTo = (value: string) => this.props.filterStore.patch({dateTo: value});
    private readonly changeStatus = (value: string) => this.props.filterStore.patch({status: value});

    private filterCells(): FilterCell[] {
        const {filters, experts, users, allowedStatuses} = this.props;
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
            {kind: 'text', id: 'admin-bookings-search', label: t.Admin_Filter_SearchID(), value: filters.search, onChange: this.changeSearch},
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
            {kind: 'date', id: 'admin-bookings-date-from', label: t.Admin_Filter_DateFrom(), value: filters.dateFrom, onChange: this.changeDateFrom},
            {kind: 'date', id: 'admin-bookings-date-to', label: t.Admin_Filter_DateTo(), value: filters.dateTo, onChange: this.changeDateTo},
        ];
    }

    private renderPager() {
        const {page, perPage, totalPages, total, loading, goToPage, setPerPage} = this.props.pagination;
        return (
            <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                loading={loading}
                onPageChange={goToPage}
                labels={adminPaginationLabels}
                pageSize={perPage}
                onPageSizeChange={setPerPage}
            />
        );
    }

    render() {
        const {items, loading} = this.props.pagination;
        const cells = this.filterCells();

        const pager = this.renderPager();

        return (
            <div data-test-id="admin-bookings-tab">
                <AdminFilterBar cells={cells} loading={loading} resetTestId="admin-bookings-reset" onReset={this.props.filterStore.reset} />
                <div className="admin-grid-pagination-top">{pager}</div>
                {items.length === 0 && <p className="admin-bookings-empty">{t.Admin_NoBookings()}</p>}
                {items.length > 0 && <AdminBookingsTable items={items} />}
                <div className="admin-bookings-pager-bottom">{pager}</div>
            </div>
        );
    }
}
