import * as React from 'react';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {ExternalLink} from '@common/Components/Layout/ExternalLink';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {statusLabel, entryTypeLabel} from './gridLabels';

// UserCell removed — use AdminUserLink from EntityLinks instead

/**
 * Global render registry for common field keys.
 * AdminGrid uses these as fallback when no explicit render is provided.
 */
export const globalRenders: Record<string, (val: unknown) => React.ReactNode> = {
    created_at: val => <span className="text-muted text-xs whitespace-nowrap">{formatTs(val as number)}</span>,
    updated_at: val => <span className="text-muted text-xs whitespace-nowrap">{formatTs(val as number)}</span>,
    confirmed_at: val => val ? <span className="text-muted text-xs whitespace-nowrap">{formatTs(val as number)}</span> : <span className="text-muted">—</span>,
    cancelled_at: val => val ? <span className="text-muted text-xs whitespace-nowrap">{formatTs(val as number)}</span> : <span className="text-muted">—</span>,
    start_at: val => <span className="text-xs whitespace-nowrap">{formatTs(val as number)}</span>,

    amount: val => <>{String(val)} &#8381;</>,
    cost:   val => <>{String(val)} &#8381;</>,
    balance: val => (
        <span className={`font-medium ${Number(val) < 0 ? 'text-danger' : 'text-success'}`}>
            {String(val)} &#8381;
        </span>
    ),
    duration_min: val => <>{val} {t.Slot_Duration_Min()}</>,

    is_credit: val => Number(val)
        ? <span className="badge bg-success">{t.Admin_Ledger_Credit()}</span>
        : <span className="badge bg-danger">{t.Admin_Ledger_Debit()}</span>,

    show_after_start: val => Number(val)
        ? <span className="badge status-warning">{t.General_Yes()}</span>
        : <span className="badge status-muted">{t.General_No()}</span>,

    status: val => {
        const map: Record<string, string> = {
            pending:   'status-warning',
            confirmed: 'bg-success',
            cancelled: 'bg-secondary',
            completed: 'status-info',
            free:      'status-muted',
            booked:    'bg-primary',
        };
        const s = String(val);
        return <span className={`badge ${map[s] ?? 'status-muted'}`}>{statusLabel(s)}</span>;
    },

    entry_type: val => <span className="font-mono text-sm">{entryTypeLabel(String(val))}</span>,
    note:       val => <span className="text-muted">{val == null ? '—' : String(val)}</span>,

    is_online: val => Number(val)
        ? <span className="badge bg-primary">{t.Slot_Online()}</span>
        : <span className="badge bg-secondary">{t.Slot_Offline()}</span>,

    location: val => {
        if (!val) return <span className="text-muted">—</span>;
        const s = String(val);
        if (s.startsWith('http://') || s.startsWith('https://')) {
            return <ExternalLink href={s} className="text-accent text-sm hover:underline break-all">{s}</ExternalLink>;
        }
        return <span className="text-sm">{s}</span>;
    },
};
