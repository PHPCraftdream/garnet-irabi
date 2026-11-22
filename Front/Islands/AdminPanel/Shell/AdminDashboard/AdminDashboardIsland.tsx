import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {AdminSupportWidget} from './AdminSupportWidget';
import {AdminApprovalsWidget} from './AdminApprovalsWidget';
import {AdminPlatformStats} from './AdminPlatformStats';
import {AdminRecentActivity} from './AdminRecentActivity';
import {PageHeader} from '@common/Components/Layout/PageHeader';
import {LayoutDashboard} from 'lucide-react';

interface TicketItem {
    id: number;
    subject: string;
    status: string;
    user_id: number;
    user_login: string;
    user_name: string;
    updated_at: number;
}

interface PendingUser {
    id: number;
    login: string;
    name: string;
}

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
    openTickets: { count: number; tickets: TicketItem[] };
    pendingApprovals: { count: number; names: PendingUser[] };
    platformStats: {
        totalUsers: number;
        totalExperts: number;
        bookingsThisMonth: number;
        revenueThisMonth: number;
    };
    recentActivity: LogEntry[];
    supportUrl: string;
    usersUrl: string;
    logsUrl: string;
    bookingsUrl: string;
    financeUrl: string;
}

const DASHBOARD_ICON = <LayoutDashboard size={22} aria-hidden="true" />;

export class AdminDashboardIsland extends AntiHookComponent<Props> {
    private renderInbox() {
        const {openTickets, pendingApprovals, supportUrl, usersUrl} = this.props;
        return (
            <div className="admin-dashboard-grid">
                <AdminSupportWidget
                    count={openTickets.count}
                    tickets={openTickets.tickets}
                    supportUrl={supportUrl}
                />
                <AdminApprovalsWidget
                    count={pendingApprovals.count}
                    names={pendingApprovals.names}
                    usersUrl={usersUrl}
                />
            </div>
        );
    }

    render() {
        const {platformStats, recentActivity, usersUrl, logsUrl, bookingsUrl, financeUrl} = this.props;

        return (
            <div className="admin-dashboard" data-test-id="admin-dashboard">
                <PageHeader title={t.Admin_Dashboard()} icon={DASHBOARD_ICON} />

                {this.renderInbox()}

                <div className="admin-dashboard-grid">
                    <AdminPlatformStats
                        totalUsers={platformStats.totalUsers}
                        totalExperts={platformStats.totalExperts}
                        bookingsThisMonth={platformStats.bookingsThisMonth}
                        revenueThisMonth={platformStats.revenueThisMonth}
                        usersUrl={usersUrl}
                        bookingsUrl={bookingsUrl}
                        financeUrl={financeUrl}
                    />
                    <AdminRecentActivity
                        logs={recentActivity}
                        logsUrl={logsUrl}
                    />
                </div>
            </div>
        );
    }
}
