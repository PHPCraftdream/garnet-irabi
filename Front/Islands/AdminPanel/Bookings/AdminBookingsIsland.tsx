import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {PageResponse} from '@common/hooks/data/usePagination';
import {PageHeader} from '@common/Components/Layout/PageHeader';
import {CalendarRange} from 'lucide-react';
import AdminCancellationsTab, {CancellationRow} from './CancellationsTab/AdminCancellationsTab';
import {AccountOption} from '../Shell/shared/adminShared';
import {AdminSlotsTab} from './SlotsTab/AdminSlotsTab';
import {AdminBookingsTab} from './BookingsTab/AdminBookingsTab';
import {AdminBookingRow, AdminSlotRow} from './shared/bookingsTypes';
import {AdminBookingsTabNav, TabKey} from './AdminBookingsTabNav';

export type {AccountOption} from '../Shell/shared/adminShared';

interface Props {
    pageTitle: string;
    activeTab: TabKey;
    tabs: TabKey[];
    tabLabels: Record<TabKey, string>;
    experts: AccountOption[];
    users: AccountOption[];
    slotsPayload: PageResponse<AdminSlotRow> | null;
    slotsPageUrl: string;
    bookingsPayload: PageResponse<AdminBookingRow> | null;
    bookingsPageUrl: string;
    expertCancellationsPayload: PageResponse<CancellationRow> | null;
    expertCancellationsPageUrl: string;
    userCancellationsPayload: PageResponse<CancellationRow> | null;
    userCancellationsPageUrl: string;
    allowedStatuses: string[];
    allowedSlotStatuses: string[];
}

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
function pushTabToUrl(tab: TabKey): void {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.pushState({}, '', url.toString());
}

/** Занятия, брони и отмены — четыре вкладки над одним набором фильтров. */
export class AdminBookingsIsland extends AntiHookComponent<Props> {
    private readonly ui = new Carburetor({activeTab: this.props.activeTab});

    /** Синхронизирует жизненный цикл компонента с его внешними подписками. */
    componentDidMount(): void {
        super.componentDidMount();
        window.addEventListener('popstate', this.onPopState);
    }

    /** Синхронизирует жизненный цикл компонента с его внешними подписками. */
    componentWillUnmount(): void {
        window.removeEventListener('popstate', this.onPopState);
        super.componentWillUnmount();
    }

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly onPopState = () => {
        if (typeof window === 'undefined') return;
        const {tabs} = this.props;
        const requested = new URLSearchParams(window.location.search).get('tab') as TabKey | null;
        this.ui.setData({activeTab: requested && tabs.includes(requested) ? requested : tabs[0]});
    };

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly handleTabClick = (tab: TabKey) => {
        if (tab === this.ui.getData().activeTab || !this.props.tabs.includes(tab)) return;
        this.ui.setData({activeTab: tab});
        pushTabToUrl(tab);
    };

    /** Формирует представление данных для соответствующего раздела панели. */
    private renderTab(activeTab: TabKey) {
        const {
            experts, users,
            slotsPayload, slotsPageUrl,
            bookingsPayload, bookingsPageUrl,
            expertCancellationsPayload, expertCancellationsPageUrl,
            userCancellationsPayload, userCancellationsPageUrl,
            allowedStatuses, allowedSlotStatuses,
        } = this.props;
        return (
            <>
            {activeTab === 'slots' && (
                <AdminSlotsTab
                    initialData={slotsPayload}
                    pageUrl={slotsPageUrl}
                    allowedStatuses={allowedSlotStatuses}
                    experts={experts}
                    users={users}
                />
            )}
            {activeTab === 'bookings' && (
                <AdminBookingsTab
                    initialData={bookingsPayload}
                    pageUrl={bookingsPageUrl}
                    allowedStatuses={allowedStatuses}
                    experts={experts}
                    users={users}
                />
            )}
            {activeTab === 'expert-cancellations' && (
                <AdminCancellationsTab
                    initialData={expertCancellationsPayload}
                    pageUrl={expertCancellationsPageUrl}
                    isModerator={true}
                    kind="expert"
                    experts={experts}
                    users={users}
                />
            )}
            {activeTab === 'user-cancellations' && (
                <AdminCancellationsTab
                    initialData={userCancellationsPayload}
                    pageUrl={userCancellationsPageUrl}
                    isModerator={true}
                    kind="user"
                    experts={experts}
                    users={users}
                />
            )}
            </>
        );
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    render() {
        const {pageTitle, tabs, tabLabels} = this.props;
        const {activeTab} = this.useCarburetor(this.ui);
        return (
            <div>
                <PageHeader title={pageTitle} icon={<CalendarRange size={22} aria-hidden="true" />} />
                <div className="section-soft">
                    <AdminBookingsTabNav tabs={tabs} tabLabels={tabLabels} activeTab={activeTab}
        onSelect={this.handleTabClick} />

                    {this.renderTab(activeTab)}
                </div>
            </div>
        );
    }
}
