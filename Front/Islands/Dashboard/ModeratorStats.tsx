import * as React from 'react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';

interface ModeratorStatsProps {
    openTickets: number;
    pendingApprovals: number;
    totalUsers: number;
    bookingsThisMonth: number;
}

export const ModeratorStats: React.FC<ModeratorStatsProps> = ({openTickets, pendingApprovals, totalUsers, bookingsThisMonth}) => (
    <div className="rounded-lg border border-default bg-surface" data-test-id="moderator-stats">
        <div className="flex items-center px-4 py-3 border-b border-default">
            <h2 className="text-base font-semibold text-on-surface">{t.Dash_Stats()}</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4">
            <div className="stat-tile">
                <div className="user-dash-stat-value-danger">{openTickets}</div>
                <div className="stat-tile-label">{t.Dash_OpenTickets()}</div>
            </div>
            <div className="stat-tile">
                <div className="user-dash-stat-value-warning">{pendingApprovals}</div>
                <div className="stat-tile-label">{t.Dash_PendingApprovals()}</div>
            </div>
            <div className="stat-tile">
                <div className="user-dash-stat-value-accent">{totalUsers}</div>
                <div className="stat-tile-label">{t.Dash_TotalUsers()}</div>
            </div>
            <div className="stat-tile">
                <div className="user-dash-stat-value-success">{bookingsThisMonth}</div>
                <div className="stat-tile-label">{t.Dash_BookingsThisMonth()}</div>
            </div>
        </div>
    </div>
);
