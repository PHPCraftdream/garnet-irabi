import * as React from 'react';
import {PageResponse} from '@common/hooks/data/usePagination';
import {PageHeader} from '@common/Components/Layout/PageHeader';
import {CalendarRange} from 'lucide-react';
import AdminCancellationsTab, {CancellationRow} from './AdminCancellationsTab';
import {AccountOption} from './adminShared';
import {AdminSlotsTab} from './bookings/AdminSlotsTab';
import {AdminBookingsTab} from './bookings/AdminBookingsTab';
import {AdminBookingRow, AdminSlotRow} from './bookings/bookingsTypes';

export type {AccountOption} from './adminShared';

type TabKey = 'slots' | 'bookings' | 'expert-cancellations' | 'user-cancellations';

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

function pushTabToUrl(tab: TabKey): void {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.pushState({}, '', url.toString());
}

interface TabNavProps {
    tabs: TabKey[];
    tabLabels: Record<TabKey, string>;
    activeTab: TabKey;
    onSelect: (tab: TabKey) => void;
}

const TabNav: React.FC<TabNavProps> = ({tabs, tabLabels, activeTab, onSelect}) => (
    <div className="flex flex-wrap items-center gap-2 mb-4" role="tablist" data-test-id="admin-bookings-section-tabs">
        {tabs.map(tab => (
            <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={tab === activeTab}
                className={`chip ${tab === activeTab ? 'chip-active' : ''}`}
                onClick={() => onSelect(tab)}
                data-test-id={`tabnav-btn-${tab}`}
            >
                {tabLabels[tab]}
            </button>
        ))}
    </div>
);

/** Занятия, брони и отмены — четыре вкладки над одним набором фильтров. */
export const AdminBookingsIsland: React.FC<Props> = (props) => {
    const {
        pageTitle, activeTab: initialTab, tabs, tabLabels,
        experts, users,
        slotsPayload, slotsPageUrl,
        bookingsPayload, bookingsPageUrl,
        expertCancellationsPayload, expertCancellationsPageUrl,
        userCancellationsPayload, userCancellationsPageUrl,
        allowedStatuses, allowedSlotStatuses,
    } = props;

    const [activeTab, setActiveTab] = React.useState<TabKey>(initialTab);

    // Кнопка «назад» в браузере должна возвращать на прежнюю вкладку, а не
    // уводить со страницы целиком.
    React.useEffect(() => {
        const onPopState = () => {
            if (typeof window === 'undefined') return;
            const requested = new URLSearchParams(window.location.search).get('tab') as TabKey | null;
            setActiveTab(requested && tabs.includes(requested) ? requested : tabs[0]);
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, [tabs]);

    const handleTabClick = React.useCallback((tab: TabKey) => {
        if (tab === activeTab || !tabs.includes(tab)) return;
        setActiveTab(tab);
        pushTabToUrl(tab);
    }, [activeTab, tabs]);

    return (
        <div>
            <PageHeader title={pageTitle} icon={<CalendarRange size={22} aria-hidden="true" />} />
            <div className="section-soft">
                <TabNav tabs={tabs} tabLabels={tabLabels} activeTab={activeTab} onSelect={handleTabClick} />

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
            </div>
        </div>
    );
};
