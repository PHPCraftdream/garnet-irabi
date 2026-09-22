import * as React from 'react';
import {useMemo, useRef, useState} from 'react';
import {AccountBalanceRow, GridConfig, PageResponse} from '../Shell/types';
import {AdminGrid, AdminGridHandle} from '../Grid/AdminGrid';
import {Combobox} from '@common/Components/ui/Combobox';
import {DateInput} from '@common/Components/ui/DateInput';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {AdminUserLink} from '../../../Common/people/EntityLinks';
import {BalanceAdjustModal} from './BalanceAdjustModal';

interface Props {
    pageUrl: string;
    initialData: PageResponse<AccountBalanceRow> | null;
    initialAccountOptions: {value: string; label: string}[];
    config: GridConfig;
    adjustUrl: string;
    canAdjust: boolean;
}

const FilterCell: React.FC<{
    label: string;
    htmlFor?: string;
    children: React.ReactNode;
}> = ({label, htmlFor, children}) => (
    <div className="filter-cell">
        <label htmlFor={htmlFor}>{label}</label>
        {children}
    </div>
);

const ResetFilterButton: React.FC<{
    label: string;
    onReset: () => void;
}> = ({label, onReset}) => (
    <button
        type="button"
        className="btn btn-sm btn-outline-secondary"
        onClick={onReset}
        data-test-id="balances-reset"
        aria-label={label}
        title={label}
    >×</button>
);

const AdjustBalanceButton: React.FC<{
    row: AccountBalanceRow;
    onAdjust: (row: AccountBalanceRow) => void;
}> = ({row, onAdjust}) => (
    <button
        type="button"
        className="btn btn-sm btn-outline-primary"
        onClick={() => onAdjust(row)}
        data-test-id={`balance-adjust-${row.account_id}`}
        title={t.Admin_Balance_Adjust()}
        aria-label={t.Admin_Balance_Adjust()}
    >
        {t.Admin_Balance_Adjust()}
    </button>
);

export const BalancesSection: React.FC<Props> = ({pageUrl, initialData, initialAccountOptions, config, adjustUrl, canAdjust}) => {
    const [accountId, setAccountId] = useState<string>('');
    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');
    const [adjusting, setAdjusting] = useState<AccountBalanceRow | null>(null);
    const gridRef = useRef<AdminGridHandle<AccountBalanceRow>>(null);

    const allLabel = t.Admin_Filter_All();

    const accountOptions = useMemo(
        () => [{value: '', label: allLabel}, ...initialAccountOptions],
        [initialAccountOptions, allLabel],
    );

    const extraParams = useMemo(() => ({
        accountId: accountId || undefined,
        dateFrom: dateFrom ? Math.floor(new Date(dateFrom + 'T00:00:00Z').getTime() / 1000) : undefined,
        dateTo: dateTo ? Math.floor(new Date(dateTo + 'T23:59:59Z').getTime() / 1000) : undefined,
    }), [accountId, dateFrom, dateTo]);

    const hasActive = !!(accountId || dateFrom || dateTo);
    const reset = () => {
        setAccountId('');
        setDateFrom('');
        setDateTo('');
    };

    const handleAdjusted = (acctId: number, newBalance: number, updatedAt: number) => {
        gridRef.current?.setItems(prev => prev.map(b => b.account_id === acctId
            ? {...b, balance: newBalance, updated_at: updatedAt}
            : b
        ));
    };

    // Append a synthetic "actions" column on top of the PHP-supplied config —
    // only when the viewer may adjust (owner/admin). Moderators get a read-only
    // grid, matching the server-side owner-only gate on ~adjustBalance.
    const configWithActions = useMemo<GridConfig>(() => (canAdjust ? {
        ...config,
        columns: [
            ...config.columns,
            {key: 'actions', label: '', shrink: true},
        ],
    } : config), [config, canAdjust]);

    return (
        <div>
            <div className="admin-bookings-filters">
                <FilterCell label={t.Admin_Filter_User()}>
                    <Combobox
                        options={accountOptions}
                        value={accountId}
                        onChange={setAccountId}
                        placeholder={allLabel}
                        searchPlaceholder={t.Admin_Filter_SearchUser()}
                        testId="balances-account-filter"
                    />
                </FilterCell>
                <FilterCell label={t.Admin_Filter_DateFrom()} htmlFor="balances-date-from">
                    <DateInput
                        id="balances-date-from"
                        className="text-sm"
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        data-test-id="balances-date-from"
                    />
                </FilterCell>
                <FilterCell label={t.Admin_Filter_DateTo()} htmlFor="balances-date-to">
                    <DateInput
                        id="balances-date-to"
                        className="text-sm"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        data-test-id="balances-date-to"
                    />
                </FilterCell>
                <div className="filter-actions">
                    {hasActive && <ResetFilterButton label={t.Admin_Filter_ResetAll()} onReset={reset} />}
                </div>
            </div>

            <AdminGrid
                ref={gridRef}
                pageUrl={pageUrl}
                initialData={initialData}
                extraParams={extraParams}
                config={configWithActions}
                rowKey={r => r.id}
                emptyMessage={t.Admin_NoBalances()}
                renders={{
                    name:       r => <AdminUserLink id={r.account_id} name={r.name || r.login} role={r.type} />,
                    balance:    r => <span className={`font-medium ${r.balance < 0 ? 'text-danger' : 'text-success'}`}>{r.balance} &#8381;</span>,
                    updated_at: r => <span className="text-muted text-xs">{formatTs(r.updated_at)}</span>,
                    actions:    r => canAdjust ? <AdjustBalanceButton row={r} onAdjust={setAdjusting} /> : null,
                }}
            />

            {adjusting && (
                <BalanceAdjustModal
                    row={adjusting}
                    adjustUrl={adjustUrl}
                    onClose={() => setAdjusting(null)}
                    onAdjusted={handleAdjusted}
                />
            )}
        </div>
    );
};
