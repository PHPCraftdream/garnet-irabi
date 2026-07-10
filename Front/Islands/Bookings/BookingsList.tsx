import * as React from 'react';
import {PageResponse} from '@common/hooks/usePagination';
import {IrabiPreviewProvider} from '../../Common/IrabiPreviewProvider';
import BookingsTab, {
    BookingCounts, BookingsViewAs, ExpertInfo, SlotInfo, UserInfo,
} from './BookingsTab';

type StatusFilter = 'all' | 'pending' | 'confirmed' | 'cancelled' | 'completed';

interface Booking {
    id: number;
    user_id?: number;
    bookable_id: number;
    bookable_type: string;
    status: string;
    created_at: number;
}

interface Props {
    bookingsPagination: PageResponse<Booking>;
    bookingsPageUrl: string;
    slots: Record<number, SlotInfo>;
    experts: Record<number, ExpertInfo>;
    users?: Record<number, UserInfo>;
    viewAs?: BookingsViewAs;
    confirmUrl?: string;
    rejectUrl?: string;
    title: string;
    csrf: string;
    isModerator?: boolean;
    currentAccountId?: number;
    initialStatus?: StatusFilter;
    initialShowPast?: boolean;
    initialCounts?: BookingCounts;
}

const BookingsListIslandInner: React.FC<Props> = (props) => {
    const {
        bookingsPagination, bookingsPageUrl,
        slots, experts, users, viewAs = 'user',
        confirmUrl, rejectUrl, title, isModerator = false,
        initialStatus, initialShowPast, initialCounts,
    } = props;

    return (
        <div className="page-narrow">
            <BookingsTab
                bookingsPagination={bookingsPagination}
                bookingsPageUrl={bookingsPageUrl}
                slots={slots}
                experts={experts}
                users={users}
                viewAs={viewAs}
                confirmUrl={confirmUrl}
                rejectUrl={rejectUrl}
                title={title}
                isModerator={isModerator}
                initialStatus={initialStatus}
                initialShowPast={initialShowPast}
                initialCounts={initialCounts}
            />
        </div>
    );
};

export const BookingsListIsland: React.FC<Props> = (props) => (
    <IrabiPreviewProvider>
        <BookingsListIslandInner {...props} />
    </IrabiPreviewProvider>
);
