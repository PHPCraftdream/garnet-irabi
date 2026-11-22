import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import Pagination from '@common/Components/Layout/Paging/Pagination';
import {PageResponse} from '@common/hooks/data/usePagination';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {translateStatus} from '../../../Common/booking/statusHelpers';
import {AccountOption, adminPaginationLabels, buildAccountOptions} from '../Shell/adminShared';
import {AdminPageController} from '../Shell/AdminPageController';
import {AdminFilterBar, FilterCell} from './AdminFilterBar';
import {AdminSlotRow, copyRow, EMPTY_FILTERS, SlotsFilters} from './bookingsTypes';
import {AdminSlotsTable} from './AdminSlotsTable';
import {AdminSlotsEmpty} from './AdminSlotsEmpty';

interface Props {
    initialData: PageResponse<AdminSlotRow> | null;
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

function statusOption(status: string) {
    return {value: status, label: translateStatus(status)};
}

const buildBody = (f: SlotsFilters, page: number, perPage: number) => ({
    page,
    perPage,
    search: f.search,
    status: f.status,
    expert_id: f.expertId,
    // Слоты ищут ученика строкой, а не числом: у эндпоинта своё поле.
    user_q: f.userId > 0 ? String(f.userId) : '',
    date_from: f.dateFrom,
    date_to: f.dateTo,
});

class FilterStore extends Carburetor<SlotsFilters> {
    constructor() {
        super(EMPTY_FILTERS);
    }

    readonly snapshot = () => this.getData();
    readonly subscribeSnapshot = (listener: () => void) => {
        const id = this.subscribe(listener);
        return () => this.unsubscribe(id);
    };

    private replace(next: SlotsFilters): void {
        const before = this.getData();
        if (next === before) return;
        const version = this.getVersion();
        this.setData(next);
        if (this.getData() !== before && this.getVersion() === version) {
            this.markAllChanged();
            this.emitUpdate();
        }
    }

    readonly patch = (patch: Partial<SlotsFilters>) => this.replace({...this.getData(), ...patch});
    readonly reset = () => this.replace(EMPTY_FILTERS);
}

export class AdminSlotsTab extends AntiHookComponent<Props> {
    private readonly filterStore = new FilterStore();
    private readonly pagination = new AdminPageController<AdminSlotRow, SlotsFilters>({
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
    private readonly changeStatus = (value: string) => this.filterStore.patch({status: value});

    private filterCells(filters: SlotsFilters): FilterCell[] {
        const {experts, users, allowedStatuses} = this.props;
        const expertOptions = buildAccountOptions(experts);
        const userOptions = buildAccountOptions(users);
        return [
            {
                kind: 'select',
                id: 'admin-slots-status',
                label: t.Admin_Filter_Status(),
                value: filters.status,
                options: [{value: '', label: t.Admin_Filter_All()}, ...allowedStatuses.map(statusOption)],
                onChange: this.changeStatus,
            },
            {kind: 'text', id: 'admin-slots-search', label: t.Admin_Filter_SearchID(), value: filters.search, onChange: this.changeSearch},
            {
                kind: 'person',
                id: 'admin-slots-expert',
                label: t.Admin_Filter_Expert(),
                value: filters.expertId,
                options: expertOptions,
                placeholder: t.Admin_Filter_SelectExpert(),
                searchPlaceholder: t.Admin_Filter_SearchExpert(),
                onChange: this.changeExpertId,
            },
            {
                kind: 'person',
                id: 'admin-slots-user',
                label: t.Admin_Filter_User(),
                value: filters.userId,
                options: userOptions,
                placeholder: t.Admin_Filter_SelectUser(),
                searchPlaceholder: t.Admin_Filter_SearchUser(),
                onChange: this.changeUserId,
            },
            {kind: 'date', id: 'admin-slots-date-from', label: t.Admin_Filter_DateFrom(), value: filters.dateFrom, onChange: this.changeDateFrom},
            {kind: 'date', id: 'admin-slots-date-to', label: t.Admin_Filter_DateTo(), value: filters.dateTo, onChange: this.changeDateTo},
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

    render() {
        const filters = this.useCarburetor(this.filterStore);
        const pagination = this.useCarburetor(this.pagination);
        const {loading} = pagination;
        const items = pagination.items.map(copyRow);
        const cells = this.filterCells(filters);

        const pager = this.renderPager(pagination);

        return (
            <div data-test-id="admin-slots-tab">
                <AdminFilterBar cells={cells} loading={loading} resetTestId="admin-slots-reset" onReset={this.filterStore.reset} />
                <div className="admin-grid-pagination-top">{pager}</div>
                {items.length === 0 && <AdminSlotsEmpty />}
                {items.length > 0 && <AdminSlotsTable items={items} />}
                <div className="admin-bookings-pager-bottom">{pager}</div>
            </div>
        );
    }
}
