import * as React from 'react';
import {sendPost} from '@common/Api/sendPost';
import {showToast} from '@common/Components/GlobalToast';
import Pagination from '@common/Components/Pagination';
import {PageResponse} from '@common/hooks/usePagination';
import {formatTs} from '@common/Utils/DateUtils';
import {Combobox} from '@common/Components/ui/Combobox';
import {DateInput} from '@common/Components/ui/DateInput';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {EntityLink, userLinks} from '../../Common/EntityLinks';
import {UniversalBadge} from '../../Common/StatusBadge';
import {translateStatus} from '../../Common/statusHelpers';
import AdminCancellationsTab, {CancellationRow} from './AdminCancellationsTab';
import {DEFAULT_PAGE_SIZE} from '@common/Utils/pagination';
import {PageHeader} from '@common/Components/PageHeader';
import {CalendarRange} from 'lucide-react';

type TabKey = 'slots' | 'bookings' | 'expert-cancellations' | 'user-cancellations';

interface AdminBookingRow {
    id: number;
    user_id: number;
    user_name: string;
    expert_id: number;
    expert_name: string;
    expert_has_profile: boolean;
    bookable_type: string;
    bookable_id: number;
    slot_time: number;
    status: string;
    created_at: number;
}

interface AdminSlotRow {
    id: number;
    expert_id: number;
    expert_name: string;
    expert_has_profile: boolean;
    start_at: number;
    end_at: number;
    duration_min: number;
    cost: number;
    is_online: boolean;
    location: string;
    max_users: number;
    status: string;
    created_at: number;
}

export interface AccountOption {
    id: number;
    name: string;
}

interface Props {
    pageTitle: string;
    activeTab: TabKey;
    tabs: TabKey[];
    tabLabels: Record<TabKey, string>;
    experts: AccountOption[];
    users: AccountOption[];
    slotsPayload: PageResponse<AdminSlotRow> | null;
    slotsPageUrl: string;
    bookingsPayload: PageResponse<AdminBookingRow> | null;
    bookingsPageUrl: string;
    expertCancellationsPayload: PageResponse<CancellationRow> | null;
    expertCancellationsPageUrl: string;
    userCancellationsPayload: PageResponse<CancellationRow> | null;
    userCancellationsPageUrl: string;
    allowedStatuses: string[];
    allowedSlotStatuses: string[];
}

function pushTabToUrl(tab: TabKey): void {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.pushState({}, '', url.toString());
}

const paginationLabels = {
    prev: t.Pagination_Prev(),
    next: t.Pagination_Next(),
    of: t.Pagination_Of(),
    items: t.Pagination_Items(),
};

interface BookingsFetchBody {
    page: number;
    perPage: number;
    search: string;
    status: string;
    expert_id: number;
    user_id: number;
    date_from: string;
    date_to: string;
}

interface SlotsFetchBody {
    page: number;
    perPage: number;
    search: string;
    status: string;
    expert_id: number;
    user_q: string;
    date_from: string;
    date_to: string;
}

function buildAccountOptions(items: AccountOption[]): {value: string; label: string}[] {
    const out: {value: string; label: string}[] = [{value: '0', label: t.Admin_Filter_All()}];
    for (const a of items) {
        out.push({value: String(a.id), label: a.name});
    }
    return out;
}

