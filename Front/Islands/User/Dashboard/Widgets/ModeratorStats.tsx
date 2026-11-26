import * as React from 'react';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';

const dashBookingsThisMonth = t.Dash_BookingsThisMonth;
const dashOpenTickets = t.Dash_OpenTickets;
const dashPendingApprovals = t.Dash_PendingApprovals;
const dashStats = t.Dash_Stats;
const dashTotalUsers = t.Dash_TotalUsers;

interface ModeratorStatsProps {
    openTickets: number;
    pendingApprovals: number;
    totalUsers: number;
    bookingsThisMonth: number;
}

/** Показывает модератору очередь и общие показатели платформы. */
export const ModeratorStats: React.FC<ModeratorStatsProps> = ({
    openTickets,
    pendingApprovals,
    totalUsers,
    bookingsThisMonth,
}) => (
    <div className="user-dash-stats-card" data-test-id="moderator-stats">
        <div className="user-dash-stats-heading">
            <h2 className="user-dash-stats-title">{dashStats()}</h2>
        </div>
        <div className="user-dash-moderator-grid">
            <div className="stat-tile" data-user-dash-tile>
                <div className="user-dash-stat-value" data-tone="danger">{openTickets}</div>
                <div className="user-dash-stat-label">{dashOpenTickets()}</div>
            </div>
            <div className="stat-tile" data-user-dash-tile>
                <div
                    className="user-dash-stat-value"
                    data-tone="warning"
                    data-test-id="moderator-pending-approvals"
                >
                    {pendingApprovals}
                </div>
                <div className="user-dash-stat-label">{dashPendingApprovals()}</div>
            </div>
            <div className="stat-tile" data-user-dash-tile>
                <div className="user-dash-stat-value">{totalUsers}</div>
                <div className="user-dash-stat-label">{dashTotalUsers()}</div>
            </div>
            <div className="stat-tile" data-user-dash-tile>
                <div className="user-dash-stat-value" data-tone="success">{bookingsThisMonth}</div>
                <div className="user-dash-stat-label">{dashBookingsThisMonth()}</div>
            </div>
        </div>
    </div>
);
