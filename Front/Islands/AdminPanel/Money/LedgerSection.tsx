import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {LedgerEntry, LedgerParty, LedgerRefData, GridConfig, PageResponse} from '@/Islands/AdminPanel/Shell/shared/types';
import {AdminGrid} from '@/Islands/AdminPanel/Grid/AdminGrid';
import {Combobox} from '@common/Components/ui/Combobox';
import {DateInput} from '@common/Components/ui/DateInput';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/Time/DateUtils/format/formatTs';
import {AdminUserLink} from '@/Common/people/links/EntityLinks';
import {entryTypeLabel} from '@/Islands/AdminPanel/Grid/gridLabels';
import {statusLabel} from '@/Islands/AdminPanel/Grid/statusLabel';

const ledger_External = t.Ledger_External;
const ledger_RefBooking = t.Ledger_RefBooking;
const ledger_System = t.Ledger_System;
const slot_Cost = t.Slot_Cost;
const slot_DateTime = t.Slot_DateTime;
const slot_Duration = t.Slot_Duration;
const slot_Duration_Min = t.Slot_Duration_Min;
const slot_Format = t.Slot_Format;
const slot_Location = t.Slot_Location;
const slot_Offline = t.Slot_Offline;
const slot_Online = t.Slot_Online;

interface LedgerFilterOptions {
    fromOptions: {value: string; label: string}[];
    toOptions: {value: string; label: string}[];
    entryTypes: string[];
}

interface Props {
    pageUrl: string;
    initialData: PageResponse<LedgerEntry> | null;
    initialFilterOptions: LedgerFilterOptions;
    config: GridConfig;
}

const RefDataPanel: React.FC<{refData: LedgerRefData}> = ({refData}) => (
    <div className="admin-ledger-reference">
        <div className="token-cell-muted">{ledger_RefBooking()} #{refData.booking_id}</div>
        <div>
            <span className="admin-ledger-reference-status">{statusLabel(refData.booking_status)}</span>
        </div>
        {refData.slot_start_at != null && (
            <>
                <div className="token-cell-muted">{slot_DateTime()}</div>
                <div>{formatTs(refData.slot_start_at)}</div>
            </>
        )}
        {refData.slot_duration_min != null && (
            <>
                <div className="token-cell-muted">{slot_Duration()}</div>
                <div>{refData.slot_duration_min} {slot_Duration_Min()}</div>
            </>
        )}
        {refData.slot_cost != null && (
            <>
                <div className="token-cell-muted">{slot_Cost()}</div>
                <div>{refData.slot_cost} &#8381;</div>
            </>
        )}
        {refData.slot_is_online != null && (
            <>
                <div className="token-cell-muted">{slot_Format()}</div>
                <div>{refData.slot_is_online ? slot_Online() : slot_Offline()}</div>
            </>
        )}
        {refData.slot_location && (
            <>
                <div className="token-cell-muted">{slot_Location()}</div>
                <div>{refData.slot_location}</div>
            </>
        )}
    </div>
);

const PartyCell: React.FC<{party: LedgerParty}> = ({party}) => {
    if (party.type === 'external') {
        return <span className="admin-ledger-party-special">{ledger_External()}</span>;
    }
    if (party.type === 'system') {
        return <span className="admin-ledger-party-special">{ledger_System()}</span>;
    }
    if (party.type === 'slot' || party.account_id == null) {
        return (
            <div>
                <span className="admin-ledger-party-label">{party.label ?? '—'}</span>
                {party.sub && <div className="token-registration-ip">{party.sub}</div>}
            </div>
        );
    }
    const accountId = party.account_id;
    return (
        <div>
            <AdminUserLink
                id={accountId}
                name={party.label ?? `#${accountId}`}
                dataTestId={`ledger-party-${accountId}`}
            />
            {party.sub && <div className="token-registration-ip">{party.sub}</div>}
        </div>
    );
};

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
function unixDayStart(dateStr: string): number | null {
    if (!dateStr) return null;
    const ts = new Date(dateStr + 'T00:00:00').getTime();
    return Number.isFinite(ts) ? Math.floor(ts / 1000) : null;
}

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
function unixDayEnd(dateStr: string): number | null {
    if (!dateStr) return null;
    const ts = new Date(dateStr + 'T23:59:59').getTime();
    return Number.isFinite(ts) ? Math.floor(ts / 1000) : null;
}

