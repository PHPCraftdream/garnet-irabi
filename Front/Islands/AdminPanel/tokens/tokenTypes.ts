import {I18nForeground as t} from '../../../I18nGen/I18nForeground';

export interface TokenRow {
    id: number;
    token: string;
    label: string;
    url: string;
    expires_at: number | null;
    max_uses: number;
    uses_left: number;
    used: number;
    is_disabled: boolean;
    status: string;
    created_at: number;
    created_by: number;
    created_by_name: string | null;
    account_type: string;
}

export interface Registration {
    id: number;
    account_id: number;
    account_name: string;
    account_login: string;
    registered_at: number;
    ip: string;
    user_agent: string;
}

export const accountTypeLabel = (type: string): string =>
    type === 'expert' ? t.Admin_Tokens_AccountTypeExpert() : t.Admin_Tokens_AccountTypeUser();

export const TOKEN_STATUS_CLASS: Record<string, string> = {
    active: 'status-success',
    disabled: 'status-muted',
    expired: 'status-warning',
    exhausted: 'status-danger',
};

export const tokenStatusLabel = (s: string): string => {
    switch (s) {
        case 'active': return t.Admin_Tokens_Status_Active();
        case 'disabled': return t.Admin_Tokens_Status_Disabled();
        case 'expired': return t.Admin_Tokens_Status_Expired();
        case 'exhausted': return t.Admin_Tokens_Status_Exhausted();
        default: return s;
    }
};

/** Сроки жизни приглашения. */
export const TTL_OPTIONS = [
    {value: 0, label: () => t.Admin_Tokens_TTL_None()},
    {value: 3600, label: () => t.Admin_Tokens_TTL_1h()},
    {value: 86400, label: () => t.Admin_Tokens_TTL_1d()},
    {value: 604800, label: () => t.Admin_Tokens_TTL_1w()},
    {value: 2592000, label: () => t.Admin_Tokens_TTL_30d()},
];

export const TOKEN_FILTER_OPTIONS = [
    {value: '', label: () => t.Admin_Tokens_FilterAll()},
    {value: 'active', label: () => t.Admin_Tokens_FilterActive()},
    {value: 'disabled', label: () => t.Admin_Tokens_FilterDisabled()},
    {value: 'expired', label: () => t.Admin_Tokens_FilterExpired()},
    {value: 'exhausted', label: () => t.Admin_Tokens_FilterExhausted()},
];
