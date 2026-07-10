import * as React from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {AdminUserDualLink} from '../../../Common/EntityLinks';

interface PendingUser {
    id: number;
    login: string;
    name: string;
}

interface Props {
    count: number;
    names: PendingUser[];
    usersUrl: string;
}

export const AdminApprovalsWidget: React.FC<Props> = ({count, names, usersUrl}) => (
    <div className="admin-dash-card" data-test-id="admin-dash-approvals">
        <div className="admin-dash-card-header">
            <h2 className="admin-dash-card-title">{t.Admin_PendingApprovals()}</h2>
            <span className="admin-dash-count text-warning" data-test-id="admin-dash-approvals-count">{count}</span>
        </div>

        {names.length > 0 ? (
            <ul className="admin-dash-list-tight">
                {names.map(user => (
                    <li key={user.id} className="text-sm text-secondary" data-test-id={`admin-dash-pending-${user.id}`}>
                        <AdminUserDualLink id={user.id} name={user.name || user.login} />
                    </li>
                ))}
            </ul>
        ) : (
            <p className="admin-dash-empty">{t.Admin_NoActivity()}</p>
        )}

        <a href={usersUrl} className="admin-dash-link-footer" data-test-id="admin-dash-approvals-link">
            {t.Admin_Users()}
        </a>
    </div>
);
