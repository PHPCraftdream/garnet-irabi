import * as React from 'react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';

interface ExpertStatsProps {
    slotsToday: number;
    slotsTomorrow: number;
    pendingBookings: number;
    monthlyUsers: number;
    monthlyEarnings: number;
    declines: number;
    cancellations: number;
}

export const ExpertStats: React.FC<ExpertStatsProps> = ({
    slotsToday, slotsTomorrow,
    pendingBookings, monthlyUsers, monthlyEarnings,
    declines, cancellations,
}) => (
    <div data-test-id="expert-stats">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="stat-tile">
                <div className="expert-stat-value-success">{slotsToday}</div>
                <div className="stat-tile-label">{t.Teaching_SlotsToday()}</div>
            </div>
            <div className="stat-tile">
                <div className="expert-stat-value-accent">{slotsTomorrow}</div>
                <div className="stat-tile-label">{t.Teaching_SlotsTomorrow()}</div>
            </div>
            <div className="stat-tile">
                <div className="expert-stat-value-warning">{pendingBookings}</div>
                <div className="stat-tile-label">{t.Teaching_PendingBookings()}</div>
            </div>
            <div className="stat-tile">
                <div className="expert-stat-value-accent">{monthlyUsers}</div>
                <div className="stat-tile-label">{t.Teaching_MonthlyUsers()}</div>
            </div>
            <div className="stat-tile">
                <div className="expert-stat-value-warning">{monthlyEarnings} &#8381;</div>
                <div className="stat-tile-label">{t.Teaching_MonthlyEarnings()}</div>
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
