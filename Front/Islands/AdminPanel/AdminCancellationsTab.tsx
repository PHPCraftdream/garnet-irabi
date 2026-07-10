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
import {DEFAULT_PAGE_SIZE} from '@common/Utils/pagination';

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

interface AccountOption {
    id: number;
    name: string;
}

interface Props {
    initialData: PageResponse<CancellationRow> | null;
    pageUrl: string;
    isModerator: boolean;
    /** Test-id prefix so expert/user tabs render distinct selectors */
    kind: 'expert' | 'user';
    experts: AccountOption[];
    users: AccountOption[];
    /**
     * Whether to render the user/expert columns. Admins see both.
     */
    showExpertColumn?: boolean;
    showUserColumn?: boolean;
}

interface FetchParams {
    page: number;
    perPage: number;
    search: string;
    dateFrom: string;
    dateTo: string;
    expert_id: number;
    user_id: number;
}

const paginationLabels = {
    prev: t.Pagination_Prev(),
    next: t.Pagination_Next(),
    of: t.Pagination_Of(),
    items: t.Pagination_Items(),
};

function buildAccountOptions(items: AccountOption[]): {value: string; label: string}[] {
    const out: {value: string; label: string}[] = [{value: '0', label: t.Admin_Filter_All()}];
    for (const a of items) {
        out.push({value: String(a.id), label: a.name});
    }
    return out;
}

