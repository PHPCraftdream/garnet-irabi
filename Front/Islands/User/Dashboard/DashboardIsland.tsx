import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import type {TReadonly} from '@react-carburetor/core';
import {IrabiPreviewProvider} from '../../../Common/people/preview/IrabiPreviewProvider';
import {WelcomeCard} from './Widgets/WelcomeCard';
import {NotificationsWidget} from './Widgets/NotificationsWidget';
import {UpcomingBookings} from './Widgets/UpcomingBookings';
import {RecommendedSlots} from './Widgets/RecommendedSlots';
import {ExpertStats} from './Widgets/ExpertStats';
import {ExpertUpcomingSlots} from './Widgets/ExpertUpcomingSlots';
import {ModeratorStats} from './Widgets/ModeratorStats';
import {NewsFeed} from './News/NewsFeed';
import {ExpertPendingBookings, PendingBookingItem} from '../../Expert/ExpertDashboard/ExpertPendingBookings';
import {ExpertConfirmedBookings, ConfirmedBookingItem} from '../../Expert/ExpertDashboard/ExpertConfirmedBookings';

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

interface DashboardState {
    pending: PendingBookingItem[];
    confirmed: ConfirmedBookingItem[];
    usersThisMonth: number;
    earningsThisMonth: number;
    declines: number;
    cancellations: number;
    missed: number;
}

/** Сравнивает подтверждённые записи по времени начала. */
function compareBookingStart(a: ConfirmedBookingItem, b: ConfirmedBookingItem): number {
    return a.start_at - b.start_at;
}

export class DashboardIsland extends AntiHookComponent<DashboardProps> {
    private readonly ui = new Carburetor<DashboardState>({
        pending: this.props.expertPendingBookingsList ?? [],
        confirmed: this.props.expertConfirmedBookingsList ?? [],
        usersThisMonth: this.props.usersThisMonth ?? 0,
        earningsThisMonth: this.props.earningsThisMonth ?? 0,
        declines: this.props.declines ?? 0,
        cancellations: this.props.cancellations ?? 0,
        missed: this.props.missed ?? 0,
    });
    private readonly pending = this.connectSelection(this.ui, state => state.pending);
    private readonly confirmed = this.connectSelection(this.ui, state => state.confirmed);

    /** Применяет частичные обновления к данным дашборда. */
    private patch(changes: Partial<DashboardState>): void {
        this.ui.setData({...this.ui.getData(), ...changes});
    }

    /** Повторно загружает статистику преподавателя с сервера. */
    private readonly reloadStats = async (): Promise<void> => {
        const {expertStatsUrl} = this.props;
        if (!expertStatsUrl) return;
        try {
            const response = await fetch(expertStatsUrl, {
                headers: {Accept: 'application/json'},
                credentials: 'same-origin',
            });
            const r: any = response.ok ? await response.json() : null;
            if (!r || typeof r !== 'object' || r.error) return;
            this.patch({
                usersThisMonth: Number(r.usersThisMonth) || 0,
                earningsThisMonth: Number(r.earningsThisMonth) || 0,
                declines: Number(r.declines) || 0,
                cancellations: Number(r.cancellations) || 0,
                missed: Number(r.missed) || 0,
            });
        } catch {
            // При сетевой ошибке сохраняем прежние показатели.
        }
    };

    /** Переносит подтверждённую заявку из ожидания в список записей. */
    private readonly handleConfirmed = (booking: PendingBookingItem): void => {
        const {pending, confirmed} = this.ui.getData();
        // Сортируем только новую копию списка.
        const nextConfirmed = [...confirmed, booking].toSorted(compareBookingStart);
        this.patch({
            pending: pending.filter(b => b.booking_id !== booking.booking_id),
            confirmed: nextConfirmed,
        });
        void this.reloadStats();
    };

    /** Удаляет отклонённую заявку и обновляет статистику. */
    private readonly handleRejected = (bookingId: number): void => {
        this.patch({pending: this.ui.getData().pending.filter(b => b.booking_id !== bookingId)});
        void this.reloadStats();
    };

    /** Показывает статистику и списки преподавателя для экспертной роли. */
    private renderExpert({
        usersThisMonth,
        earningsThisMonth,
        declines,
        cancellations,
        missed,
    }: TReadonly<DashboardState>) {
        const {isExpert, expertPendingBookingsList, expertConfirmedBookingsList} = this.props;
        const pending = this.pending() as PendingBookingItem[];
        const confirmed = this.confirmed() as ConfirmedBookingItem[];
        if (!isExpert) return null;
        return (
            <>
                <ExpertStats
                    pendingBookings={pending.length}
                    usersThisMonth={usersThisMonth}
                    earningsThisMonth={earningsThisMonth}
                    declines={declines}
                    cancellations={cancellations}
                    missed={missed}
                />
                {expertPendingBookingsList && (
                    <ExpertPendingBookings
                        bookings={pending}
                        onConfirmed={this.handleConfirmed}
                        onRejected={this.handleRejected}
                    />
                )}
                {expertConfirmedBookingsList && <ExpertConfirmedBookings bookings={confirmed} />}
            </>
        );
    }

    /** Собирает блоки предстоящих и рекомендуемых занятий. */
    private renderBookings() {
        const {isExpert, isModerator, upcomingBookings, expertSlots, recommendedSlots} = this.props;
        return (
            <div className="dashboard-bookings-grid">
                {((!isExpert && !isModerator) || upcomingBookings.length > 0) && (
                    <UpcomingBookings bookings={upcomingBookings} />
                )}
                <div className="dashboard-bookings-column">
                    {isExpert && expertSlots && expertSlots.length > 0 && <ExpertUpcomingSlots slots={expertSlots} />}
                    {!isExpert && <RecommendedSlots slots={recommendedSlots} />}
                </div>
            </div>
        );
    }

    /** Отображает карточки, уведомления, ленту и данные дашборда. */
    render() {
        const state = this.useCarburetor(this.ui);
        const {name, avatar, avatar_full, role, isModerator, balance, unreadSupport, unreadIm,
            openTickets, pendingApprovals, totalUsers, bookingsThisMonth, newsApiUrl, unreadNews} = this.props;
        return (
            <IrabiPreviewProvider>
                <div className="dashboard-page" data-test-id="dashboard">
                    <WelcomeCard name={name} role={role} balance={balance} avatar={avatar} avatar_full={avatar_full} />
                    <NotificationsWidget unreadSupport={unreadSupport} unreadIm={unreadIm} />
                    {newsApiUrl && <NewsFeed feedUrl={newsApiUrl} initialUnreadCount={unreadNews ?? 0} />}
                    {isModerator && (
                        <ModeratorStats openTickets={openTickets ?? 0} pendingApprovals={pendingApprovals ?? 0}
                            totalUsers={totalUsers ?? 0} bookingsThisMonth={bookingsThisMonth ?? 0} />
                    )}
                    {this.renderExpert(state)}
                    {this.renderBookings()}
                </div>
            </IrabiPreviewProvider>
        );
    }
}
