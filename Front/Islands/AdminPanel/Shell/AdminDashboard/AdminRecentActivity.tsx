import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {actionLabel} from '@common/Components/Admin/AdminLog/Sections/actionLabel';
import {AdminUserDualLink} from '../../../../Common/people/AdminUserDualLink';
import {appUrl} from '@common/Utils/Url/appUrl';

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

// D-263: for actions whose target isn't an account (currently only
// comment moderation), the log stamps target_id=0 and encodes the real
// entity as "comment#<id>" in target_login/target_name — this used to
// fall straight through to the plain-text span below, indistinguishable
// from a user target and impossible to follow. `?tab=comments` is the
// SAME query param the Comments tab's own click handler already writes
// (AdminPanelIsland's writeTabToUrl) — not a new deep-link mechanism.
const COMMENT_TARGET_RE = /^comment#(\d+)$/;

class ActivityPerson extends AntiHookComponent<{id: number; name: string}> {
    render() {
        const {id, name} = this.props;
        if (id > 0) return <AdminUserDualLink id={id} name={name} />;

        const commentMatch = COMMENT_TARGET_RE.exec(name);
        if (commentMatch) {
            return (
                <a href={appUrl('/admin/?tab=comments')} className="admin-home-activity-actor">
                    {name}
                </a>
            );
        }

        return <span className="admin-home-activity-actor">{name}</span>;
    }
}

class ActivityItem extends AntiHookComponent<{log: LogEntry}> {
    render() {
        const {log} = this.props;
        return (
            <li className="admin-home-activity-item" data-test-id={`admin-dash-log-${log.id}`}>
                <div className="admin-home-activity-head">
                    <span className="admin-home-activity-action" title={log.action}>{actionLabel(log.action)}</span>
                    <span className="admin-home-activity-time">{formatTs(log.created_at)}</span>
                </div>
                <div className="admin-home-activity-users">
                    <ActivityPerson id={log.actor_id} name={log.actor_name || log.actor_login} />
                    <span className="admin-home-activity-arrow">&rarr;</span>
                    <ActivityPerson id={log.target_id} name={log.target_name || log.target_login} />
                </div>
            </li>
        );
    }
}

function renderActivity(log: LogEntry) {
    return <ActivityItem key={log.id} log={log} />;
}

export class AdminRecentActivity extends AntiHookComponent<Props> {
    render() {
        const {logs, logsUrl} = this.props;
        return (
            <div className="admin-dash-card" data-test-id="admin-dash-activity">
                <h2 className="admin-home-card-title-mb">{t.Admin_RecentActivity()}</h2>

                {logs.length > 0 ? (
                    <ul className="admin-home-list">
                        {logs.map(renderActivity)}
                    </ul>
                ) : (
                    <p className="admin-home-empty">{t.Admin_NoActivity()}</p>
                )}

                <a href={logsUrl} className="admin-home-link-footer" data-test-id="admin-dash-activity-link">
                    {t.Admin_Logs()}
                </a>
            </div>
        );
    }
}
