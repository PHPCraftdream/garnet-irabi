import * as React from 'react';
import {IrabiPreviewProvider} from '../../Common/IrabiPreviewProvider';
import {WelcomeCard} from './WelcomeCard';
import {NotificationsWidget} from './NotificationsWidget';
import {UpcomingBookings} from './UpcomingBookings';
import {RecommendedSlots} from './RecommendedSlots';
import {ExpertStats} from './ExpertStats';
import {ExpertUpcomingSlots} from './ExpertUpcomingSlots';
import {ModeratorStats} from './ModeratorStats';
import {NewsFeed} from './NewsFeed';
import {ExpertPendingBookings, PendingBookingItem} from '../ExpertDashboard/ExpertPendingBookings';
import {ExpertConfirmedBookings, ConfirmedBookingItem} from '../ExpertDashboard/ExpertConfirmedBookings';

interface BookingItem {
    id: number;
    start_at: number;
    expert_id: number;
    expert_name: string;
    status: string;
    label: string;
}

interface SlotTeaser {
    id: number;
    start_at: number;
    duration_min: number;
    cost: number;
    expert_id: number;
    expert_name: string;
    label: string;
}

interface ExpertSlotItem {
    id: number;
    start_at: number;
    duration_min: number;
    booked_count: number;
    max_users: number;
    label: string;
}

interface DashboardProps {
    name: string;
    avatar?: string | null;
    avatar_full?: string | null;
    role: string;
    isExpert: boolean;
    isModerator: boolean;
    balance: number;
    unreadSupport: number;
    unreadIm: number;
    // User data
    upcomingBookings: BookingItem[];
    recommendedSlots: SlotTeaser[];
    // Expert data
    expertSlots?: ExpertSlotItem[];
    pendingBookings?: number;
    expertPendingBookingsList?: PendingBookingItem[];
    expertConfirmedBookingsList?: ConfirmedBookingItem[];
    usersThisMonth?: number;
    earningsThisMonth?: number;
    declines?: number;
    cancellations?: number;
    // Moderator data
    openTickets?: number;
    pendingApprovals?: number;
    totalUsers?: number;
    bookingsThisMonth?: number;
    // News
    newsUrl: string;
    unreadNews: number;
}

export const DashboardIsland: React.FC<DashboardProps> = (props) => {
    const {
        name, avatar, avatar_full, role, isExpert, isModerator, balance,
        unreadSupport, unreadIm,
        upcomingBookings, recommendedSlots,
        expertSlots, pendingBookings, usersThisMonth, earningsThisMonth,
        declines, cancellations,
        expertPendingBookingsList, expertConfirmedBookingsList,
        openTickets, pendingApprovals, totalUsers, bookingsThisMonth,
        newsUrl, unreadNews,
    } = props;

    return (
        <IrabiPreviewProvider>
        <div className="page-narrow space-y-6" data-test-id="dashboard">
            <WelcomeCard name={name} role={role} balance={balance} avatar={avatar} avatar_full={avatar_full} />

            <NotificationsWidget unreadSupport={unreadSupport} unreadIm={unreadIm} />

            {newsUrl && <NewsFeed feedUrl={newsUrl} initialUnreadCount={unreadNews ?? 0} />}

            {isModerator && (
                <ModeratorStats
                    openTickets={openTickets ?? 0}
                    pendingApprovals={pendingApprovals ?? 0}
                    totalUsers={totalUsers ?? 0}
                    bookingsThisMonth={bookingsThisMonth ?? 0}
                />
            )}

            {isExpert && (
                <ExpertStats
                    pendingBookings={pendingBookings ?? 0}
                    usersThisMonth={usersThisMonth ?? 0}
                    earningsThisMonth={earningsThisMonth ?? 0}
                    declines={declines ?? 0}
                    cancellations={cancellations ?? 0}
                />
            )}

            {isExpert && expertPendingBookingsList && (
                <ExpertPendingBookings bookings={expertPendingBookingsList} />
            )}

            {isExpert && expertConfirmedBookingsList && (
                <ExpertConfirmedBookings bookings={expertConfirmedBookingsList} />
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Show UpcomingBookings: always for users, only if has bookings for experts/moderators */}
                {((!isExpert && !isModerator) || upcomingBookings.length > 0) && (
                    <UpcomingBookings bookings={upcomingBookings} />
                )}

                <div className="space-y-6">
                    {isExpert && expertSlots && expertSlots.length > 0 && (
                        <ExpertUpcomingSlots slots={expertSlots} />
                    )}
                    {!isExpert && <RecommendedSlots slots={recommendedSlots} />}
                </div>
            </div>
        </div>
        </IrabiPreviewProvider>
    );
};
