export interface SlotItem {
    id: number;
    expert_id: number;
    start_at: number;
    end_at: number;
    duration_min: number;
    cost: number;
    cancellation_penalty_percent: number;
    is_online: number;
    /** Адрес очного занятия. У онлайнового пусто: ссылка на встречу наружу не отдаётся. */
    location: string;
    /** Публичное имя площадки онлайн-занятия («Zoom»). Пусто у очного. */
    platform?: string;
    max_users: number;
    status: string;
    uid?: string;
    created_at: number;
}

export interface ExpertInfo {
    display_name: string;
    account_id: number;
}

export interface ExpertMap {
    [accountId: string]: ExpertInfo;
}

export interface BookedSlotStatuses {
    [slotId: string]: string; // slotId -> 'pending' | 'confirmed' | 'cancelled' | 'completed'
}

export interface SlotsCalendarProps {
    slots: SlotItem[];
    experts: ExpertMap;
    title: string;
    bookedSlotIds?: number[];
    bookedSlotStatuses?: BookedSlotStatuses;
    bookedSlotBookingIds?: Record<string, number>;
    csrf?: string;
    balance?: number;
    bookUrl?: string;
    isModerator?: boolean;
    canBook?: boolean;
    /**
     * The viewer teaches here. The catalog deliberately hides their own
     * slots — nobody books themselves — but without a word about it the
     * page reads as "my slots vanished", which is exactly how every expert
     * who looked at it during testing read it.
     */
    isExpertViewer?: boolean;
    quickChatUrl?: string;
    sendUrl?: string;
    currentAccountId?: number;
    cancelReasons?: Record<string, string>;
}

export type SlotStatusFilter = 'all' | 'free' | 'mine' | 'pending' | 'confirmed' | 'cancelled' | 'past';

export type TimeOfDay = 'all' | 'morning' | 'day' | 'evening';
export type SlotType = 'all' | 'individual' | 'group';
export type OnlineFilter = 'all' | 'online' | 'offline';

export interface FiltersState {
    expertIds: Set<string>;
    priceMin: string;
    priceMax: string;
    timeOfDay: TimeOfDay;
    slotType: SlotType;
    onlineFilter: OnlineFilter;
}

/** Represents a single day in the week grid (resolved in the user's TZ). */
export interface DayInfo {
    dayTs: number;     // unix-seconds of 00:00 in the user's TZ
    dayOfWeek: number; // 0=Sun..6=Sat (Sun = week start, after Shabbat)
    dateStr: string;   // "YYYY-MM-DD" in the user's TZ — stable grouping key
    dayNum: string;    // day-of-month (e.g. "17"), for the column badge
    isToday: boolean;
    isPast: boolean;
}
