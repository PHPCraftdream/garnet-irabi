import {I18nForeground as t} from '@/I18nGen/I18nForeground';

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

/** Отображает данные раздела и передаёт действия пользователя обработчикам. */
export const accountTypeLabel = (type: string): string =>
    type === 'expert' ? t.Admin_Tokens_AccountTypeExpert() : t.Admin_Tokens_AccountTypeUser();

/** Сроки жизни приглашения. */
