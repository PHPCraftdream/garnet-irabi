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

/**
 * Плоская копия строки таблицы.
 *
 * Спред массива (`[...items]`) читает только длину и индексы-маркеры, поэтому замена
 * `items` целиком — она диффится до листьев — не разбудила бы таблицу. Копия читает поля
 * строки в рендере родителя и меняет ссылку вместе с содержимым.
 */
export function copyRow<T extends object>(row: T): T {
    return {...row};
}
