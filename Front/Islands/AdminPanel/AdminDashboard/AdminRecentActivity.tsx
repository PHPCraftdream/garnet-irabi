import * as React from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/DateUtils';
import {actionLabel} from '@common/Components/AdminLog/actionLabel';
import {AdminUserDualLink} from '../../../Common/EntityLinks';

interface LogEntry {
    id: number;
    actor_id: number;
    actor_login: string;
    actor_name?: string;
    action: string;
    target_id: number;
    target_login: string;
    target_name?: string;
    old_value: string;
    new_value: string;
    created_at: number;
}

interface Props {
    logs: LogEntry[];
    logsUrl: string;
}

export const AdminRecentActivity: React.FC<Props> = ({logs, logsUrl}) => (
    <div className="admin-dash-card" data-test-id="admin-dash-activity">
        <h2 className="admin-dash-card-title-mb">{t.Admin_RecentActivity()}</h2>

        {logs.length > 0 ? (
            <ul className="admin-dash-list">
                {logs.map(log => (
                    <li key={log.id} className="admin-dash-activity-item" data-test-id={`admin-dash-log-${log.id}`}>
                        <div className="admin-dash-activity-head">
                            <span className="admin-dash-activity-action" title={log.action}>{actionLabel(log.action)}</span>
                            <span className="admin-dash-activity-time">{formatTs(log.created_at)}</span>
                        </div>
                        <div className="admin-dash-activity-users">
                            {log.actor_id > 0 ? (
                                <AdminUserDualLink id={log.actor_id} name={log.actor_name || log.actor_login} />
                            ) : (
                                <span className="admin-dash-activity-actor">{log.actor_name || log.actor_login}</span>
                            )}
                            <span className="admin-dash-activity-arrow">&rarr;</span>
                            {log.target_id > 0 ? (
                                <AdminUserDualLink id={log.target_id} name={log.target_name || log.target_login} />
                            ) : (
                                <span className="admin-dash-activity-actor">{log.target_name || log.target_login}</span>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        ) : (
            <p className="admin-dash-empty">{t.Admin_NoActivity()}</p>
        )}

        <a href={logsUrl} className="admin-dash-link-footer" data-test-id="admin-dash-activity-link">
            {t.Admin_Logs()}
        </a>
    </div>
);