interface LedgerFilters {
    fromAccountId: number;
    toAccountId: number;
    dateFrom: string;
    dateTo: string;
    entryType: string;
}

const DEFAULT_FILTERS: LedgerFilters = {fromAccountId: 0, toAccountId: 0, dateFrom: '', dateTo: '', entryType: ''};

    /** Формирует представление данных для соответствующего раздела панели. */
function renderTypeOption(type: string) { return <option key={type} value={type}>{entryTypeLabel(type)}</option>; }
    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
function rowKey(row: LedgerEntry) { return row.id; }
    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
function expandable(row: LedgerEntry) { return row.ref_data != null; }
    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
function expandRenderer(row: LedgerEntry) { return row.ref_data ? <RefDataPanel refData={row.ref_data} /> : null; }

const LEDGER_RENDERS = {
    created_at: (row: LedgerEntry) => <span className="token-cell-time">{formatTs(row.created_at)}</span>,
    from: (row: LedgerEntry) => <PartyCell party={row.from} />,
    to: (row: LedgerEntry) => <PartyCell party={row.to} />,
    entry_type: (row: LedgerEntry) => <span className="admin-ledger-entry-type">{entryTypeLabel(row.entry_type)}</span>,
    amount: (row: LedgerEntry) => <>{row.amount} &#8381;</>,
    note: (row: LedgerEntry) => <span className="token-cell-muted">{row.note ?? '—'}</span>,
};

