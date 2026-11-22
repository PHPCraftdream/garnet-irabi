import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import Pagination from '@common/Components/Layout/Paging/Pagination';
import {PageResponse} from '@common/hooks/data/usePagination';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {AccountOption, adminPaginationLabels, buildAccountOptions} from '../Shell/adminShared';
import {useAdminPage} from '../Shell/useAdminPage';
import {AdminFilterBar, FilterCell} from './AdminFilterBar';
import {AdminCancellationsTable} from './AdminCancellationsTable';

export interface CancellationRow {
    id: number;
    created_at: number;
    expert_id: number;
    expert_name: string;
    expert_has_profile: boolean;
    user_id: number;
    user_name: string;
    slot_id: number;
    slot_time: number;
    booking_id: number;
    reason: string;
}

interface Filters {
    search: string;
    dateFrom: string;
    dateTo: string;
    expertId: number;
    userId: number;
}

const EMPTY: Filters = {search: '', dateFrom: '', dateTo: '', expertId: 0, userId: 0};

interface Props {
    initialData: PageResponse<CancellationRow> | null;
    pageUrl: string;
    isModerator: boolean;
    /** Префикс test-id: вкладки отмен преподавателя и ученика не должны совпадать. */
    kind: 'expert' | 'user';
    experts: AccountOption[];
    users: AccountOption[];
    /** Показывать ли столбцы сторон. Администратор видит обе. */
    showExpertColumn?: boolean;
    showUserColumn?: boolean;
}

const buildBody = (f: Filters, page: number, perPage: number) => ({
    page,
    perPage,
    search: f.search,
    dateFrom: f.dateFrom,
    dateTo: f.dateTo,
    expert_id: f.expertId,
    user_id: f.userId,
});

class FilterStore extends Carburetor<Filters> {
    constructor() {
        super(EMPTY);
    }

    readonly snapshot = () => this.getData();
    readonly subscribeSnapshot = (listener: () => void) => {
        const id = this.subscribe(listener);
        return () => this.unsubscribe(id);
    };

    private replace(next: Filters): void {
        const before = this.getData();
        if (next === before) return;
        const version = this.getVersion();
        this.setData(next);
        if (this.getData() !== before && this.getVersion() === version) {
            this.markAllChanged();
            this.emitUpdate();
        }
    }

    readonly patch = (patch: Partial<Filters>) => this.replace({...this.getData(), ...patch});
    readonly reset = () => this.replace(EMPTY);
}

interface ViewProps extends Props {
    filters: Filters;
    filterStore: FilterStore;
    pagination: ReturnType<typeof useAdminPage<CancellationRow, Filters>>;
}

const AdminCancellationsTab: React.FC<Props> = (props) => {
    const storeRef = React.useRef<FilterStore | null>(null);
    if (storeRef.current === null) storeRef.current = new FilterStore();
    const filterStore = storeRef.current;
    const filters = React.useSyncExternalStore(filterStore.subscribeSnapshot, filterStore.snapshot, filterStore.snapshot);
    const {initialData, pageUrl} = props;
    const pagination = useAdminPage<CancellationRow, Filters>({
        url: pageUrl,
        initialData,
        filters,
        buildBody,
    });

    return <AdminCancellationsTabView {...props} filters={filters} filterStore={filterStore} pagination={pagination} />;
};

class AdminCancellationsTabView extends AntiHookComponent<ViewProps> {
    private readonly changeSearch = (value: string) => this.props.filterStore.patch({search: value});
    private readonly changeExpertId = (value: number) => this.props.filterStore.patch({expertId: value});
    private readonly changeUserId = (value: number) => this.props.filterStore.patch({userId: value});
    private readonly changeDateFrom = (value: string) => this.props.filterStore.patch({dateFrom: value});
    private readonly changeDateTo = (value: string) => this.props.filterStore.patch({dateTo: value});

    private filterCells(testIdPrefix: string): FilterCell[] {
        const {filters, experts, users} = this.props;
        const expertOptions = buildAccountOptions(experts);
        const userOptions = buildAccountOptions(users);
        return [
            {
                kind: 'person',
                id: `${testIdPrefix}-expert`,
                label: t.Admin_Filter_Expert(),
                value: filters.expertId,
                options: expertOptions,
                placeholder: t.Admin_Filter_SelectExpert(),
                searchPlaceholder: t.Admin_Filter_SearchExpert(),
                onChange: this.changeExpertId,
            },
            {
                kind: 'person',
                id: `${testIdPrefix}-user`,
                label: t.Admin_Filter_User(),
                value: filters.userId,
                options: userOptions,
                placeholder: t.Admin_Filter_SelectUser(),
                searchPlaceholder: t.Admin_Filter_SearchUser(),
                onChange: this.changeUserId,
            },
            {kind: 'date', id: `${testIdPrefix}-date-from`, label: t.Admin_Filter_DateFrom(), value: filters.dateFrom, onChange: this.changeDateFrom},
            {kind: 'date', id: `${testIdPrefix}-date-to`, label: t.Admin_Filter_DateTo(), value: filters.dateTo, onChange: this.changeDateTo},
            {kind: 'text', id: `${testIdPrefix}-search`, label: t.Admin_Filter_Reason(), value: filters.search, onChange: this.changeSearch},
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
        const {kind, isModerator, showExpertColumn = true, showUserColumn = true} = this.props;
        const testIdPrefix = kind === 'expert' ? 'expert-cancellations' : 'user-cancellations';
        const columns = [
            t.Cancellations_ColumnDate(),
            ...(showExpertColumn ? [t.Cancellations_ColumnExpert()] : []),
            ...(showUserColumn ? [t.Cancellations_ColumnUser()] : []),
            t.Cancellations_ColumnSlot(),
            t.Cancellations_ColumnBooking(),
            t.Cancellations_ColumnReason(),
        ];

        const pager = this.renderPager();

        return (
            <div data-test-id={`${testIdPrefix}-tab`}>
                <AdminFilterBar cells={this.filterCells(testIdPrefix)} loading={loading} resetTestId={`${testIdPrefix}-reset`} onReset={this.props.filterStore.reset} />
                <div className="admin-grid-pagination-top">{pager}</div>
                {items.length === 0 && <p className="admin-bookings-empty">{t.Cancellations_Empty()}</p>}
                {items.length > 0 && (
                    <AdminCancellationsTable
                        items={items}
                        columns={columns}
                        testIdPrefix={testIdPrefix}
                        isModerator={isModerator}
                        showExpertColumn={showExpertColumn}
                        showUserColumn={showUserColumn}
                    />
                )}
                <div className="admin-bookings-pager-bottom">{pager}</div>
            </div>
        );
    }
}

export default AdminCancellationsTab;
