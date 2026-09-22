import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {flag} from '../../usersFlags';
import {AccountData} from '../userDetailTypes';

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
