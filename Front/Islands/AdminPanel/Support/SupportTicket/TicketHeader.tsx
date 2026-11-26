import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {SupportTicket, SupportStatus, UserRole} from '@/Islands/Comms/Support/parts/supportTypes';
import {StatusBadge} from '@/Islands/Comms/Support/parts/supportRenders';
import {ALL_STATUSES} from '@/Islands/Comms/Support/parts/render/ALL_STATUSES';
import {statusLabel} from '@/Islands/AdminPanel/Grid/statusLabel';
import {AdminUserLink} from '@/Common/people/links/EntityLinks';
import {UserAvatar} from '@/Common/media/UserAvatar';
import {formatTs} from '@common/Utils/Time/DateUtils/format/formatTs';

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

    /** Формирует представление данных для соответствующего раздела панели. */
function statusOption(status: SupportStatus) {
    return <option key={status} value={status}>{statusLabel(status)}</option>;
}

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
function moderatorOption(moderator: Moderator) {
    return <option key={moderator.id} value={moderator.id}>{moderator.name || moderator.login}</option>;
}

export default class TicketHeader extends AntiHookComponent<Props> {
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly changeStatus = (event: React.ChangeEvent<HTMLSelectElement>) =>
        this.props.onStatusChange(event.target.value as SupportStatus);
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly changeAssignee = (event: React.ChangeEvent<HTMLSelectElement>) =>
        this.props.onAssign(event.target.value ? Number(event.target.value) : null);

    /** Формирует представление данных для соответствующего раздела панели. */
    private renderPerson() {
        const {ticket} = this.props;
        const userName = ticket.user_name || ticket.account_name || '';
        const userLogin = ticket.user_login || ticket.account_login || '';
        const displayName = userName || userLogin || `#${ticket.account_id}`;
        return (
            <div
                data-test-id="support-user-info"
                className="admin-ticket-person"
            >
                <div className="admin-ticket-person-label">{t.Support_User()}</div>
                <div className="admin-ticket-person-details">
                    <UserAvatar name={displayName} avatar={ticket.user_avatar} testId="support-user-avatar" />
                    <span data-test-id="support-user-name">
                        <AdminUserLink id={ticket.account_id} name={displayName} />
                    </span>
                    {userLogin && userName && (
                        <span className="support-ticket-time" data-test-id="support-user-login">({userLogin})</span>
                    )}
                    {ticket.user_role && (
                        <span
                            data-test-id="support-user-role"
                            className="admin-ticket-role"
                        >
                            {roleLabel(ticket.user_role)}
                        </span>
                    )}
                </div>
            </div>
        );
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    private renderControls() {
        const {ticket, moderators} = this.props;
        return (
            <div className="admin-ticket-controls">
                <div>
                    <label className="admin-ticket-control-label">{t.Support_ChangeStatus()}</label>
                    <select
                        className="support-form-control"
                        value={ticket.status}
                        onChange={this.changeStatus}
                        data-test-id="support-status-select"
                    >
                        {ALL_STATUSES.map(statusOption)}
                    </select>
                </div>
                <div>
                    <label className="admin-ticket-control-label">{t.Support_Assign()}</label>
                    <select
                        className="support-form-control"
                        value={ticket.assignee_id ?? ''}
                        onChange={this.changeAssignee}
                        data-test-id="support-assignee-select"
                    >
                        <option value="">{t.Support_Unassigned()}</option>
                        {moderators.map(moderatorOption)}
                    </select>
                </div>
            </div>
        );
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    render() {
        const {ticket} = this.props;
        return (
            <div className="admin-support-form">
                {/* Title + status */}
                <div className="admin-ticket-heading">
                    <h2 className="admin-ticket-title">{ticket.subject}</h2>
                    <StatusBadge status={ticket.status} />
                </div>

                {/* Timestamps */}
                <div className="admin-ticket-meta">
                    <span>{t.Support_Assignee()}: {ticket.assignee_name || ticket.assignee_login ||
        t.Support_Unassigned()}</span>
                    <span>{t.Support_Created()}: {formatTs(ticket.created_at)}</span>
                    <span>{t.Support_Updated()}: {formatTs(ticket.updated_at)}</span>
                </div>
                {this.renderPerson()}
                {this.renderControls()}
            </div>
        );
    }
}
