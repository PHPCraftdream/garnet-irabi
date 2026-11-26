import * as React from 'react';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {flag} from '@/Islands/AdminPanel/Users/flags/flag';
import {AccountData} from '@/Islands/AdminPanel/Users/userDetail/status/userDetailTypes';

const admin_Role_Admin = t.Admin_Role_Admin;
const admin_Role_Moderator = t.Admin_Role_Moderator;
const admin_Role_Owner = t.Admin_Role_Owner;
const reg_AccountTypeExpert = t.Reg_AccountTypeExpert;
const reg_AccountTypeUser = t.Reg_AccountTypeUser;
const user_Status_Approved = t.User_Status_Approved;
const user_Status_Disabled = t.User_Status_Disabled;

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
            {isExpert ? reg_AccountTypeExpert() : reg_AccountTypeUser()}
        </span>
        {flag(account.IS_ADMIN) && <span className="admin-user-role-badge"
        data-tone="danger">{admin_Role_Admin()}</span>}
        {flag(account.IS_OWNER) && <span className="admin-user-role-badge"
        data-tone="warning">{admin_Role_Owner()}</span>}
        {flag(account.IS_MODERATOR) && <span className="admin-user-role-badge"
        data-tone="info">{admin_Role_Moderator()}</span>}
        {flag(account.IS_APPROVED) && <span className="admin-user-role-badge"
        data-tone="success">{user_Status_Approved()}</span>}
        {flag(account.IS_DISABLED) && <span className="admin-user-role-badge"
        data-tone="secondary">{user_Status_Disabled()}</span>}
    </div>
);
