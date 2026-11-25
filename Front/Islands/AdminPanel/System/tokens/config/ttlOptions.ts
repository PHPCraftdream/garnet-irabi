import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
export const TTL_OPTIONS = [
    {value: 0, label: () => t.Admin_Tokens_TTL_None()},
    {value: 3600, label: () => t.Admin_Tokens_TTL_1h()},
    {value: 86400, label: () => t.Admin_Tokens_TTL_1d()},
    {value: 604800, label: () => t.Admin_Tokens_TTL_1w()},
    {value: 2592000, label: () => t.Admin_Tokens_TTL_30d()},
];
