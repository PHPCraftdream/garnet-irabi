import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
/** Отображает данные раздела и передаёт действия пользователя обработчикам. */
export const tokenStatusLabel = (s: string): string => {
    switch (s) {
        case 'active': return t.Admin_Tokens_Status_Active();
        case 'disabled': return t.Admin_Tokens_Status_Disabled();
        case 'expired': return t.Admin_Tokens_Status_Expired();
        case 'exhausted': return t.Admin_Tokens_Status_Exhausted();
        default: return s;
    }
};
