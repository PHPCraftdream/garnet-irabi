import * as React from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {SupportTicket, SupportStatus, UserRole} from '../../Support/supportTypes';
import {StatusBadge, ALL_STATUSES, statusLabel} from '../../Support/supportRenders';
import {AdminUserLink} from '../../../Common/EntityLinks';
import {UserAvatar} from '../../../Common/UserAvatar';
import {formatTs} from '@common/Utils/DateUtils';

interface Moderator {
    id: number;
    login: string;
    name: string;
}

interface Props {
    ticket: SupportTicket;
    moderators: Moderator[];
    onStatusChange: (status: SupportStatus) => void;
    onAssign: (assigneeId: number | null) => void;
}

const roleLabel = (role?: UserRole): string => {
    const map: Record<UserRole, string> = {
        user: t.Reg_AccountTypeUser(),
        expert: t.Reg_AccountTypeExpert(),
        moderator: t.Admin_Role_Moderator(),
        owner: t.Admin_Role_Owner(),
        admin: t.Admin_Role_Admin(),
    };
    return role ? (map[role] || role) : '';
};

export default function TicketHeader({ticket, moderators, onStatusChange, onAssign}: Props) {
    const userName = ticket.user_name || ticket.account_name || '';
    const userLogin = ticket.user_login || ticket.account_login || '';
    const displayName = userName || userLogin || `#${ticket.account_id}`;

    return (
        <div className="mb-4">
            {/* Title + status */}
            <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-lg font-semibold text-on-surface flex-1">{ticket.subject}</h2>
                <StatusBadge status={ticket.status} />
            </div>

            {/* Timestamps */}
            <div className="text-xs text-muted mt-1 flex gap-4 flex-wrap">
                <span>{t.Support_Assignee()}: {ticket.assignee_name || ticket.assignee_login || t.Support_Unassigned()}</span>
                <span>{t.Support_Created()}: {formatTs(ticket.created_at)}</span>
                <span>{t.Support_Updated()}: {formatTs(ticket.updated_at)}</span>
            </div>

            {/* User info block */}
            <div
                data-test-id="support-user-info"
                className="mt-3 bg-surface-alt border border-default rounded-lg p-3"
            >
                <div className="text-xs text-muted font-medium uppercase mb-1">{t.Support_User()}</div>
                <div className="flex items-center gap-2 flex-wrap text-sm">
                    <UserAvatar name={displayName} avatar={ticket.user_avatar} testId="support-user-avatar" />
                    <span data-test-id="support-user-name">
                        <AdminUserLink id={ticket.account_id} name={displayName} />
                    </span>
                    {userLogin && userName && (
                        <span className="text-muted text-xs" data-test-id="support-user-login">({userLogin})</span>
                    )}
                    {ticket.user_role && (
                        <span
                            data-test-id="support-user-role"
                            className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-theme-border text-secondary"
                        >
                            {roleLabel(ticket.user_role)}
                        </span>
                    )}
                </div>
            </div>

            {/* Controls: status + assignee */}
            <div className="flex gap-4 mt-4 flex-wrap">
                <div>
                    <label className="text-xs text-muted block mb-1">{t.Support_ChangeStatus()}</label>
                    <select
                        className="form-control text-sm"
                        value={ticket.status}
                        onChange={e => onStatusChange(e.target.value as SupportStatus)}
                        data-test-id="support-status-select"
                    >
                        {ALL_STATUSES.map(s => (
                            <option key={s} value={s}>{statusLabel(s)}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs text-muted block mb-1">{t.Support_Assign()}</label>
                    <select
                        className="form-control text-sm"
                        value={ticket.assignee_id ?? ''}
                        onChange={e => onAssign(e.target.value ? Number(e.target.value) : null)}
                        data-test-id="support-assignee-select"
                    >
                        <option value="">{t.Support_Unassigned()}</option>
                        {moderators.map(m => (
                            <option key={m.id} value={m.id}>{m.name || m.login}</option>
                        ))}
                    </select>
                </div>
            </div>
        </div>
    );
}
