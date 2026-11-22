import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';

interface Props {
    totalUsers: number;
    totalExperts: number;
    bookingsThisMonth: number;
    revenueThisMonth: number;
    usersUrl: string;
    bookingsUrl: string;
    financeUrl: string;
}

export class AdminPlatformStats extends AntiHookComponent<Props> {
    render() {
        const {totalUsers, totalExperts, bookingsThisMonth, revenueThisMonth, usersUrl, bookingsUrl, financeUrl} = this.props;
        return (
            <div className="admin-dash-card" data-test-id="admin-dash-stats">
                <h2 className="admin-home-card-title-mb">{t.Admin_PlatformStats()}</h2>
                <div className="admin-home-stats-grid">
                    <a href={usersUrl} className="admin-home-stat-tile" data-test-id="admin-dash-stat-users">
                        <div className="admin-home-stat-value">{totalUsers}</div>
                        <div className="admin-home-stat-label">{t.Dash_TotalUsers()}</div>
                    </a>
                    <a href={`${usersUrl}#filter=experts`} className="admin-home-stat-tile" data-test-id="admin-dash-stat-experts">
                        <div className="admin-home-stat-value">{totalExperts}</div>
                        <div className="admin-home-stat-label">{t.Admin_TotalExperts()}</div>
                    </a>
                    <a href={bookingsUrl} className="admin-home-stat-tile" data-test-id="admin-dash-stat-bookings">
                        <div className="admin-home-stat-value" data-tone="success">{bookingsThisMonth}</div>
                        <div className="admin-home-stat-label">{t.Dash_BookingsThisMonth()}</div>
                    </a>
                    <a href={financeUrl} className="admin-home-stat-tile" data-test-id="admin-dash-stat-revenue">
                        <div className="admin-home-stat-value" data-tone="success">{revenueThisMonth.toLocaleString()} &#8381;</div>
                        <div className="admin-home-stat-label">{t.Admin_MonthlyRevenue()}</div>
                    </a>
                </div>
            </div>
        );
    }
}
