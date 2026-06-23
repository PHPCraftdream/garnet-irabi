// Generic grid types — re-exported from Common for convenience
export type {GridColumnConfig, GridConfig, SubGridConfig, DetailViewConfig, DetailSection} from '@common/Components/AdminGrid/types';

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

export interface AdminExpert {
    id: number;
    login: string;
    name: string;
    last_online_time: number | null;
    IS_ADMIN: string | number | null;
    IS_OWNER: string | number | null;
    IS_MODERATOR: string | number | null;
    IS_APPROVED: string | number | null;
    IS_DISABLED: string | number | null;
}

export interface AdminMaterial {
    id: number;
    title: string;
    body_md: string;
    show_after_start: number;
    sort_order: number;
    created_at: number;
    updated_at: number;
}

export interface AdminBooking {
    id: number;
    user_id: number;
    user_name: string;
    expert_id: number;
    expert_name: string;
    bookable_type: string;
    bookable_id: number;
    status: string;
    created_at: number;
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

export interface ActionLog {
    id: number;
    actor_id: number;
    actor_login: string;
    actor_name: string;
    actor_type: string;
    target_id: number;
    target_login: string;
    target_name: string;
    target_type: string;
    action: string;
    old_value: string;
    new_value: string;
    created_at: number;
}

export interface MailLogEntry {
    id: number;
    account_id: number | null;
    account_name: string;
    account_login: string;
    recipient_email: string;
    mail_type: string;
    subject: string;
    /** Only present for admin role; stripped for moderators/owners */
    body_html?: string;
    /** Structured service data (auth codes etc.); only present for admin */
    meta?: string | null;
    status: string;
    error_log: string | null;
    created_at: number;
}

export interface AdminPanelProps {
    users?: AdminUser[];
    adminBookings?: AdminBooking[];
    ledger?: LedgerEntry[];
    balances?: AccountBalanceRow[];
    logs?: ActionLog[];
    setFlagUrl?: string;
}
