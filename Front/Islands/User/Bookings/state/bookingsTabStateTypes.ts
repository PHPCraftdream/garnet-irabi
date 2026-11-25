import type {Booking, BookingCounts, BookingsViewAs, ExpertInfo, SlotInfo, StatusFilter, UserInfo} from '../card/bookingCardTypes';
import type {PageResponse} from '@common/hooks/data/usePagination';

/** Состояние списка броней, включая фильтры и выбранные окна действий. */
export interface BookingsState {
    bookings: Booking[];
    page: number;
    totalPages: number;
    total: number;
    pageLoading: boolean;
    slots: Record<number, SlotInfo>;
    experts: Record<number, ExpertInfo>;
    users: Record<number, UserInfo>;
    viewAs: BookingsViewAs;
    statusFilter: StatusFilter;
    showPast: boolean;
    counts: BookingCounts;
    cancelBookingId: number | null;
    rejectBookingId: number | null;
    rescheduleBookingId: number | null;
    rescheduleError: string | undefined;
    confirmingId: number | null;
}

/** Плоские данные страницы для списка и карточек броней. */
export interface BookingsPageData {
    bookings: Booking[];
    slots: Record<number, SlotInfo>;
    experts: Record<number, ExpertInfo>;
    users: Record<number, UserInfo>;
    counts: BookingCounts;
}

/** Тип ответа сервера со связанными данными слотов и участников. */
export interface BookingsPageResponse extends PageResponse<Booking> {
    slots: Record<number, SlotInfo>;
    experts: Record<number, ExpertInfo>;
    users?: Record<number, UserInfo>;
    counts?: BookingCounts;
}
