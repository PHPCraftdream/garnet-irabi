import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
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
        className="booking-cancel-dismiss"
        onClick={onReset}
        data-test-id="balances-reset"
        aria-label={label}
        title={label}
    >×</button>
);

interface AdjustProps {
    row: AccountBalanceRow;
    onAdjust: (row: AccountBalanceRow) => void;
}

class AdjustBalanceButton extends AntiHookComponent<AdjustProps> {
    private readonly adjust = () => this.props.onAdjust(this.props.row);

    render() {
        const {row} = this.props;
        const label = t.Admin_Balance_Adjust();
        return <button type="button" className="compact-outline-action" onClick={this.adjust}
            data-test-id={`balance-adjust-${row.account_id}`} title={label} aria-label={label}>{label}</button>;
    }
}

interface BalanceState {
    accountId: string;
    dateFrom: string;
    dateTo: string;
    adjusting: AccountBalanceRow | null;
}

function balanceRowKey(row: AccountBalanceRow) { return row.id; }

function renderAccount(row: AccountBalanceRow) {
    return <AdminUserLink id={row.account_id} name={row.name || row.login} role={row.type} />;
}

function renderBalance(row: AccountBalanceRow) {
    return <span className="admin-money-balance" data-negative={row.balance < 0}>{row.balance} &#8381;</span>;
}

function renderUpdated(row: AccountBalanceRow) {
    return <span className="token-registration-ip">{formatTs(row.updated_at)}</span>;
}

export class BalancesSection extends AntiHookComponent<Props> {
    private readonly ui = new Carburetor<BalanceState>({accountId: '', dateFrom: '', dateTo: '', adjusting: null});
    private readonly adjusting = this.connectSelection(this.ui, state => state.adjusting);
    private readonly gridRef = React.createRef<AdminGridHandle<AccountBalanceRow>>();
    private optionsCache?: {source: Props['initialAccountOptions']; label: string; result: Props['initialAccountOptions']};
    private paramsCache?: {accountId: string; dateFrom: string; dateTo: string; result: Record<string, string | number | undefined>};
    private configCache?: {source: GridConfig; result: GridConfig};

    private update(patch: Partial<BalanceState>): void {
        this.ui.setData({...this.ui.getData(), ...patch});
    }

    private readonly changeAccount = (accountId: string) => this.update({accountId});
    private readonly changeFrom = (event: React.ChangeEvent<HTMLInputElement>) => this.update({dateFrom: event.target.value});
    private readonly changeTo = (event: React.ChangeEvent<HTMLInputElement>) => this.update({dateTo: event.target.value});
    private readonly reset = () => this.update({accountId: '', dateFrom: '', dateTo: ''});
    private readonly open = (adjusting: AccountBalanceRow) => this.update({adjusting});
    private readonly close = () => this.update({adjusting: null});

    private readonly adjusted = (accountId: number, balance: number, updated_at: number) => {
        this.gridRef.current?.setItems(previous => {
            const index = previous.findIndex(row => row.account_id === accountId);
            if (index < 0) return previous;
            const next = previous.slice();
            next[index] = {...next[index], balance, updated_at};
            return next;
        });
    };

    private readonly renderAction = (row: AccountBalanceRow) => this.props.canAdjust ? <AdjustBalanceButton row={row} onAdjust={this.open} /> : null;
    private readonly renders = {name: renderAccount, balance: renderBalance, updated_at: renderUpdated, actions: this.renderAction};

    private accountOptions(label: string) {
        const {initialAccountOptions: source} = this.props;
        if (this.optionsCache?.source === source && this.optionsCache.label === label) return this.optionsCache.result;
        const result = [{value: '', label}, ...source];
        this.optionsCache = {source, label, result};
        return result;
    }

    private extraParams(accountId: string, dateFrom: string, dateTo: string) {
        const cached = this.paramsCache;
        if (cached?.accountId === accountId && cached.dateFrom === dateFrom && cached.dateTo === dateTo) return cached.result;
        const result = {
            accountId: accountId || undefined,
            dateFrom: dateFrom ? Math.floor(new Date(dateFrom + 'T00:00:00Z').getTime() / 1000) : undefined,
            dateTo: dateTo ? Math.floor(new Date(dateTo + 'T23:59:59Z').getTime() / 1000) : undefined,
        };
        this.paramsCache = {accountId, dateFrom, dateTo, result};
        return result;
    }

    private gridConfig(): GridConfig {
        const {config, canAdjust} = this.props;
        if (!canAdjust) return config;
        if (this.configCache?.source === config) return this.configCache.result;
        const result: GridConfig = {...config, columns: [...config.columns, {key: 'actions', label: '', shrink: true}]};
        this.configCache = {source: config, result};
        return result;
    }

    private renderFilters(accountId: string, dateFrom: string, dateTo: string) {
        const allLabel = t.Admin_Filter_All();
        return (
            <div className="admin-bookings-filters">
                <FilterCell label={t.Admin_Filter_User()}>
                    <Combobox options={this.accountOptions(allLabel)} value={accountId} onChange={this.changeAccount}
                        placeholder={allLabel} searchPlaceholder={t.Admin_Filter_SearchUser()} testId="balances-account-filter" />
                </FilterCell>
                <FilterCell label={t.Admin_Filter_DateFrom()} htmlFor="balances-date-from">
                    <DateInput id="balances-date-from" value={dateFrom} onChange={this.changeFrom} data-test-id="balances-date-from" />
                </FilterCell>
                <FilterCell label={t.Admin_Filter_DateTo()} htmlFor="balances-date-to">
                    <DateInput id="balances-date-to" value={dateTo} onChange={this.changeTo} data-test-id="balances-date-to" />
                </FilterCell>
                <div className="filter-actions">
                    {(accountId || dateFrom || dateTo) && <ResetFilterButton label={t.Admin_Filter_ResetAll()} onReset={this.reset} />}
                </div>
            </div>
        );
    }

    render() {
        const {pageUrl, initialData, adjustUrl} = this.props;
        const {accountId, dateFrom, dateTo} = this.useCarburetor(this.ui);
        const adjusting = this.adjusting();
        return (
            <div>
                {this.renderFilters(accountId, dateFrom, dateTo)}
                <AdminGrid ref={this.gridRef} pageUrl={pageUrl} initialData={initialData}
                    extraParams={this.extraParams(accountId, dateFrom, dateTo)} config={this.gridConfig()}
                    rowKey={balanceRowKey} emptyMessage={t.Admin_NoBalances()} renders={this.renders} />
                {adjusting && <BalanceAdjustModal row={adjusting} adjustUrl={adjustUrl} onClose={this.close} onAdjusted={this.adjusted} />}
            </div>
        );
    }
}
