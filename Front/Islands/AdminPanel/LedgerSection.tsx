import * as React from 'react';
import {LedgerEntry, LedgerParty, LedgerRefData, GridConfig} from './types';
import {AdminGrid} from './AdminGrid';
import {Combobox} from '@common/Components/ui/Combobox';
import {DateInput} from '@common/Components/ui/DateInput';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/DateUtils';
import {AdminUserLink} from '../../Common/EntityLinks';
import {statusLabel, entryTypeLabel} from './gridRenders';

interface Props {
    ledger: LedgerEntry[];
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

interface AccountOption {
    id: number;
    label: string;
}

function collectAccounts(ledger: LedgerEntry[], side: 'from' | 'to'): AccountOption[] {
    const seen = new Map<number, string>();
    for (const row of ledger) {
        const party = row[side];
        if (party.type === 'account' && party.account_id != null && !seen.has(party.account_id)) {
            seen.set(party.account_id, party.label ?? `#${party.account_id}`);
        }
    }
    return Array.from(seen.entries())
        .map(([id, label]) => ({id, label}))
        .sort((a, b) => a.label.localeCompare(b.label));
}

function collectEntryTypes(ledger: LedgerEntry[]): string[] {
    const seen = new Set<string>();
    for (const row of ledger) seen.add(row.entry_type);
    return Array.from(seen).sort();
}

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

export const LedgerSection: React.FC<Props> = ({ledger, config}) => {
    const [fromAccountId, setFromAccountId] = React.useState<number>(0);
    const [toAccountId, setToAccountId] = React.useState<number>(0);
    const [dateFrom, setDateFrom] = React.useState<string>('');
    const [dateTo, setDateTo] = React.useState<string>('');
    const [entryType, setEntryType] = React.useState<string>('');
    const [searchQuery, setSearchQuery] = React.useState<string>('');

    const fromOptions = React.useMemo(() => {
        const accs = collectAccounts(ledger, 'from');
        return [
            {value: '0', label: t.Admin_Filter_All()},
            ...accs.map(a => ({value: String(a.id), label: a.label})),
        ];
    }, [ledger]);

    const toOptions = React.useMemo(() => {
        const accs = collectAccounts(ledger, 'to');
        return [
            {value: '0', label: t.Admin_Filter_All()},
            ...accs.map(a => ({value: String(a.id), label: a.label})),
        ];
    }, [ledger]);

    const entryTypes = React.useMemo(() => collectEntryTypes(ledger), [ledger]);

    const filtered = React.useMemo(() => {
        const dfTs = unixDayStart(dateFrom);
        const dtTs = unixDayEnd(dateTo);
        const searchLc = searchQuery.trim().toLowerCase();

        return ledger.filter(row => {
            if (fromAccountId > 0) {
                if (row.from.type !== 'account' || row.from.account_id !== fromAccountId) return false;
            }
            if (toAccountId > 0) {
                if (row.to.type !== 'account' || row.to.account_id !== toAccountId) return false;
            }
            if (dfTs != null && row.created_at < dfTs) return false;
            if (dtTs != null && row.created_at > dtTs) return false;
            if (entryType && row.entry_type !== entryType) return false;
            // Single free-text search across the text of every column: from/to
            // party names, entry type, note, amount and the formatted date.
            if (searchLc) {
                const blob = [
                    row.from?.label, row.to?.label,
                    entryTypeLabel(row.entry_type),
                    row.note, String(row.amount),
                    formatTs(row.created_at),
                ].filter(Boolean).join(' ').toLowerCase();
                if (!blob.includes(searchLc)) return false;
            }
            return true;
        });
    }, [ledger, fromAccountId, toAccountId, dateFrom, dateTo, entryType, searchQuery]);

    const handleReset = React.useCallback(() => {
        setFromAccountId(0);
        setToAccountId(0);
        setDateFrom('');
        setDateTo('');
        setEntryType('');
        setSearchQuery('');
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
                <div className="filter-cell">
                    <label htmlFor="finance-search">{t.Comment_Filter_Search()}</label>
                    <input
                        id="finance-search"
                        type="search"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder={t.Grid_Search()}
                        className="form-control"
                        data-test-id="finance-search"
                    />
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
                rows={filtered}
                config={{...config, searchFields: []}}
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
