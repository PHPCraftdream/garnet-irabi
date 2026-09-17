import * as React from 'react';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {flag} from '../UsersSection';
import {AccountData} from './userDetailTypes';

interface BadgesProps {
    account: AccountData;
    displayName: string;
    isExpert: boolean;
}

/** Имя, логин, тип аккаунта и роли одной строкой. */
export const UserHeaderBadges: React.FC<BadgesProps> = ({account, displayName, isExpert}) => (
    <div className="admin-header-badges">
        <span className="text-lg font-semibold">{displayName}</span>
        {account.login !== displayName && <span className="text-muted text-sm">{account.login}</span>}
        <span className={`badge ${isExpert ? 'status-info' : 'status-muted'}`}>
            {isExpert ? t.Reg_AccountTypeExpert() : t.Reg_AccountTypeUser()}
        </span>
        {flag(account.IS_ADMIN) && <span className="badge bg-danger">{t.Admin_Role_Admin()}</span>}
        {flag(account.IS_OWNER) && <span className="badge status-warning">{t.Admin_Role_Owner()}</span>}
        {flag(account.IS_MODERATOR) && <span className="badge bg-primary">{t.Admin_Role_Moderator()}</span>}
        {flag(account.IS_APPROVED) && <span className="badge bg-success">{t.User_Status_Approved()}</span>}
        {flag(account.IS_DISABLED) && <span className="badge bg-secondary">{t.User_Status_Disabled()}</span>}
    </div>
);

/** Регистрация, последний визит, номер. */
export const UserHeaderMeta: React.FC<{account: AccountData}> = ({account}) => (
    <div className="admin-user-meta">
        {account.reg_time && <span>{t.User_RegTime()}: {formatTs(account.reg_time)}</span>}
        {account.last_online_time && <span>{t.User_LastOnline()}: {formatTs(account.last_online_time)}</span>}
        <span>ID: {account.id}</span>
    </div>
);

interface CountersProps {
    expertCancelCount: number;
    userCancelCount: number;
    expertDeclineCount: number;
    userDeclineCount: number;
}

/**
 * Счётчики отказов и отмен.
 *
 * Отказ и отмена разведены намеренно: отказ по неподтверждённой заявке стоит
 * человеку куда меньше, чем отмена уже подтверждённого занятия. Показывается
 * только то, что не ноль, — пустые счётчики ничего не сообщают.
 */
export const UserHeaderCounters: React.FC<CountersProps> = ({
    expertCancelCount,
    userCancelCount,
    expertDeclineCount,
    userDeclineCount,
}) => {
    if (!expertCancelCount && !userCancelCount && !expertDeclineCount && !userDeclineCount) return null;

    return (
        <div className="admin-user-meta">
            {expertDeclineCount > 0 && <span className="text-warning">{t.User_ExpertDeclines()}: {expertDeclineCount}</span>}
            {expertCancelCount > 0 && <span className="text-danger">{t.User_ExpertCancellations()}: {expertCancelCount}</span>}
            {userDeclineCount > 0 && <span className="text-warning">{t.User_UserDeclines()}: {userDeclineCount}</span>}
            {userCancelCount > 0 && <span className="text-danger">{t.User_UserCancellations()}: {userCancelCount}</span>}
        </div>
    );
};
