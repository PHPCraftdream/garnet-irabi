import * as React from 'react';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {ExternalLink} from '@common/Components/Layout/ExternalLink';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {entryTypeLabel} from './gridLabels';
import {statusLabel} from './statusLabel';

// UserCell removed — use AdminUserLink from EntityLinks instead

/**
 * Global render registry for common field keys.
 * AdminGrid uses these as fallback when no explicit render is provided.
 */
export const globalRenders: Record<string, (val: unknown) => React.ReactNode> = {
    created_at: val => <span className="token-cell-time">{formatTs(val as number)}</span>,
    updated_at: val => <span className="token-cell-time">{formatTs(val as number)}</span>,
    confirmed_at: val => val ? <span className="token-cell-time">{formatTs(val as number)}</span> : <span
        className="token-cell-muted">—</span>,
    cancelled_at: val => val ? <span className="token-cell-time">{formatTs(val as number)}</span> : <span
        className="token-cell-muted">—</span>,
    start_at: val => <span className="admin-grid-value-time">{formatTs(val as number)}</span>,

    amount: val => <>{String(val)} &#8381;</>,
    cost:   val => <>{String(val)} &#8381;</>,
    balance: val => (
        <span className="admin-money-balance" data-negative={Number(val) < 0}>
            {String(val)} &#8381;
        </span>
    ),
    duration_min: val => <>{val} {t.Slot_Duration_Min()}</>,

    is_credit: val => Number(val)
        ? <span className="admin-user-role-badge" data-tone="success">{t.Admin_Ledger_Credit()}</span>
        : <span className="admin-user-role-badge" data-tone="danger">{t.Admin_Ledger_Debit()}</span>,

    show_after_start: val => Number(val)
        ? <span className="admin-user-role-badge" data-tone="warning">{t.General_Yes()}</span>
        : <span className="admin-user-role-badge" data-tone="muted">{t.General_No()}</span>,

    status: val => {
        const map: Record<string, string> = {
            pending:   'warning',
            confirmed: 'success',
            cancelled: 'secondary',
            completed: 'info',
            free:      'muted',
            booked:    'info',
        };
        const s = String(val);
        return <span className="admin-user-role-badge" data-tone={map[s] ?? 'muted'}>{statusLabel(s)}</span>;
    },

    entry_type: val => <span className="admin-ledger-entry-type">{entryTypeLabel(String(val))}</span>,
    note:       val => <span className="token-cell-muted">{val == null ? '—' : String(val)}</span>,

    is_online: val => Number(val)
        ? <span className="admin-user-role-badge" data-tone="info">{t.Slot_Online()}</span>
        : <span className="admin-user-role-badge" data-tone="secondary">{t.Slot_Offline()}</span>,

    location: val => {
        if (!val) return <span className="token-cell-muted">—</span>;
        const s = String(val);
        if (s.startsWith('http://') || s.startsWith('https://')) {
            return <ExternalLink href={s} className="admin-grid-external-location">{s}</ExternalLink>;
        }
        return <span className="admin-client-context-line">{s}</span>;
    },
};
