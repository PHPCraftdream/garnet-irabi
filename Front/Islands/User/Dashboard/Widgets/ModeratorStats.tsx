import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';

interface ModeratorStatsProps {
    openTickets: number;
    pendingApprovals: number;
    totalUsers: number;
    bookingsThisMonth: number;
}

export const ModeratorStats: React.FC<ModeratorStatsProps> = ({openTickets, pendingApprovals, totalUsers, bookingsThisMonth}) => (
    <div className="user-dash-stats-card" data-test-id="moderator-stats">
        <div className="user-dash-stats-heading">
            <h2 className="user-dash-stats-title">{t.Dash_Stats()}</h2>
        </div>
        <div className="user-dash-moderator-grid">
            <div className="stat-tile" data-user-dash-tile>
                <div className="user-dash-stat-value" data-tone="danger">{openTickets}</div>
                <div className="user-dash-stat-label">{t.Dash_OpenTickets()}</div>
            </div>
            <div className="stat-tile" data-user-dash-tile>
                <div className="user-dash-stat-value" data-tone="warning" data-test-id="moderator-pending-approvals">{pendingApprovals}</div>
                <div className="user-dash-stat-label">{t.Dash_PendingApprovals()}</div>
            </div>
            <div className="stat-tile" data-user-dash-tile>
                <div className="user-dash-stat-value">{totalUsers}</div>
                <div className="user-dash-stat-label">{t.Dash_TotalUsers()}</div>
            </div>
            <div className="stat-tile" data-user-dash-tile>
                <div className="user-dash-stat-value" data-tone="success">{bookingsThisMonth}</div>
                <div className="user-dash-stat-label">{t.Dash_BookingsThisMonth()}</div>
            </div>
        </div>
    </div>
);
