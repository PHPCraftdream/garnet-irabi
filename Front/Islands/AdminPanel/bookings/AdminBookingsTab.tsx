import * as React from 'react';
import Pagination from '@common/Components/Layout/Paging/Pagination';
import {PageResponse} from '@common/hooks/data/usePagination';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {DEFAULT_PAGE_SIZE} from '@common/Utils/Data/pagination';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {EntityLink} from '../../../Common/people/EntityLink';
import {userLinks} from '../../../Common/people/entityLinkHelpers';
import {UniversalBadge} from '../../../Common/booking/StatusBadge';
import {translateStatus} from '../../../Common/booking/statusHelpers';
import {AccountOption, adminPaginationLabels, buildAccountOptions} from '../Shell/adminShared';
import {useAdminPage} from '../Shell/useAdminPage';
import {AdminFilterBar, FilterCell} from './AdminFilterBar';
import {AdminBookingRow, BookingsFilters, EMPTY_FILTERS} from './bookingsTypes';

const BookingTr: React.FC<{row: AdminBookingRow}> = ({row}) => (
    <tr className="border-b border-subtle" data-test-id={`admin-booking-row-${row.id}`}>
        <td className="p-3 whitespace-nowrap text-muted">#{row.id}</td>
        <td className="p-3">
            <EntityLink name={row.user_name} {...userLinks(row.user_id, false)} isModerator={true} />
        </td>
        <td className="p-3">
            {row.expert_id > 0
                ? <EntityLink name={row.expert_name} {...userLinks(row.expert_id, row.expert_has_profile)} isModerator={true} />
                : <span className="text-muted">—</span>}
        </td>
        <td className="p-3 whitespace-nowrap">
            {row.slot_time ? formatTs(row.slot_time) : <span className="text-muted">#{row.bookable_id}</span>}
        </td>
        <td className="p-3"><UniversalBadge status={row.status} label={translateStatus(row.status)} /></td>
        <td className="p-3 whitespace-nowrap text-muted text-xs">{formatTs(row.created_at)}</td>
    </tr>
);

const COLUMNS = [
    () => 'ID',
    () => t.Admin_Booking_User(),
    () => t.Slot_Expert(),
    () => t.Admin_Booking_Slot(),
    () => t.Admin_Booking_Status(),
    () => t.Admin_Booking_Created(),
];

const BookingsTable: React.FC<{items: AdminBookingRow[]}> = ({items}) => (
    <div className="card">
        <div className="overflow-x-auto">
            <table className="admin-table">
                <thead>
                    <tr className="border-b border-subtle">
                        {COLUMNS.map((c, i) => <th key={i} className="text-left p-3">{c()}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {items.map(row => <BookingTr key={row.id} row={row} />)}
                </tbody>
            </table>
        </div>
    </div>
);

interface Props {
    initialData: PageResponse<AdminBookingRow> | null;
    pageUrl: string;
    allowedStatuses: string[];
    experts: AccountOption[];
    users: AccountOption[];
}

export const AdminBookingsTab: React.FC<Props> = ({initialData, pageUrl, allowedStatuses, experts, users}) => {
    const [filters, setFilters] = React.useState<BookingsFilters>(EMPTY_FILTERS);

    const buildBody = React.useCallback((f: BookingsFilters, page: number) => ({
        page,
        perPage: DEFAULT_PAGE_SIZE,
        search: f.search,
        status: f.status,
        expert_id: f.expertId,
        user_id: f.userId,
        date_from: f.dateFrom,
        date_to: f.dateTo,
    }), []);

    const {items, page, totalPages, total, loading, goToPage} = useAdminPage<AdminBookingRow, BookingsFilters>({
        url: pageUrl,
        initialData,
        filters,
        buildBody,
    });

    const patch = (p: Partial<BookingsFilters>) => setFilters(prev => ({...prev, ...p}));
    const expertOptions = React.useMemo(() => buildAccountOptions(experts), [experts]);
    const userOptions = React.useMemo(() => buildAccountOptions(users), [users]);

    const cells: FilterCell[] = [
        {
            kind: 'select',
            id: 'admin-bookings-status',
            label: t.Admin_Filter_Status(),
            value: filters.status,
            options: [{value: '', label: t.Admin_Filter_All()}, ...allowedStatuses.map(s => ({value: s, label: translateStatus(s)}))],
            onChange: v => patch({status: v}),
        },
        {kind: 'text', id: 'admin-bookings-search', label: t.Admin_Filter_SearchID(), value: filters.search, onChange: v => patch({search: v})},
        {
            kind: 'person',
            id: 'admin-bookings-expert',
            label: t.Admin_Filter_Expert(),
            value: filters.expertId,
            options: expertOptions,
            placeholder: t.Admin_Filter_SelectExpert(),
            searchPlaceholder: t.Admin_Filter_SearchExpert(),
            onChange: v => patch({expertId: v}),
        },
        {
            kind: 'person',
            id: 'admin-bookings-user',
            label: t.Admin_Filter_User(),
            value: filters.userId,
            options: userOptions,
            placeholder: t.Admin_Filter_SelectUser(),
            searchPlaceholder: t.Admin_Filter_SearchUser(),
            onChange: v => patch({userId: v}),
        },
        {kind: 'date', id: 'admin-bookings-date-from', label: t.Admin_Filter_DateFrom(), value: filters.dateFrom, onChange: v => patch({dateFrom: v})},
        {kind: 'date', id: 'admin-bookings-date-to', label: t.Admin_Filter_DateTo(), value: filters.dateTo, onChange: v => patch({dateTo: v})},
    ];

    const pager = (
        <Pagination page={page} totalPages={totalPages} total={total} loading={loading} onPageChange={goToPage} labels={adminPaginationLabels} />
    );

    return (
        <div data-test-id="admin-bookings-tab">
            <AdminFilterBar cells={cells} loading={loading} resetTestId="admin-bookings-reset" onReset={() => setFilters(EMPTY_FILTERS)} />
            <div className="mb-3">{pager}</div>
            {items.length === 0 && <p className="text-muted">{t.Admin_NoBookings()}</p>}
            {items.length > 0 && <BookingsTable items={items} />}
            <div className="mt-3">{pager}</div>
        </div>
    );
};
