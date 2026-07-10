import * as React from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';

interface Props {
    totalUsers: number;
    totalExperts: number;
    bookingsThisMonth: number;
    revenueThisMonth: number;
    usersUrl: string;
    bookingsUrl: string;
    financeUrl: string;
}

export const AdminPlatformStats: React.FC<Props> = ({totalUsers, totalExperts, bookingsThisMonth, revenueThisMonth, usersUrl, bookingsUrl, financeUrl}) => (
    <div className="admin-dash-card" data-test-id="admin-dash-stats">
        <h2 className="admin-dash-card-title-mb">{t.Admin_PlatformStats()}</h2>
        <div className="admin-dash-stats-grid">
            <a href={usersUrl} className="admin-dash-stat-tile" data-test-id="admin-dash-stat-users">
                <div className="admin-dash-stat-value text-accent">{totalUsers}</div>
                <div className="admin-dash-stat-label">{t.Dash_TotalUsers()}</div>
            </a>
            <a href={`${usersUrl}#filter=experts`} className="admin-dash-stat-tile" data-test-id="admin-dash-stat-experts">
                <div className="admin-dash-stat-value text-accent">{totalExperts}</div>
                <div className="admin-dash-stat-label">{t.Admin_TotalExperts()}</div>
            </a>
            <a href={bookingsUrl} className="admin-dash-stat-tile" data-test-id="admin-dash-stat-bookings">
                <div className="admin-dash-stat-value text-success">{bookingsThisMonth}</div>
                <div className="admin-dash-stat-label">{t.Dash_BookingsThisMonth()}</div>
            </a>
            <a href={financeUrl} className="admin-dash-stat-tile" data-test-id="admin-dash-stat-revenue">
                <div className="admin-dash-stat-value text-success">{revenueThisMonth.toLocaleString()} &#8381;</div>
                <div className="admin-dash-stat-label">{t.Admin_MonthlyRevenue()}</div>
            </a>
        </div>
    </div>
);
