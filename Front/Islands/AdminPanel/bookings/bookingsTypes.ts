export interface AdminBookingRow {
    id: number;
    user_id: number;
    user_name: string;
    expert_id: number;
    expert_name: string;
    expert_has_profile: boolean;
    bookable_type: string;
    bookable_id: number;
    slot_time: number;
    status: string;
    created_at: number;
}

export interface AdminSlotRow {
    id: number;
    expert_id: number;
    expert_name: string;
    expert_has_profile: boolean;
    start_at: number;
    end_at: number;
    duration_min: number;
    cost: number;
    is_online: boolean;
    location: string;
    max_users: number;
    status: string;
    created_at: number;
}

export interface SlotsFilters {
    search: string;
    status: string;
    expertId: number;
    userId: number;
    dateFrom: string;
    dateTo: string;
}

export interface BookingsFilters {
    search: string;
    status: string;
    expertId: number;
    userId: number;
    dateFrom: string;
    dateTo: string;
}

export const EMPTY_FILTERS: SlotsFilters = {
    search: '',
    status: '',
    expertId: 0,
    userId: 0,
    dateFrom: '',
    dateTo: '',
};