const AdminCancellationsTab: React.FC<Props> = ({
    initialData, pageUrl, isModerator, kind,
    experts, users,
    showExpertColumn = true, showUserColumn = true,
}) => {
    const [items, setItems] = React.useState<CancellationRow[]>(initialData?.items ?? []);
    const [page, setPage] = React.useState<number>(initialData?.page ?? 1);
    const [totalPages, setTotalPages] = React.useState<number>(initialData?.totalPages ?? 1);
    const [total, setTotal] = React.useState<number>(initialData?.total ?? 0);
    const [loading, setLoading] = React.useState<boolean>(false);
    const [loadedOnce, setLoadedOnce] = React.useState<boolean>(initialData !== null);

    const [search, setSearch] = React.useState<string>('');
    const [dateFrom, setDateFrom] = React.useState<string>('');
    const [dateTo, setDateTo] = React.useState<string>('');
    const [expertId, setExpertId] = React.useState<number>(0);
    const [userId, setUserId] = React.useState<number>(0);

    const stateRef = React.useRef({search, dateFrom, dateTo, expertId, userId});
    stateRef.current = {search, dateFrom, dateTo, expertId, userId};

    const fetchPage = React.useCallback(async (params: Partial<FetchParams> = {}) => {
        const cur = stateRef.current;
        const targetPage = params.page ?? 1;
        const body: FetchParams = {
            page: targetPage,
            perPage: DEFAULT_PAGE_SIZE,
            search: params.search ?? cur.search,
            dateFrom: params.dateFrom ?? cur.dateFrom,
            dateTo: params.dateTo ?? cur.dateTo,
            expert_id: params.expert_id ?? cur.expertId,
            user_id: params.user_id ?? cur.userId,
        };
        setLoading(true);
        try {
            const resp = await sendPost<FetchParams, PageResponse<CancellationRow>>(pageUrl, body);
            const data = ('data' in resp && resp.data) ? resp.data : (resp as unknown as PageResponse<CancellationRow>);
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

    // Lazy-load on first mount when no SSR initial payload was provided.
    React.useEffect(() => {
        if (initialData === null && !loadedOnce) {
            void fetchPage({page: 1});
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-apply with debounce on filter change.
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
    }, [search, dateFrom, dateTo, expertId, userId, fetchPage]);

    const handleResetFilters = React.useCallback(() => {
        setSearch('');
        setDateFrom('');
        setDateTo('');
        setExpertId(0);
        setUserId(0);
    }, []);

    const handlePageChange = React.useCallback((p: number) => {
        if (p < 1 || p > totalPages || (p === page && !loading)) return;
        void fetchPage({page: p});
    }, [fetchPage, totalPages, page, loading]);

    const testIdPrefix = kind === 'expert' ? 'expert-cancellations' : 'user-cancellations';

    const expertOptions = React.useMemo(() => buildAccountOptions(experts), [experts]);
    const userOptions = React.useMemo(() => buildAccountOptions(users), [users]);

    return (
        <div data-test-id={`${testIdPrefix}-tab`}>
            <div className="admin-bookings-filters">
                <div className="filter-cell">
                    <label>{t.Admin_Filter_Expert()}</label>
                    <Combobox
                        options={expertOptions}
                        value={String(expertId)}
                        onChange={v => setExpertId(parseInt(v, 10) || 0)}
                        placeholder={t.Admin_Filter_SelectExpert()}
                        searchPlaceholder={t.Admin_Filter_SearchExpert()}
                        emptyText={t.Admin_Filter_All()}
                        testId={`${testIdPrefix}-expert`}
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
                        testId={`${testIdPrefix}-user`}
                    />
                </div>
                <div className="filter-cell">
                    <label htmlFor={`${testIdPrefix}-date-from`}>{t.Admin_Filter_DateFrom()}</label>
                    <DateInput
                        id={`${testIdPrefix}-date-from`}
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        data-test-id={`${testIdPrefix}-date-from`}
                    />
                </div>
                <div className="filter-cell">
                    <label htmlFor={`${testIdPrefix}-date-to`}>{t.Admin_Filter_DateTo()}</label>
                    <DateInput
                        id={`${testIdPrefix}-date-to`}
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        data-test-id={`${testIdPrefix}-date-to`}
                    />
                </div>
                <div className="filter-cell">
                    <label htmlFor={`${testIdPrefix}-search`}>{t.Admin_Filter_Reason()}</label>
                    <input
                        id={`${testIdPrefix}-search`}
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="form-control"
                        data-test-id={`${testIdPrefix}-search`}
                    />
                </div>
                <div className="filter-actions">
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handleResetFilters}
                        disabled={loading}
                        data-test-id={`${testIdPrefix}-reset`}
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
                <p className="text-muted">{t.Cancellations_Empty()}</p>
            ) : (
                <div className="card">
                    <div className="overflow-x-auto">
                        <table className="admin-table">
                            <thead>
                                <tr className="border-b border-subtle">
                                    <th className="text-left p-3">{t.Cancellations_ColumnDate()}</th>
                                    {showExpertColumn && <th className="text-left p-3">{t.Cancellations_ColumnExpert()}</th>}
                                    {showUserColumn && <th className="text-left p-3">{t.Cancellations_ColumnUser()}</th>}
                                    <th className="text-left p-3">{t.Cancellations_ColumnSlot()}</th>
                                    <th className="text-left p-3">{t.Cancellations_ColumnBooking()}</th>
                                    <th className="text-left p-3">{t.Cancellations_ColumnReason()}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map(row => (
                                    <tr
                                        key={row.id}
                                        className="border-b border-subtle"
                                        data-test-id={`${testIdPrefix}-row-${row.id}`}
                                    >
                                        <td className="p-3 whitespace-nowrap">{formatTs(row.created_at)}</td>
                                        {showExpertColumn && (
                                            <td className="p-3">
                                                <EntityLink
                                                    name={row.expert_name}
                                                    {...userLinks(row.expert_id, row.expert_has_profile)}
                                                    isModerator={isModerator}
                                                />
                                            </td>
                                        )}
                                        {showUserColumn && (
                                            <td className="p-3">
                                                <EntityLink
                                                    name={row.user_name}
                                                    {...userLinks(row.user_id, false)}
                                                    isModerator={isModerator}
                                                />
                                            </td>
                                        )}
                                        <td className="p-3 whitespace-nowrap">
                                            {row.slot_time
                                                ? formatTs(row.slot_time)
                                                : <span className="text-muted">—</span>}
                                        </td>
                                        <td className="p-3">
                                            {row.booking_id > 0
                                                ? <span className="text-muted">#{row.booking_id}</span>
                                                : <span className="text-muted">—</span>}
                                        </td>
                                        <td className="p-3">{row.reason}</td>
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

export default AdminCancellationsTab;
