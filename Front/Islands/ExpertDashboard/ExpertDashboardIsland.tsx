import * as React from 'react';
import {ExpertStats} from './ExpertStats';
import {ExpertUpcoming} from './ExpertUpcoming';
import {ExpertPendingBookings, PendingBookingItem} from './ExpertPendingBookings';
import {ExpertConfirmedBookings, ConfirmedBookingItem} from './ExpertConfirmedBookings';
import {IrabiPreviewProvider} from '../../Common/IrabiPreviewProvider';

interface UpcomingSlot {
    id: number;
    start_at: number;
    duration_min: number;
    booked_count: number;
    max_users: number;
    label: string;
}

interface ExpertDashboardProps {
    slotsToday: number;
    slotsTomorrow: number;
    pendingBookings: number;
    monthlyUsers: number;
    monthlyEarnings: number;
    declines: number;
    cancellations: number;
    upcomingSlots: UpcomingSlot[];
    pendingBookingsList: PendingBookingItem[];
    confirmedBookingsList: ConfirmedBookingItem[];
}

export const ExpertDashboardIsland: React.FC<ExpertDashboardProps> = (props) => {
    const {
        slotsToday, slotsTomorrow,
        pendingBookings, monthlyUsers, monthlyEarnings,
        declines, cancellations,
        upcomingSlots, pendingBookingsList, confirmedBookingsList,
    } = props;

    return (
        <IrabiPreviewProvider>
        <div className="space-y-6" data-test-id="expert-dashboard">
            <ExpertStats
                slotsToday={slotsToday}
                slotsTomorrow={slotsTomorrow}
                pendingBookings={pendingBookings}
                monthlyUsers={monthlyUsers}
                monthlyEarnings={monthlyEarnings}
                declines={declines}
                cancellations={cancellations}
            />

            <ExpertPendingBookings bookings={pendingBookingsList} />

            <ExpertConfirmedBookings bookings={confirmedBookingsList} />

            <ExpertUpcoming slots={upcomingSlots} />
        </div>
        </IrabiPreviewProvider>
    );
};
