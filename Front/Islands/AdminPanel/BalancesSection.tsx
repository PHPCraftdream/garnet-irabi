import * as React from 'react';
import {useMemo, useState} from 'react';
import {AccountBalanceRow, GridConfig} from './types';
import {AdminGrid} from './AdminGrid';
import {Combobox} from '@common/Components/ui/Combobox';
import {DateInput} from '@common/Components/ui/DateInput';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/DateUtils';
import {AdminUserLink} from '../../Common/EntityLinks';
import {BalanceAdjustModal} from './BalanceAdjustModal';

interface Props {
    balances: AccountBalanceRow[];
    config: GridConfig;
    adjustUrl: string;
}

export const BalancesSection: React.FC<Props> = ({balances: initialBalances, config, adjustUrl}) => {
    const [balances, setBalances] = useState<AccountBalanceRow[]>(initialBalances);
    const [accountId, setAccountId] = useState<string>('');
    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');
    const [adjusting, setAdjusting] = useState<AccountBalanceRow | null>(null);

    const allLabel = t.Admin_Filter_All();

    const accountOptions = useMemo(() => {
        const arr = balances.map(b => ({
            value: String(b.account_id),
            label: b.name || b.login || `#${b.account_id}`,
        }));
        arr.sort((a, b) => a.label.localeCompare(b.label));
        return [{value: '', label: allLabel}, ...arr];
    }, [balances, allLabel]);

    const filtered = useMemo(() => {
        let res = balances;
        if (accountId) res = res.filter(b => String(b.account_id) === accountId);
        if (dateFrom) {
            const tsFrom = Math.floor(new Date(dateFrom + 'T00:00:00Z').getTime() / 1000);
            res = res.filter(b => b.updated_at >= tsFrom);
        }
        if (dateTo) {
            const tsTo = Math.floor(new Date(dateTo + 'T23:59:59Z').getTime() / 1000);
            res = res.filter(b => b.updated_at <= tsTo);
        }
        return res;
    }, [balances, accountId, dateFrom, dateTo]);

    const hasActive = !!(accountId || dateFrom || dateTo);
    const reset = () => {
        setAccountId('');
        setDateFrom('');
        setDateTo('');
    };

    const handleAdjusted = (acctId: number, newBalance: number, updatedAt: number) => {
        setBalances(prev => prev.map(b => b.account_id === acctId
            ? {...b, balance: newBalance, updated_at: updatedAt}
            : b
        ));
    };

    // Append a synthetic "actions" column on top of the PHP-supplied config
    const configWithActions = useMemo<GridConfig>(() => ({
        ...config,
        columns: [
            ...config.columns,
            {key: 'actions', label: '', shrink: true},
        ],
    }), [config]);

    return (
        <div>
            <div className="admin-bookings-filters">
                <div className="filter-cell">
                    <label>{t.Admin_Filter_User()}</label>
                    <Combobox
                        options={accountOptions}
                        value={accountId}
                        onChange={setAccountId}
                        placeholder={allLabel}
                        searchPlaceholder={t.Admin_Filter_SearchUser()}
                        testId="balances-account-filter"
                    />
                </div>
                <div className="filter-cell">
                    <label htmlFor="balances-date-from">{t.Admin_Filter_DateFrom()}</label>
                    <DateInput
                        id="balances-date-from"
                        className="text-sm"
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        data-test-id="balances-date-from"
                    />
                </div>
                <div className="filter-cell">
                    <label htmlFor="balances-date-to">{t.Admin_Filter_DateTo()}</label>
                    <DateInput
                        id="balances-date-to"
                        className="text-sm"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        data-test-id="balances-date-to"
                    />
                </div>
                <div className="filter-actions">
                    {hasActive && (
                        <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={reset}
                            data-test-id="balances-reset"
                            aria-label={t.Admin_Filter_ResetAll()}
                            title={t.Admin_Filter_ResetAll()}
                        >×</button>
                    )}
                </div>
            </div>

            <AdminGrid
                rows={filtered}
                config={configWithActions}
                rowKey={r => r.id}
                emptyMessage={t.Admin_NoBalances()}
                renders={{
                    name:       r => <AdminUserLink id={r.account_id} name={r.name || r.login} role={r.type} />,
                    balance:    r => (
                        <span className={`font-medium ${r.balance < 0 ? 'text-danger' : 'text-success'}`}>
                            {r.balance} &#8381;
                        </span>
                    ),
                    updated_at: r => <span className="text-muted text-xs">{formatTs(r.updated_at)}</span>,
                    actions:    r => (
                        <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => setAdjusting(r)}
                            data-test-id={`balance-adjust-${r.account_id}`}
                            title={t.Admin_Balance_Adjust()}
                            aria-label={t.Admin_Balance_Adjust()}
                        >
                            {t.Admin_Balance_Adjust()}
                        </button>
                    ),
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
