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
    <div className="admin-user-identity">
        <span className="admin-user-identity-name">{displayName}</span>
        {account.login !== displayName && <span className="admin-client-context-empty">{account.login}</span>}
        <span className="admin-user-role-badge" data-tone={isExpert ? 'info' : 'muted'}>
            {isExpert ? t.Reg_AccountTypeExpert() : t.Reg_AccountTypeUser()}
        </span>
        {flag(account.IS_ADMIN) && <span className="admin-user-role-badge" data-tone="danger">{t.Admin_Role_Admin()}</span>}
        {flag(account.IS_OWNER) && <span className="admin-user-role-badge" data-tone="warning">{t.Admin_Role_Owner()}</span>}
        {flag(account.IS_MODERATOR) && <span className="admin-user-role-badge" data-tone="info">{t.Admin_Role_Moderator()}</span>}
        {flag(account.IS_APPROVED) && <span className="admin-user-role-badge" data-tone="success">{t.User_Status_Approved()}</span>}
        {flag(account.IS_DISABLED) && <span className="admin-user-role-badge" data-tone="secondary">{t.User_Status_Disabled()}</span>}
    </div>
);