export class LedgerSection extends AntiHookComponent<Props> {
    private readonly ui = new Carburetor<LedgerFilters>({...DEFAULT_FILTERS});
    private readonly filterSnapshot = this.connectSelection(this.ui, state => ({fromAccountId:
        state.fromAccountId, toAccountId: state.toAccountId, dateFrom: state.dateFrom, dateTo: state.dateTo,
        entryType: state.entryType}));
    private paramsCache?: {filters: Readonly<LedgerFilters>; value: Record<string, unknown>};
    private fromCache?: {source: LedgerFilterOptions['fromOptions']; value: LedgerFilterOptions['fromOptions']};
    private toCache?: {source: LedgerFilterOptions['toOptions']; value: LedgerFilterOptions['toOptions']};

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private update(patch: Partial<LedgerFilters>): void { this.ui.setData({...this.ui.getData(), ...patch}); }
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly changeFrom = (value: string) => this.update({fromAccountId: parseInt(value, 10) || 0});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly changeTo = (value: string) => this.update({toAccountId: parseInt(value, 10) || 0});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly changeDateFrom = (event: React.ChangeEvent<HTMLInputElement>) => this.update({dateFrom:
        event.target.value});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly changeDateTo = (event: React.ChangeEvent<HTMLInputElement>) => this.update({dateTo:
        event.target.value});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly changeType = (event: React.ChangeEvent<HTMLSelectElement>) => this.update({entryType:
        event.target.value});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly reset = () => this.ui.setData({...DEFAULT_FILTERS});

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private getOptions() {
        const {fromOptions: from, toOptions: to} = this.props.initialFilterOptions;
        const fromCache = this.fromCache?.source === from ? this.fromCache : {source: from, value: [{value:
        '0', label: t.Admin_Filter_All()}, ...from]};
        const toCache = this.toCache?.source === to ? this.toCache : {source: to, value: [{value: '0', label:
        t.Admin_Filter_All()}, ...to]};
        this.fromCache = fromCache;
        this.toCache = toCache;
        return {fromOptions: fromCache.value, toOptions: toCache.value};
    }

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private extraParams(filters: Readonly<LedgerFilters>) {
        if (this.paramsCache?.filters === filters) return this.paramsCache.value;
        const {fromAccountId, toAccountId, dateFrom, dateTo, entryType} = filters;
        const value = {fromAccountId: fromAccountId || undefined, toAccountId: toAccountId || undefined,
            entryType: entryType || undefined, dateFrom: unixDayStart(dateFrom) ?? undefined, dateTo:
        unixDayEnd(dateTo) ?? undefined};
        this.paramsCache = {filters, value};
        return value;
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    private renderParties({fromAccountId, toAccountId}: Readonly<LedgerFilters>) {
        const {fromOptions, toOptions} = this.getOptions();
        return (
            <>
                <div className="filter-cell">
                    <label>{t.Finance_Filter_From()}</label>
                    <Combobox
                        options={fromOptions}
                        value={String(fromAccountId)}
                        onChange={this.changeFrom}
                        placeholder={t.Admin_Filter_SelectUser()}
                        searchPlaceholder={t.Admin_Filter_SearchUser()}
                        emptyText={t.Finance_Filter_NoMatches()}
                        testId="finance-from-filter"
                    />
                </div>
                <div className="filter-cell">
                    <label>{t.Finance_Filter_To()}</label>
                    <Combobox
                        options={toOptions}
                        value={String(toAccountId)}
                        onChange={this.changeTo}
                        placeholder={t.Admin_Filter_SelectUser()}
                        searchPlaceholder={t.Admin_Filter_SearchUser()}
                        emptyText={t.Finance_Filter_NoMatches()}
                        testId="finance-to-filter"
                    />
                </div>
            </>
        );
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    private renderDates({dateFrom, dateTo}: Readonly<LedgerFilters>) {
        return (
            <>
                <div className="filter-cell">
                    <label htmlFor="finance-date-from">{t.Admin_Filter_DateFrom()}</label>
                    <DateInput
                        id="finance-date-from"
                        value={dateFrom}
                        onChange={this.changeDateFrom}
                        data-test-id="finance-date-from"
                    />
                </div>
                <div className="filter-cell">
                    <label htmlFor="finance-date-to">{t.Admin_Filter_DateTo()}</label>
                    <DateInput
                        id="finance-date-to"
                        value={dateTo}
                        onChange={this.changeDateTo}
                        data-test-id="finance-date-to"
                    />
                </div>
            </>
        );
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    private renderType({entryType}: Readonly<LedgerFilters>) {
        const {entryTypes} = this.props.initialFilterOptions;
        return (
            <>
                <div className="filter-cell">
                    <label htmlFor="finance-type-filter">{t.Finance_Filter_Type()}</label>
                    <select
                        id="finance-type-filter"
                        value={entryType}
                        onChange={this.changeType}
                        className="admin-filter-field"
                        data-test-id="finance-type-filter"
                    >
                        <option value="">{t.Admin_Filter_All()}</option>
                        {entryTypes.map(renderTypeOption)}
                    </select>
                </div>
                <div className="filter-actions">
                    <button
                        type="button"
                        className="admin-filter-reset"
                        onClick={this.reset}
                        data-test-id="finance-reset"
                        aria-label={t.Admin_Filter_ResetAll()}
                        title={t.Admin_Filter_ResetAll()}
                    >
                        {'× '}{t.Admin_Filter_ResetAll()}
                    </button>
                </div>
            </>
        );
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    render() {
        const {pageUrl, initialData, config} = this.props;
        const filters = this.filterSnapshot();
        return (
            <div>
                <div className="admin-bookings-filters">
                    {this.renderParties(filters)}
                    {this.renderDates(filters)}
                    {this.renderType(filters)}
                </div>
                <AdminGrid pageUrl={pageUrl} initialData={initialData} config={config}
        extraParams={this.extraParams(filters)}
                    rowKey={rowKey} emptyMessage={t.Admin_NoLedger()} renders={LEDGER_RENDERS}
        expandable={expandable} expandRenderer={expandRenderer} />
            </div>
        );
    }
}