const AdminSlotsTab: React.FC<{
    initialData: PageResponse<AdminSlotRow> | null;
    pageUrl: string;
    allowedStatuses: string[];
    experts: AccountOption[];
    users: AccountOption[];
}> = ({initialData, pageUrl, allowedStatuses, experts, users}) => {
    const [items, setItems] = React.useState<AdminSlotRow[]>(initialData?.items ?? []);
    const [page, setPage] = React.useState<number>(initialData?.page ?? 1);
    const [totalPages, setTotalPages] = React.useState<number>(initialData?.totalPages ?? 1);
    const [total, setTotal] = React.useState<number>(initialData?.total ?? 0);
    const [loading, setLoading] = React.useState<boolean>(false);
    const [loadedOnce, setLoadedOnce] = React.useState<boolean>(initialData !== null);

    const [search, setSearch] = React.useState<string>('');
    const [status, setStatus] = React.useState<string>('');
    const [expertId, setExpertId] = React.useState<number>(0);
    const [userId, setUserId] = React.useState<number>(0);
    const [dateFrom, setDateFrom] = React.useState<string>('');
    const [dateTo, setDateTo] = React.useState<string>('');

    // Refs to avoid stale closures inside auto-apply useEffect
    const stateRef = React.useRef({search, status, expertId, userId, dateFrom, dateTo});
    stateRef.current = {search, status, expertId, userId, dateFrom, dateTo};

    const fetchPage = React.useCallback(async (
        params: Partial<SlotsFetchBody> = {},
    ) => {
        const cur = stateRef.current;
        const body: SlotsFetchBody = {
            page: params.page ?? 1,
            perPage: DEFAULT_PAGE_SIZE,
            search: params.search ?? cur.search,
            status: params.status ?? cur.status,
            expert_id: params.expert_id ?? cur.expertId,
            user_q: params.user_q ?? (cur.userId > 0 ? String(cur.userId) : ''),
            date_from: params.date_from ?? cur.dateFrom,
            date_to: params.date_to ?? cur.dateTo,
        };
        setLoading(true);
        try {
            const resp = await sendPost<SlotsFetchBody, PageResponse<AdminSlotRow>>(pageUrl, body);
            const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as PageResponse<AdminSlotRow>);
            setItems(data.items);
            setPage(data.page);
            setTotalPages(data.totalPages);
            setTotal(data.total);
            setLoadedOnce(true);
        } catch {
            showToast(t.User_LoadError(), 'danger');
        } finally {
            setLoading(false);
        }
    }, [pageUrl]);

    // Initial load if no SSR payload
    React.useEffect(() => {
        if (initialData === null && !loadedOnce) {
            void fetchPage({page: 1});
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-apply filters with debounce when any filter changes (skip first render).
    const isFirstRunRef = React.useRef(true);
    React.useEffect(() => {
        if (isFirstRunRef.current) {
            isFirstRunRef.current = false;
            return;
        }
        const handle = setTimeout(() => {
            void fetchPage({page: 1});
        }, 300);
        return () => clearTimeout(handle);
    }, [search, status, expertId, userId, dateFrom, dateTo, fetchPage]);

    const handleResetFilters = React.useCallback(() => {
        setSearch('');
        setStatus('');
        setExpertId(0);
        setUserId(0);
        setDateFrom('');
        setDateTo('');
        // The auto-apply effect will trigger; no manual fetch needed.
    }, []);

    const handlePageChange = React.useCallback((p: number) => {
        if (p < 1 || p > totalPages || (p === page && !loading)) return;
        void fetchPage({page: p});
    }, [fetchPage, totalPages, page, loading]);

    const expertOptions = React.useMemo(() => buildAccountOptions(experts), [experts]);
    const userOptions = React.useMemo(() => buildAccountOptions(users), [users]);

    return (
        <div data-test-id="admin-slots-tab">
            <div className="admin-bookings-filters">
                <div className="filter-cell">
                    <label htmlFor="admin-slots-status">{t.Admin_Filter_Status()}</label>
                    <select
                        id="admin-slots-status"
                        value={status}
                        onChange={e => setStatus(e.target.value)}
                        className="form-control"
                        data-test-id="admin-slots-status"
                    >
                        <option value="">{t.Admin_Filter_All()}</option>
                        {allowedStatuses.map(s => (
                            <option key={s} value={s}>{translateStatus(s)}</option>
                        ))}
                    </select>
                </div>
                <div className="filter-cell">
                    <label htmlFor="admin-slots-search">{t.Admin_Filter_SearchID()}</label>
                    <input
                        id="admin-slots-search"
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="form-control"
                        data-test-id="admin-slots-search"
                    />
                </div>
                <div className="filter-cell">
                    <label>{t.Admin_Filter_Expert()}</label>
                    <Combobox
                        options={expertOptions}
                        value={String(expertId)}
                        onChange={v => setExpertId(parseInt(v, 10) || 0)}
                        placeholder={t.Admin_Filter_SelectExpert()}
                        searchPlaceholder={t.Admin_Filter_SearchExpert()}
                        emptyText={t.Admin_Filter_All()}
                        testId="admin-slots-expert"
                    />
                </div>
                <div className="filter-cell">
                    <label>{t.Admin_Filter_User()}</label>
                    <Combobox
                        options={userOptions}
                        value={String(userId)}
                        onChange={v => setUserId(parseInt(v, 10) || 0)}
                        placeholder={t.Admin_Filter_SelectUser()}
                        searchPlaceholder={t.Admin_Filter_SearchUser()}
                        emptyText={t.Admin_Filter_All()}
                        testId="admin-slots-user"
                    />
                </div>
                <div className="filter-cell">
                    <label htmlFor="admin-slots-date-from">{t.Admin_Filter_DateFrom()}</label>
                    <DateInput
                        id="admin-slots-date-from"
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        data-test-id="admin-slots-date-from"
                    />
                </div>
                <div className="filter-cell">
                    <label htmlFor="admin-slots-date-to">{t.Admin_Filter_DateTo()}</label>
                    <DateInput
                        id="admin-slots-date-to"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        data-test-id="admin-slots-date-to"
                    />
                </div>
                <div className="filter-actions">
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handleResetFilters}
                        disabled={loading}
                        data-test-id="admin-slots-reset"
                        aria-label={t.Admin_Filter_ResetAll()}
                        title={t.Admin_Filter_ResetAll()}
                    >
                        {'× '}{t.Admin_Filter_ResetAll()}
                    </button>
                </div>
            </div>

            <div className="mb-3">
                <Pagination
                    page={page}
                    totalPages={totalPages}
                    total={total}
                    loading={loading}
                    onPageChange={handlePageChange}
                    labels={paginationLabels}
                />
            </div>

            {items.length === 0 ? (
                <p className="text-muted">{t.Admin_NoSlots()}</p>
            ) : (
                <div className="card">
                    <div className="overflow-x-auto">
                        <table className="admin-table">
                            <thead>
                                <tr className="border-b border-subtle">
                                    <th className="text-left p-3">ID</th>
                                    <th className="text-left p-3">{t.Admin_Slot_Expert()}</th>
                                    <th className="text-left p-3">{t.Admin_Slot_Time()}</th>
                                    <th className="text-left p-3">{t.Admin_Slot_Duration()}</th>
                                    <th className="text-left p-3">{t.Admin_Slot_Cost()}</th>
                                    <th className="text-left p-3">{t.Admin_Slot_Location()}</th>
                                    <th className="text-left p-3">{t.Admin_Slot_MaxUsers()}</th>
                                    <th className="text-left p-3">{t.Slot_Status()}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map(row => (
                                    <tr
                                        key={row.id}
                                        className="border-b border-subtle"
                                        data-test-id={`admin-slot-row-${row.id}`}
                                    >
                                        <td className="p-3 whitespace-nowrap text-muted">#{row.id}</td>
                                        <td className="p-3">
                                            {row.expert_id > 0 ? (
                                                <EntityLink
                                                    name={row.expert_name}
                                                    {...userLinks(row.expert_id, row.expert_has_profile)}
                                                    isModerator={true}
                                                />
                                            ) : <span className="text-muted">—</span>}
                                        </td>
                                        <td className="p-3 whitespace-nowrap">
                                            {row.start_at
                                                ? <>{formatTs(row.start_at)} — {formatTs(row.end_at)}</>
                                                : <span className="text-muted">—</span>}
                                        </td>
                                        <td className="p-3 whitespace-nowrap">
                                            {row.duration_min} {t.Slot_Duration_Min()}
                                        </td>
                                        <td className="p-3 whitespace-nowrap">{row.cost}</td>
                                        <td className="p-3">
                                            {row.is_online
                                                ? t.Admin_Slot_Online()
                                                : (row.location || <span className="text-muted">—</span>)}
                                        </td>
                                        <td className="p-3 whitespace-nowrap">{row.max_users}</td>
                                        <td className="p-3">
                                            <UniversalBadge status={row.status} label={translateStatus(row.status)} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className="mt-3">
                <Pagination
                    page={page}
                    totalPages={totalPages}
                    total={total}
                    loading={loading}
                    onPageChange={handlePageChange}
                    labels={paginationLabels}
                />
            </div>
        </div>
    );
};

const AdminBookingsTab: React.FC<{
    initialData: PageResponse<AdminBookingRow> | null;
    pageUrl: string;
    allowedStatuses: string[];
    experts: AccountOption[];
    users: AccountOption[];
}> = ({initialData, pageUrl, allowedStatuses, experts, users}) => {
    const [items, setItems] = React.useState<AdminBookingRow[]>(initialData?.items ?? []);
    const [page, setPage] = React.useState<number>(initialData?.page ?? 1);
    const [totalPages, setTotalPages] = React.useState<number>(initialData?.totalPages ?? 1);
    const [total, setTotal] = React.useState<number>(initialData?.total ?? 0);
    const [loading, setLoading] = React.useState<boolean>(false);
    const [loadedOnce, setLoadedOnce] = React.useState<boolean>(initialData !== null);

    const [search, setSearch] = React.useState<string>('');
    const [status, setStatus] = React.useState<string>('');
    const [expertId, setExpertId] = React.useState<number>(0);
    const [userId, setUserId] = React.useState<number>(0);
    const [dateFrom, setDateFrom] = React.useState<string>('');
    const [dateTo, setDateTo] = React.useState<string>('');

    const stateRef = React.useRef({search, status, expertId, userId, dateFrom, dateTo});
    stateRef.current = {search, status, expertId, userId, dateFrom, dateTo};

    const fetchPage = React.useCallback(async (params: Partial<BookingsFetchBody> = {}) => {
        const cur = stateRef.current;
        const body: BookingsFetchBody = {
            page: params.page ?? 1,
            perPage: DEFAULT_PAGE_SIZE,
            search: params.search ?? cur.search,
            status: params.status ?? cur.status,
            expert_id: params.expert_id ?? cur.expertId,
            user_id: params.user_id ?? cur.userId,
            date_from: params.date_from ?? cur.dateFrom,
            date_to: params.date_to ?? cur.dateTo,
        };
        setLoading(true);
        try {
            const resp = await sendPost<BookingsFetchBody, PageResponse<AdminBookingRow>>(pageUrl, body);
            const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as PageResponse<AdminBookingRow>);
            setItems(data.items);
            setPage(data.page);
            setTotalPages(data.totalPages);
            setTotal(data.total);
            setLoadedOnce(true);
        } catch {
            showToast(t.User_LoadError(), 'danger');
        } finally {
            setLoading(false);
        }
    }, [pageUrl]);

    React.useEffect(() => {
        if (initialData === null && !loadedOnce) {
            void fetchPage({page: 1});
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const isFirstRunRef = React.useRef(true);
    React.useEffect(() => {
        if (isFirstRunRef.current) {
            isFirstRunRef.current = false;
            return;
        }
        const handle = setTimeout(() => {
            void fetchPage({page: 1});
        }, 300);
        return () => clearTimeout(handle);
    }, [search, status, expertId, userId, dateFrom, dateTo, fetchPage]);

    const handleResetFilters = React.useCallback(() => {
        setSearch('');
        setStatus('');
        setExpertId(0);
        setUserId(0);
        setDateFrom('');
        setDateTo('');
    }, []);

    const handlePageChange = React.useCallback((p: number) => {
        if (p < 1 || p > totalPages || (p === page && !loading)) return;
        void fetchPage({page: p});
    }, [fetchPage, totalPages, page, loading]);

    const expertOptions = React.useMemo(() => buildAccountOptions(experts), [experts]);
    const userOptions = React.useMemo(() => buildAccountOptions(users), [users]);

    return (
        <div data-test-id="admin-bookings-tab">
            <div className="admin-bookings-filters">
                <div className="filter-cell">
                    <label htmlFor="admin-bookings-status">{t.Admin_Filter_Status()}</label>
                    <select
                        id="admin-bookings-status"
                        value={status}
                        onChange={e => setStatus(e.target.value)}
                        className="form-control"
                        data-test-id="admin-bookings-status"
                    >
                        <option value="">{t.Admin_Filter_All()}</option>
                        {allowedStatuses.map(s => (
                            <option key={s} value={s}>{translateStatus(s)}</option>
                        ))}
                    </select>
                </div>
                <div className="filter-cell">
                    <label htmlFor="admin-bookings-search">{t.Admin_Filter_SearchID()}</label>
                    <input
                        id="admin-bookings-search"
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="form-control"
                        data-test-id="admin-bookings-search"
                    />
                </div>
                <div className="filter-cell">
                    <label>{t.Admin_Filter_Expert()}</label>
                    <Combobox
                        options={expertOptions}
                        value={String(expertId)}
                        onChange={v => setExpertId(parseInt(v, 10) || 0)}
                        placeholder={t.Admin_Filter_SelectExpert()}
                        searchPlaceholder={t.Admin_Filter_SearchExpert()}
                        emptyText={t.Admin_Filter_All()}
                        testId="admin-bookings-expert"
                    />
                </div>
                <div className="filter-cell">
                    <label>{t.Admin_Filter_User()}</label>
                    <Combobox
                        options={userOptions}
                        value={String(userId)}
                        onChange={v => setUserId(parseInt(v, 10) || 0)}
                        placeholder={t.Admin_Filter_SelectUser()}
                        searchPlaceholder={t.Admin_Filter_SearchUser()}
                        emptyText={t.Admin_Filter_All()}
                        testId="admin-bookings-user"
                    />
                </div>
                <div className="filter-cell">
                    <label htmlFor="admin-bookings-date-from">{t.Admin_Filter_DateFrom()}</label>
                    <DateInput
                        id="admin-bookings-date-from"
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        data-test-id="admin-bookings-date-from"
                    />
                </div>
                <div className="filter-cell">
                    <label htmlFor="admin-bookings-date-to">{t.Admin_Filter_DateTo()}</label>
                    <DateInput
                        id="admin-bookings-date-to"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        data-test-id="admin-bookings-date-to"
                    />
                </div>
                <div className="filter-actions">
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handleResetFilters}
                        disabled={loading}
                        data-test-id="admin-bookings-reset"
                        aria-label={t.Admin_Filter_ResetAll()}
                        title={t.Admin_Filter_ResetAll()}
                    >
                        {'× '}{t.Admin_Filter_ResetAll()}
                    </button>
                </div>
            </div>

            <div className="mb-3">
                <Pagination
                    page={page}
                    totalPages={totalPages}
                    total={total}
                    loading={loading}
                    onPageChange={handlePageChange}
                    labels={paginationLabels}
                />
            </div>

            {items.length === 0 ? (
                <p className="text-muted">{t.Admin_NoBookings()}</p>
            ) : (
                <div className="card">
                    <div className="overflow-x-auto">
                        <table className="admin-table">
                            <thead>
                                <tr className="border-b border-subtle">
                                    <th className="text-left p-3">ID</th>
                                    <th className="text-left p-3">{t.Admin_Booking_User()}</th>
                                    <th className="text-left p-3">{t.Slot_Expert()}</th>
                                    <th className="text-left p-3">{t.Admin_Booking_Slot()}</th>
                                    <th className="text-left p-3">{t.Admin_Booking_Status()}</th>
                                    <th className="text-left p-3">{t.Admin_Booking_Created()}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map(row => (
                                    <tr
                                        key={row.id}
                                        className="border-b border-subtle"
                                        data-test-id={`admin-booking-row-${row.id}`}
                                    >
                                        <td className="p-3 whitespace-nowrap text-muted">#{row.id}</td>
                                        <td className="p-3">
                                            <EntityLink
                                                name={row.user_name}
                                                {...userLinks(row.user_id, false)}
                                                isModerator={true}
                                            />
                                        </td>
                                        <td className="p-3">
                                            {row.expert_id > 0 ? (
                                                <EntityLink
                                                    name={row.expert_name}
                                                    {...userLinks(row.expert_id, row.expert_has_profile)}
                                                    isModerator={true}
                                                />
                                            ) : <span className="text-muted">—</span>}
                                        </td>
                                        <td className="p-3 whitespace-nowrap">
                                            {row.slot_time
                                                ? formatTs(row.slot_time)
                                                : <span className="text-muted">#{row.bookable_id}</span>}
                                        </td>
                                        <td className="p-3">
                                            <UniversalBadge status={row.status} label={translateStatus(row.status)} />
                                        </td>
                                        <td className="p-3 whitespace-nowrap text-muted text-xs">
                                            {formatTs(row.created_at)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className="mt-3">
                <Pagination
                    page={page}
                    totalPages={totalPages}
                    total={total}
                    loading={loading}
                    onPageChange={handlePageChange}
                    labels={paginationLabels}
                />
            </div>
        </div>
    );
};

export const AdminBookingsIsland: React.FC<Props> = (props) => {
    const {
        pageTitle, activeTab: initialTab, tabs, tabLabels,
        experts, users,
        slotsPayload, slotsPageUrl,
        bookingsPayload, bookingsPageUrl,
        expertCancellationsPayload, expertCancellationsPageUrl,
        userCancellationsPayload, userCancellationsPageUrl,
        allowedStatuses, allowedSlotStatuses,
    } = props;

    const [activeTab, setActiveTab] = React.useState<TabKey>(initialTab);

    React.useEffect(() => {
        const onPopState = () => {
            if (typeof window === 'undefined') return;
            const params = new URLSearchParams(window.location.search);
            const requested = params.get('tab') as TabKey | null;
            if (requested && tabs.includes(requested)) {
                setActiveTab(requested);
            } else {
                setActiveTab(tabs[0]);
            }
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, [tabs]);

    const handleTabClick = React.useCallback((tab: TabKey) => {
        if (tab === activeTab) return;
        if (!tabs.includes(tab)) return;
        setActiveTab(tab);
        pushTabToUrl(tab);
    }, [activeTab, tabs]);

    return (
        <div>
            <PageHeader title={pageTitle} icon={<CalendarRange size={22} aria-hidden="true" />} />
            <div className="section-soft">

            <div className="flex flex-wrap items-center gap-2 mb-4" role="tablist" data-test-id="admin-bookings-section-tabs">
                {tabs.map(tab => {
                    const isActive = tab === activeTab;
                    return (
                        <button
                            key={tab}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            className={`chip ${isActive ? 'chip-active' : ''}`}
                            onClick={() => handleTabClick(tab)}
                            data-test-id={`tabnav-btn-${tab}`}
                        >
                            {tabLabels[tab]}
                        </button>
                    );
                })}
            </div>

            {activeTab === 'slots' && (
                <AdminSlotsTab
                    initialData={slotsPayload}
                    pageUrl={slotsPageUrl}
                    allowedStatuses={allowedSlotStatuses}
                    experts={experts}
                    users={users}
                />
            )}

            {activeTab === 'bookings' && (
                <AdminBookingsTab
                    initialData={bookingsPayload}
                    pageUrl={bookingsPageUrl}
                    allowedStatuses={allowedStatuses}
                    experts={experts}
                    users={users}
                />
            )}

            {activeTab === 'expert-cancellations' && (
                <AdminCancellationsTab
                    initialData={expertCancellationsPayload}
                    pageUrl={expertCancellationsPageUrl}
                    isModerator={true}
                    kind="expert"
                    experts={experts}
                    users={users}
                />
            )}

            {activeTab === 'user-cancellations' && (
                <AdminCancellationsTab
                    initialData={userCancellationsPayload}
                    pageUrl={userCancellationsPageUrl}
                    isModerator={true}
                    kind="user"
                    experts={experts}
                    users={users}
                />
            )}
            </div>
        </div>
    );
};
