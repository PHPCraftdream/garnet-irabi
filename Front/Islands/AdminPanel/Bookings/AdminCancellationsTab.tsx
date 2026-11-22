import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import Pagination from '@common/Components/Layout/Paging/Pagination';
import {PageResponse} from '@common/hooks/data/usePagination';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {AccountOption, adminPaginationLabels, buildAccountOptions} from '../Shell/adminShared';
import {AdminPageController} from '../Shell/AdminPageController';
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

interface PagerState {
    page: number;
    perPage: number;
    totalPages: number;
    total: number;
    loading: boolean;
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

class AdminCancellationsTab extends AntiHookComponent<Props> {
    private readonly filterStore = new FilterStore();
    private readonly pagination = new AdminPageController<CancellationRow, Filters>({
        url: this.props.pageUrl,
        initialData: this.props.initialData,
        filters: this.filterStore.getData(),
        buildBody,
    });
    private unsubscribeFilters?: () => void;

    componentDidMount(): void {
        super.componentDidMount();
        // Подписка на стор фильтров заменяет прежний эффект с debounce: срабатывает на каждую запись фильтров.
        this.unsubscribeFilters = this.filterStore.subscribeSnapshot(this.onFiltersChanged);
        this.pagination.start();
    }

    componentWillUnmount(): void {
        this.unsubscribeFilters?.();
        this.unsubscribeFilters = undefined;
        this.pagination.stop();
        super.componentWillUnmount();
    }

    private readonly onFiltersChanged = () => this.pagination.setFilters(this.filterStore.getData());

    private readonly changeSearch = (value: string) => this.filterStore.patch({search: value});
    private readonly changeExpertId = (value: number) => this.filterStore.patch({expertId: value});
    private readonly changeUserId = (value: number) => this.filterStore.patch({userId: value});
    private readonly changeDateFrom = (value: string) => this.filterStore.patch({dateFrom: value});
    private readonly changeDateTo = (value: string) => this.filterStore.patch({dateTo: value});

    private filterCells(testIdPrefix: string, filters: Filters): FilterCell[] {
        const {experts, users} = this.props;
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

    private renderTable(items: CancellationRow[], columns: string[], testIdPrefix: string, showExpertColumn: boolean, showUserColumn: boolean) {
        if (items.length === 0) return null;
        return (
            <AdminCancellationsTable
                items={items}
                columns={columns}
                testIdPrefix={testIdPrefix}
                isModerator={this.props.isModerator}
                showExpertColumn={showExpertColumn}
                showUserColumn={showUserColumn}
            />
        );
    }

    render() {
        const filters = this.useCarburetor(this.filterStore);
        const pagination = this.useCarburetor(this.pagination);
        const {loading} = pagination;
        const items = [...pagination.items];
        const {kind, showExpertColumn = true, showUserColumn = true} = this.props;
        const testIdPrefix = kind === 'expert' ? 'expert-cancellations' : 'user-cancellations';
        const columns = [
            t.Cancellations_ColumnDate(),
            ...(showExpertColumn ? [t.Cancellations_ColumnExpert()] : []),
            ...(showUserColumn ? [t.Cancellations_ColumnUser()] : []),
            t.Cancellations_ColumnSlot(),
            t.Cancellations_ColumnBooking(),
            t.Cancellations_ColumnReason(),
        ];

        const pager = this.renderPager(pagination);

        return (
            <div data-test-id={`${testIdPrefix}-tab`}>
                <AdminFilterBar cells={this.filterCells(testIdPrefix, filters)} loading={loading} resetTestId={`${testIdPrefix}-reset`} onReset={this.filterStore.reset} />
                <div className="admin-grid-pagination-top">{pager}</div>
                {items.length === 0 && <p className="admin-bookings-empty">{t.Cancellations_Empty()}</p>}
                {this.renderTable(items, columns, testIdPrefix, showExpertColumn, showUserColumn)}
                <div className="admin-bookings-pager-bottom">{pager}</div>
            </div>
        );
    }
}

export default AdminCancellationsTab;
