import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {AdminUserDualLink} from '@/Common/people/links/AdminUserDualLink';

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

    /** Формирует представление данных для соответствующего раздела панели. */
function renderPending(user: Props['names'][number]) {
    return (
        <li key={user.id} className="admin-home-pending" data-test-id={`admin-dash-pending-${user.id}`}>
            <AdminUserDualLink id={user.id} name={user.name || user.login} />
        </li>
    );
}

export class AdminApprovalsWidget extends AntiHookComponent<Props> {
    /** Формирует представление данных для соответствующего раздела панели. */
    render() {
        const {count, names, usersUrl} = this.props;
        return (
            <div className="admin-dash-card" data-test-id="admin-dash-approvals">
                <div className="admin-home-card-header">
                    <h2 className="admin-home-card-title">{t.Admin_PendingApprovals()}</h2>
                    <span className="admin-home-count" data-tone="warning"
        data-test-id="admin-dash-approvals-count">{count}</span>
                </div>

                {names.length > 0 ? (
                    <ul className="admin-home-list-tight">
                        {names.map(renderPending)}
                    </ul>
                ) : (
                    <p className="admin-home-empty">{t.Admin_NoActivity()}</p>
                )}

                <a href={usersUrl} className="admin-home-link-footer" data-test-id="admin-dash-approvals-link">
                    {t.Admin_Users()}
                </a>
            </div>
        );
    }
}
