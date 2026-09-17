import * as React from 'react';
import Pagination from '@common/Components/Pagination';
import {PageResponse} from '@common/hooks/usePagination';
import {formatTs} from '@common/Utils/DateUtils';
import {DEFAULT_PAGE_SIZE} from '@common/Utils/pagination';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {EntityLink, userLinks} from '../../../Common/people/EntityLinks';
import {UniversalBadge} from '../../../Common/booking/StatusBadge';
import {translateStatus} from '../../../Common/booking/statusHelpers';
import {AccountOption, adminPaginationLabels, buildAccountOptions} from '../adminShared';
import {useAdminPage} from '../useAdminPage';
import {AdminFilterBar, FilterCell} from './AdminFilterBar';
import {AdminSlotRow, EMPTY_FILTERS, SlotsFilters} from './bookingsTypes';

const SlotTr: React.FC<{row: AdminSlotRow}> = ({row}) => (
    <tr className="border-b border-subtle" data-test-id={`admin-slot-row-${row.id}`}>
        <td className="p-3 whitespace-nowrap text-muted">#{row.id}</td>
        <td className="p-3">
            {row.expert_id > 0
                ? <EntityLink name={row.expert_name} {...userLinks(row.expert_id, row.expert_has_profile)} isModerator={true} />
                : <span className="text-muted">—</span>}
        </td>
        <td className="p-3 whitespace-nowrap">
            {row.start_at
                ? <>{formatTs(row.start_at)} — {formatTs(row.end_at)}</>
                : <span className="text-muted">—</span>}
        </td>
        <td className="p-3 whitespace-nowrap">{row.duration_min} {t.Slot_Duration_Min()}</td>
        <td className="p-3 whitespace-nowrap">{row.cost}</td>
        <td className="p-3">
            {row.is_online ? t.Admin_Slot_Online() : (row.location || <span className="text-muted">—</span>)}
        </td>
        <td className="p-3 whitespace-nowrap">{row.max_users}</td>
        <td className="p-3"><UniversalBadge status={row.status} label={translateStatus(row.status)} /></td>
    </tr>
);

const COLUMNS = [
    () => 'ID',
    () => t.Admin_Slot_Expert(),
    () => t.Admin_Slot_Time(),
    () => t.Admin_Slot_Duration(),
    () => t.Admin_Slot_Cost(),
    () => t.Admin_Slot_Location(),
    () => t.Admin_Slot_MaxUsers(),
    () => t.Slot_Status(),
];

const SlotsTable: React.FC<{items: AdminSlotRow[]}> = ({items}) => (
    <div className="card">
        <div className="overflow-x-auto">
            <table className="admin-table">
                <thead>
                    <tr className="border-b border-subtle">
                        {COLUMNS.map((c, i) => <th key={i} className="text-left p-3">{c()}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {items.map(row => <SlotTr key={row.id} row={row} />)}
                </tbody>
            </table>
        </div>
    </div>
);

interface Props {
    initialData: PageResponse<AdminSlotRow> | null;
    pageUrl: string;
    allowedStatuses: string[];
    experts: AccountOption[];
    users: AccountOption[];
}

export const AdminSlotsTab: React.FC<Props> = ({initialData, pageUrl, allowedStatuses, experts, users}) => {
    const [filters, setFilters] = React.useState<SlotsFilters>(EMPTY_FILTERS);

    const buildBody = React.useCallback((f: SlotsFilters, page: number) => ({
        page,
        perPage: DEFAULT_PAGE_SIZE,
        search: f.search,
        status: f.status,
        expert_id: f.expertId,
        // Слоты ищут ученика строкой, а не числом: у эндпоинта своё поле.
        user_q: f.userId > 0 ? String(f.userId) : '',
        date_from: f.dateFrom,
        date_to: f.dateTo,
    }), []);

    const {items, page, totalPages, total, loading, goToPage} = useAdminPage<AdminSlotRow, SlotsFilters>({
        url: pageUrl,
        initialData,
        filters,
        buildBody,
    });

    const patch = (p: Partial<SlotsFilters>) => setFilters(prev => ({...prev, ...p}));
    const expertOptions = React.useMemo(() => buildAccountOptions(experts), [experts]);
    const userOptions = React.useMemo(() => buildAccountOptions(users), [users]);

    const cells: FilterCell[] = [
        {
            kind: 'select',
            id: 'admin-slots-status',
            label: t.Admin_Filter_Status(),
            value: filters.status,
            options: [{value: '', label: t.Admin_Filter_All()}, ...allowedStatuses.map(s => ({value: s, label: translateStatus(s)}))],
            onChange: v => patch({status: v}),
        },
        {kind: 'text', id: 'admin-slots-search', label: t.Admin_Filter_SearchID(), value: filters.search, onChange: v => patch({search: v})},
        {
            kind: 'person',
            id: 'admin-slots-expert',
            label: t.Admin_Filter_Expert(),
            value: filters.expertId,
            options: expertOptions,
            placeholder: t.Admin_Filter_SelectExpert(),
            searchPlaceholder: t.Admin_Filter_SearchExpert(),
            onChange: v => patch({expertId: v}),
        },
        {
            kind: 'person',
            id: 'admin-slots-user',
            label: t.Admin_Filter_User(),
            value: filters.userId,
            options: userOptions,
            placeholder: t.Admin_Filter_SelectUser(),
            searchPlaceholder: t.Admin_Filter_SearchUser(),
            onChange: v => patch({userId: v}),
        },
        {kind: 'date', id: 'admin-slots-date-from', label: t.Admin_Filter_DateFrom(), value: filters.dateFrom, onChange: v => patch({dateFrom: v})},
        {kind: 'date', id: 'admin-slots-date-to', label: t.Admin_Filter_DateTo(), value: filters.dateTo, onChange: v => patch({dateTo: v})},
    ];

    const pager = (
        <Pagination page={page} totalPages={totalPages} total={total} loading={loading} onPageChange={goToPage} labels={adminPaginationLabels} />
    );

    return (
        <div data-test-id="admin-slots-tab">
            <AdminFilterBar cells={cells} loading={loading} resetTestId="admin-slots-reset" onReset={() => setFilters(EMPTY_FILTERS)} />
            <div className="mb-3">{pager}</div>
            {items.length === 0 && <p className="text-muted">{t.Admin_NoSlots()}</p>}
            {items.length > 0 && <SlotsTable items={items} />}
            <div className="mt-3">{pager}</div>
        </div>
    );
};
