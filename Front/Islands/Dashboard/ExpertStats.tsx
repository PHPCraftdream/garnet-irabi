import * as React from 'react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';

interface ExpertStatsProps {
    pendingBookings: number;
    usersThisMonth: number;
    earningsThisMonth: number;
    declines: number;
    cancellations: number;
}

export const ExpertStats: React.FC<ExpertStatsProps> = ({pendingBookings, usersThisMonth, earningsThisMonth, declines, cancellations}) => (
    <div className="rounded-lg border border-default bg-surface" data-test-id="expert-stats">
        <div className="flex items-center px-4 py-3 border-b border-default">
            <h2 className="text-base font-semibold text-on-surface">{t.Dash_Stats()}</h2>
        </div>
        <div className="grid grid-cols-3 gap-3 p-4">
            <div className="stat-tile">
                <div className="expert-stat-value-accent">{pendingBookings}</div>
                <div className="stat-tile-label">{t.Dash_PendingBookings()}</div>
            </div>
            <div className="stat-tile">
                <div className="expert-stat-value-success">{usersThisMonth}</div>
                <div className="stat-tile-label">{t.Dash_UsersThisMonth()}</div>
            </div>
            <div className="stat-tile">
                <div className="expert-stat-value-warning">{earningsThisMonth} &#8381;</div>
                <div className="stat-tile-label">{t.Dash_EarningsThisMonth()}</div>
            </div>
            <div className="stat-tile">
                <div className="expert-stat-value-warning" data-test-id="expert-stat-declines">{declines}</div>
                <div className="stat-tile-label">{t.Teaching_Declines()}</div>
            </div>
            <div className="stat-tile">
                <div className="expert-stat-value-warning" data-test-id="expert-stat-cancellations">{cancellations}</div>
                <div className="stat-tile-label">{t.Teaching_Cancellations()}</div>
            </div>
        </div>
    </div>
);
