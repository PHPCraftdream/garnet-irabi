// Generic grid types — re-exported from Common for convenience
export type {GridColumnConfig, GridConfig} from '@common/Components/Admin/AdminGrid/types';
export type {PageResponse} from '@common/hooks/data/usePagination';

// ── IRabi domain types ────────────────────────────────────────────────────────

export type UserTab = 'all' | 'experts' | 'users' | 'moderators' | 'owners' | 'admins';

export interface AdminUser {
    id: number;
    login: string;
    name: string;
    type: string;
    last_online_time: number | null;
    IS_ADMIN: string | number | null;
    IS_OWNER: string | number | null;
    IS_MODERATOR: string | number | null;
    IS_APPROVED: string | number | null;
    IS_DISABLED: string | number | null;
}

export interface LedgerRefData {
    booking_id: number;
    booking_status: string;
    slot_start_at: number | null;
    slot_duration_min: number | null;
    slot_cost: number | null;
    slot_is_online: number | null;
    slot_location: string | null;
}

export interface LedgerParty {
    type: 'account' | 'slot' | 'external' | 'system';
    account_id: number | null;
    label: string | null;
    sub: string | null;
}

export interface LedgerEntry {
    id: number;
    account_id: number;
    login: string;
    name: string;
    is_credit: number;
    amount: number;
    entry_type: string;
    ref_type: string | null;
    ref_id: number | null;
    note: string | null;
    created_at: number;
    ref_data: LedgerRefData | null;
    from: LedgerParty;
    to: LedgerParty;
}

export interface AccountBalanceRow {
    id: number;
    account_id: number;
    login: string;
    name: string;
    type: string;
    balance: number;
    updated_at: number;
}
