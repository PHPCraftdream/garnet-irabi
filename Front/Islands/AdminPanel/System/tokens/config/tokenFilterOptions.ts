import {I18nForeground as t} from '@/I18nGen/I18nForeground';
export const TOKEN_FILTER_OPTIONS = [
    {value: '', label: () => t.Admin_Tokens_FilterAll()},
    {value: 'active', label: () => t.Admin_Tokens_FilterActive()},
    {value: 'disabled', label: () => t.Admin_Tokens_FilterDisabled()},
    {value: 'expired', label: () => t.Admin_Tokens_FilterExpired()},
    {value: 'exhausted', label: () => t.Admin_Tokens_FilterExhausted()},
];
