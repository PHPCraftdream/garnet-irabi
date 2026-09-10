export interface Booking {
    id: number;
    user_id?: number;
    bookable_id: number;
    bookable_type: string;
    status: string;
    created_at: number;
    /**
     * Момент подтверждения. Пусто — бронь так и не подтвердили, и потерю такой
     * брони нельзя называть отменой: её сняли или отклонили (D-135).
     */
    confirmed_at?: number | null;
    /**
     * Чьё это было решение. Пусто у броней, отменённых до того, как мы стали
     * это записывать, — таким показываем прежнюю сухую «Отменён», а не
     * выдуманную причину.
     */
    cancelled_role?: 'user' | 'expert' | 'moderator' | 'system' | null;
    /** Текст причины, если тот, кто отменял, был обязан её назвать. */
    cancel_reason?: string;
}

export interface SlotInfo {
    start_at: number;
    is_online: number;
    /** Адрес очного занятия; у онлайнового — ссылка на встречу, её видит только участник. */
    location: string;
    /** Публичное имя площадки онлайн-занятия («Zoom»). */
    platform?: string;
    expert_id: number;
    cost: number;
    cancellation_penalty_percent: number;
}

export interface ExpertInfo {
    display_name: string;
}

export interface UserInfo {
    name: string;
}

export type BookingsViewAs = 'user' | 'expert';

export type StatusFilter = 'all' | 'pending' | 'confirmed' | 'cancelled' | 'completed';

export interface BookingCounts {
    all: number;
    pending: number;
    confirmed: number;
    cancelled: number;
    completed: number;
    past: number;
}

export interface BookingGroupData {
    key: string;
    slotId: number | null;
    slot: SlotInfo | null;
    bookings: Booking[];
    sortKey: number;
}

/**
 * Свести брони в группы по занятию.
 *
 * Групповое занятие показывается одной карточкой со списком записавшихся, а не
 * россыпью одинаковых карточек с одним и тем же временем.
 */
export function groupBookings(bookings: Booking[], slots: Record<number, SlotInfo>): BookingGroupData[] {
    const map = new Map<string, BookingGroupData>();

    for (const b of bookings) {
        const isSlot = b.bookable_type === 'time_slot';
        const key = isSlot ? `time_slot:${b.bookable_id}` : `b:${b.id}`;
        const slot = isSlot ? (slots[b.bookable_id] ?? null) : null;
        let g = map.get(key);
        if (!g) {
            g = {
                key,
                slotId: isSlot ? b.bookable_id : null,
                slot,
                bookings: [],
                sortKey: slot ? slot.start_at : b.created_at,
            };
            map.set(key, g);
        }
        g.bookings.push(b);
    }

    const arr = Array.from(map.values());
    for (const g of arr) {
        g.bookings.sort((a, c) => c.created_at - a.created_at);
    }
    arr.sort((a, c) => c.sortKey - a.sortKey);

    return arr;
}
