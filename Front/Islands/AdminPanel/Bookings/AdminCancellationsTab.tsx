import * as React from 'react';
import Pagination from '@common/Components/Layout/Paging/Pagination';
import {PageResponse} from '@common/hooks/data/usePagination';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {EntityLink} from '../../../Common/people/EntityLink';
import {userLinks} from '../../../Common/people/entityLinkHelpers';
import {AccountOption, adminPaginationLabels, buildAccountOptions} from '../Shell/adminShared';
import {useAdminPage} from '../Shell/useAdminPage';
import {AdminFilterBar, FilterCell} from './AdminFilterBar';

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

interface RowProps {
    row: CancellationRow;
    testIdPrefix: string;
    isModerator: boolean;
    showExpertColumn: boolean;
    showUserColumn: boolean;
}

const CancellationTr: React.FC<RowProps> = ({row, testIdPrefix, isModerator, showExpertColumn, showUserColumn}) => (
    <tr className="border-b border-subtle" data-test-id={`${testIdPrefix}-row-${row.id}`}>
        <td className="p-3 whitespace-nowrap">{formatTs(row.created_at)}</td>
        {showExpertColumn && (
            <td className="p-3">
                <EntityLink name={row.expert_name} {...userLinks(row.expert_id, row.expert_has_profile)} isModerator={isModerator} />
            </td>
        )}
        {showUserColumn && (
            <td className="p-3">
                <EntityLink name={row.user_name} {...userLinks(row.user_id, false)} isModerator={isModerator} />
            </td>
        )}
        <td className="p-3 whitespace-nowrap">
            {row.slot_time ? formatTs(row.slot_time) : <span className="text-muted">—</span>}
        </td>
        <td className="p-3">
            {row.booking_id > 0 ? <span className="text-muted">#{row.booking_id}</span> : <span className="text-muted">—</span>}
        </td>
        <td className="p-3">{row.reason}</td>
    </tr>
);

interface TableProps {
    items: CancellationRow[];
    columns: string[];
    testIdPrefix: string;
    isModerator: boolean;
    showExpertColumn: boolean;
    showUserColumn: boolean;
}

const CancellationsTable: React.FC<TableProps> = ({items, columns, ...rowProps}) => (
    <div className="card">
        <div className="overflow-x-auto">
            <table className="admin-table">
                <thead>
                    <tr className="border-b border-subtle">
                        {columns.map((c, i) => <th key={i} className="text-left p-3">{c}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {items.map(row => <CancellationTr key={row.id} row={row} {...rowProps} />)}
                </tbody>
            </table>
        </div>
    </div>
);

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

const AdminCancellationsTab: React.FC<Props> = ({
    initialData,
    pageUrl,
    isModerator,
    kind,
    experts,
    users,
    showExpertColumn = true,
    showUserColumn = true,
}) => {
    const [filters, setFilters] = React.useState<Filters>(EMPTY);

    const buildBody = React.useCallback((f: Filters, page: number, perPage: number) => ({
        page,
        perPage,
        search: f.search,
        dateFrom: f.dateFrom,
        dateTo: f.dateTo,
        expert_id: f.expertId,
        user_id: f.userId,
    }), []);

    const {items, page, perPage, totalPages, total, loading, goToPage, setPerPage} = useAdminPage<CancellationRow, Filters>({
        url: pageUrl,
        initialData,
        filters,
        buildBody,
    });

    const testIdPrefix = kind === 'expert' ? 'expert-cancellations' : 'user-cancellations';
    const patch = (p: Partial<Filters>) => setFilters(prev => ({...prev, ...p}));
    const expertOptions = React.useMemo(() => buildAccountOptions(experts), [experts]);
    const userOptions = React.useMemo(() => buildAccountOptions(users), [users]);

    const cells: FilterCell[] = [
        {
            kind: 'person',
            id: `${testIdPrefix}-expert`,
            label: t.Admin_Filter_Expert(),
            value: filters.expertId,
            options: expertOptions,
            placeholder: t.Admin_Filter_SelectExpert(),
            searchPlaceholder: t.Admin_Filter_SearchExpert(),
            onChange: v => patch({expertId: v}),
        },
        {
            kind: 'person',
            id: `${testIdPrefix}-user`,
            label: t.Admin_Filter_User(),
            value: filters.userId,
            options: userOptions,
            placeholder: t.Admin_Filter_SelectUser(),
            searchPlaceholder: t.Admin_Filter_SearchUser(),
            onChange: v => patch({userId: v}),
        },
        {kind: 'date', id: `${testIdPrefix}-date-from`, label: t.Admin_Filter_DateFrom(), value: filters.dateFrom, onChange: v => patch({dateFrom: v})},
        {kind: 'date', id: `${testIdPrefix}-date-to`, label: t.Admin_Filter_DateTo(), value: filters.dateTo, onChange: v => patch({dateTo: v})},
        {kind: 'text', id: `${testIdPrefix}-search`, label: t.Admin_Filter_Reason(), value: filters.search, onChange: v => patch({search: v})},
    ];

    const columns = [
        t.Cancellations_ColumnDate(),
        ...(showExpertColumn ? [t.Cancellations_ColumnExpert()] : []),
        ...(showUserColumn ? [t.Cancellations_ColumnUser()] : []),
        t.Cancellations_ColumnSlot(),
        t.Cancellations_ColumnBooking(),
        t.Cancellations_ColumnReason(),
    ];

    const pager = (
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

    return (
        <div data-test-id={`${testIdPrefix}-tab`}>
            <AdminFilterBar cells={cells} loading={loading} resetTestId={`${testIdPrefix}-reset`} onReset={() => setFilters(EMPTY)} />
            <div className="mb-3">{pager}</div>
            {items.length === 0 && <p className="text-muted">{t.Cancellations_Empty()}</p>}
            {items.length > 0 && (
                <CancellationsTable
                    items={items}
                    columns={columns}
                    testIdPrefix={testIdPrefix}
                    isModerator={isModerator}
                    showExpertColumn={showExpertColumn}
                    showUserColumn={showUserColumn}
                />
            )}
            <div className="mt-3">{pager}</div>
        </div>
    );
};

export default AdminCancellationsTab;
