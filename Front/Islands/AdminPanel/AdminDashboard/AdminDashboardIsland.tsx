import * as React from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {AdminSupportWidget} from './AdminSupportWidget';
import {AdminApprovalsWidget} from './AdminApprovalsWidget';
import {AdminPlatformStats} from './AdminPlatformStats';
import {AdminRecentActivity} from './AdminRecentActivity';
import {PageHeader} from '@common/Components/PageHeader';
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

export const AdminDashboardIsland: React.FC<Props> = (props) => {
    const {openTickets, pendingApprovals, platformStats, recentActivity, supportUrl, usersUrl, logsUrl, bookingsUrl, financeUrl} = props;

    return (
        <div className="space-y-6" data-test-id="admin-dashboard">
            <PageHeader title={t.Admin_Dashboard()} icon={<LayoutDashboard size={22} aria-hidden="true" />} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
};
