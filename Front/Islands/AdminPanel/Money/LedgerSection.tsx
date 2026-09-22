import * as React from 'react';
import {LedgerEntry, LedgerParty, LedgerRefData, GridConfig, PageResponse} from '../Shell/types';
import {AdminGrid, AdminGridHandle} from '../Grid/AdminGrid';
import {Combobox} from '@common/Components/ui/Combobox';
import {DateInput} from '@common/Components/ui/DateInput';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {AdminUserLink} from '../../../Common/people/EntityLinks';
import {statusLabel, entryTypeLabel} from '../Grid/gridRenders';

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
    <div className="p-3 bg-surface-alt border-t text-sm grid grid-cols-2 gap-x-6 gap-y-1">
        <div className="text-muted">{t.Ledger_RefBooking()} #{refData.booking_id}</div>
        <div>
            <span className="badge bg-secondary">{statusLabel(refData.booking_status)}</span>
        </div>
        {refData.slot_start_at != null && (
            <>
                <div className="text-muted">{t.Slot_DateTime()}</div>
                <div>{formatTs(refData.slot_start_at)}</div>
            </>
        )}
        {refData.slot_duration_min != null && (
            <>
                <div className="text-muted">{t.Slot_Duration()}</div>
                <div>{refData.slot_duration_min} {t.Slot_Duration_Min()}</div>
            </>
        )}
        {refData.slot_cost != null && (
            <>
                <div className="text-muted">{t.Slot_Cost()}</div>
                <div>{refData.slot_cost} &#8381;</div>
            </>
        )}
        {refData.slot_is_online != null && (
            <>
                <div className="text-muted">{t.Slot_Format()}</div>
                <div>{refData.slot_is_online ? t.Slot_Online() : t.Slot_Offline()}</div>
            </>
        )}
        {refData.slot_location && (
            <>
                <div className="text-muted">{t.Slot_Location()}</div>
                <div>{refData.slot_location}</div>
            </>
        )}
    </div>
);

const PartyCell: React.FC<{party: LedgerParty}> = ({party}) => {
    if (party.type === 'external') {
        return <span className="text-muted text-xs italic">{t.Ledger_External()}</span>;
    }
    if (party.type === 'system') {
        return <span className="text-muted text-xs italic">{t.Ledger_System()}</span>;
    }
    if (party.type === 'slot' || party.account_id == null) {
        return (
            <div>
                <span className="text-sm text-secondary">{party.label ?? '—'}</span>
                {party.sub && <div className="text-xs text-muted">{party.sub}</div>}
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
            {party.sub && <div className="text-xs text-muted">{party.sub}</div>}
        </div>
    );
};

function unixDayStart(dateStr: string): number | null {
    if (!dateStr) return null;
    const ts = new Date(dateStr + 'T00:00:00').getTime();
    return Number.isFinite(ts) ? Math.floor(ts / 1000) : null;
}

function unixDayEnd(dateStr: string): number | null {
    if (!dateStr) return null;
    const ts = new Date(dateStr + 'T23:59:59').getTime();
    return Number.isFinite(ts) ? Math.floor(ts / 1000) : null;
}

export const LedgerSection: React.FC<Props> = ({pageUrl, initialData, initialFilterOptions, config}) => {
    const [fromAccountId, setFromAccountId] = React.useState<number>(0);
    const [toAccountId, setToAccountId] = React.useState<number>(0);
    const [dateFrom, setDateFrom] = React.useState<string>('');
    const [dateTo, setDateTo] = React.useState<string>('');
    const [entryType, setEntryType] = React.useState<string>('');
    const gridRef = React.useRef<AdminGridHandle<LedgerEntry>>(null);

    const fromOptions = React.useMemo(() => [
        {value: '0', label: t.Admin_Filter_All()},
        ...initialFilterOptions.fromOptions,
    ], [initialFilterOptions.fromOptions]);

    const toOptions = React.useMemo(() => [
        {value: '0', label: t.Admin_Filter_All()},
        ...initialFilterOptions.toOptions,
    ], [initialFilterOptions.toOptions]);

    const entryTypes = initialFilterOptions.entryTypes;

    const extraParams = React.useMemo(() => ({
        fromAccountId: fromAccountId || undefined,
        toAccountId: toAccountId || undefined,
        entryType: entryType || undefined,
        dateFrom: unixDayStart(dateFrom) ?? undefined,
        dateTo: unixDayEnd(dateTo) ?? undefined,
    }), [fromAccountId, toAccountId, entryType, dateFrom, dateTo]);

    const handleReset = React.useCallback(() => {
        setFromAccountId(0);
        setToAccountId(0);
        setDateFrom('');
        setDateTo('');
        setEntryType('');
    }, []);

    return (
        <div>
            <div className="admin-bookings-filters">
                <div className="filter-cell">
                    <label>{t.Finance_Filter_From()}</label>
                    <Combobox
                        options={fromOptions}
                        value={String(fromAccountId)}
                        onChange={v => setFromAccountId(parseInt(v, 10) || 0)}
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
                        onChange={v => setToAccountId(parseInt(v, 10) || 0)}
                        placeholder={t.Admin_Filter_SelectUser()}
                        searchPlaceholder={t.Admin_Filter_SearchUser()}
                        emptyText={t.Finance_Filter_NoMatches()}
                        testId="finance-to-filter"
                    />
                </div>
                <div className="filter-cell">
                    <label htmlFor="finance-date-from">{t.Admin_Filter_DateFrom()}</label>
                    <DateInput
                        id="finance-date-from"
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        data-test-id="finance-date-from"
                    />
                </div>
                <div className="filter-cell">
                    <label htmlFor="finance-date-to">{t.Admin_Filter_DateTo()}</label>
                    <DateInput
                        id="finance-date-to"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        data-test-id="finance-date-to"
                    />
                </div>
                <div className="filter-cell">
                    <label htmlFor="finance-type-filter">{t.Finance_Filter_Type()}</label>
                    <select
                        id="finance-type-filter"
                        value={entryType}
                        onChange={e => setEntryType(e.target.value)}
                        className="form-control"
                        data-test-id="finance-type-filter"
                    >
                        <option value="">{t.Admin_Filter_All()}</option>
                        {entryTypes.map(et => (
                            <option key={et} value={et}>{entryTypeLabel(et)}</option>
                        ))}
                    </select>
                </div>
                <div className="filter-actions">
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handleReset}
                        data-test-id="finance-reset"
                        aria-label={t.Admin_Filter_ResetAll()}
                        title={t.Admin_Filter_ResetAll()}
                    >
                        {'× '}{t.Admin_Filter_ResetAll()}
                    </button>
                </div>
            </div>

            <AdminGrid
                ref={gridRef}
                pageUrl={pageUrl}
                initialData={initialData}
                extraParams={extraParams}
                config={config}
                rowKey={r => r.id}
                emptyMessage={t.Admin_NoLedger()}
                renders={{
                    created_at: r => <span className="text-muted text-xs whitespace-nowrap">{formatTs(r.created_at)}</span>,
                    from:       r => <PartyCell party={r.from} />,
                    to:         r => <PartyCell party={r.to} />,
                    entry_type: r => <span className="font-mono text-sm">{entryTypeLabel(r.entry_type)}</span>,
                    amount:     r => <>{r.amount} &#8381;</>,
                    note:       r => <span className="text-muted">{r.note ?? '—'}</span>,
                }}
                expandable={r => r.ref_data != null}
                expandRenderer={(r) => r.ref_data ? <RefDataPanel refData={r.ref_data} /> : null}
            />
        </div>
    );
};
