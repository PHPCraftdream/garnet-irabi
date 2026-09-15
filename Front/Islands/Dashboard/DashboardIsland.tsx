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
    /** D-190: заявки, истёкшие без ответа преподавателя. */
    missed?: number;
    /** D-206: адрес, по которому перечитываются числа шапки после действия. */
    expertStatsUrl?: string;
    // Moderator data
    openTickets?: number;
    pendingApprovals?: number;
    totalUsers?: number;
    bookingsThisMonth?: number;
    // News
    /** Базовый адрес точек ленты (`~feed`, `~archive`, …), не страница. */
    newsApiUrl: string;
    unreadNews: number;
}

export const DashboardIsland: React.FC<DashboardProps> = (props) => {
    const {
        name, avatar, avatar_full, role, isExpert, isModerator, balance,
        unreadSupport, unreadIm,
        upcomingBookings, recommendedSlots,
        expertSlots, pendingBookings, usersThisMonth, earningsThisMonth,
        declines, cancellations, missed, expertStatsUrl,
        expertPendingBookingsList, expertConfirmedBookingsList,
        openTickets, pendingApprovals, totalUsers, bookingsThisMonth,
        newsApiUrl, unreadNews,
    } = props;

    // One fact, one place. The pending list, the confirmed list and the stats
    // counter each held their own copy and were updated separately — so
    // confirming a booking left three views of the same page disagreeing until
    // it was reloaded by hand. Now they all read this.
    const [pending, setPending] = React.useState<PendingBookingItem[]>(expertPendingBookingsList ?? []);
    const [confirmed, setConfirmed] = React.useState<ConfirmedBookingItem[]>(expertConfirmedBookingsList ?? []);

    // D-206: та же болезнь, что вылечили у списка, оставалась у чисел над ним.
    // Список стал живым, а «Отклонений», «Доход за месяц» и остальные четыре
    // так и приходили пропсами один раз вместе с HTML. Преподаватель отклонял
    // заявку — карточка исчезала, а рядом продолжало висеть прежнее число
    // отклонений и прежний доход, не учитывающий уже сделанный возврат.
    const [stats, setStats] = React.useState({
        usersThisMonth: usersThisMonth ?? 0,
        earningsThisMonth: earningsThisMonth ?? 0,
        declines: declines ?? 0,
        cancellations: cancellations ?? 0,
        missed: missed ?? 0,
    });

    const reloadStats = React.useCallback((): void => {
        if (!expertStatsUrl) return;
        fetch(expertStatsUrl, {headers: {Accept: 'application/json'}, credentials: 'same-origin'})
            .then(res => (res.ok ? res.json() : null))
            .then((r: any) => {
                if (!r || typeof r !== 'object' || r.error) return;
                setStats({
                    usersThisMonth: Number(r.usersThisMonth) || 0,
                    earningsThisMonth: Number(r.earningsThisMonth) || 0,
                    declines: Number(r.declines) || 0,
                    cancellations: Number(r.cancellations) || 0,
                    missed: Number(r.missed) || 0,
                });
            })
            .catch(() => {
                // Сеть моргнула — числа остались прежними. Показать вместо них
                // нули было бы хуже самой находки.
            });
    }, [expertStatsUrl]);

    const handleConfirmed = React.useCallback((booking: PendingBookingItem): void => {
        setPending(prev => prev.filter(b => b.booking_id !== booking.booking_id));
        // Inserted in start order, the same order the server sends them in, so
        // a confirmed booking does not jump to the end of the list.
        setConfirmed(prev => [...prev, booking].sort((a, b) => a.start_at - b.start_at));
        reloadStats();
    }, [reloadStats]);

    const handleRejected = React.useCallback((bookingId: number): void => {
        setPending(prev => prev.filter(b => b.booking_id !== bookingId));
        // Отклонение двигает сразу два числа: счётчик отклонений и доход —
        // потому что вместе с отказом уходит возврат.
        reloadStats();
    }, [reloadStats]);

    return (
        <IrabiPreviewProvider>
        <div className="page-narrow space-y-6" data-test-id="dashboard">
            <WelcomeCard name={name} role={role} balance={balance} avatar={avatar} avatar_full={avatar_full} />

            <NotificationsWidget unreadSupport={unreadSupport} unreadIm={unreadIm} />

            {newsApiUrl && <NewsFeed feedUrl={newsApiUrl} initialUnreadCount={unreadNews ?? 0} />}

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
                    pendingBookings={pending.length}
                    usersThisMonth={stats.usersThisMonth}
                    earningsThisMonth={stats.earningsThisMonth}
                    declines={stats.declines}
                    cancellations={stats.cancellations}
                    missed={stats.missed}
                />
            )}

            {isExpert && expertPendingBookingsList && (
                <ExpertPendingBookings
                    bookings={pending}
                    onConfirmed={handleConfirmed}
                    onRejected={handleRejected}
                />
            )}

            {isExpert && expertConfirmedBookingsList && (
                <ExpertConfirmedBookings bookings={confirmed} />
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
