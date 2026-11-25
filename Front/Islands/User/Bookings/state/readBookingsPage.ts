import {TReadonly} from '@react-carburetor/core';
import {BookingCounts, ExpertInfo, SlotInfo, UserInfo} from '../card/bookingCardTypes';
import type {BookingsState, BookingsPageData} from './bookingsTabStateTypes';

/** Копирует список преподавателей из прокси состояния. */
function readExpertMap(source: TReadonly<Record<number, ExpertInfo>>): Record<number, ExpertInfo> {
    const experts: Record<number, ExpertInfo> = {};
    for (const key of Object.keys(source)) {
        experts[Number(key)] = {display_name: source[Number(key)].display_name};
    }
    return experts;
}

/** Создаёт обычные копии данных страницы для дочерних компонентов. */
export function readBookingsPage(state: TReadonly<BookingsState>): BookingsPageData {
    const slots: Record<number, SlotInfo> = {};
    for (const key of Object.keys(state.slots)) {
        const row = state.slots[Number(key)];
        slots[Number(key)] = {
            start_at: row.start_at, is_online: row.is_online, location: row.location,
            platform: row.platform, expert_id: row.expert_id, cost: row.cost,
            cancellation_penalty_percent: row.cancellation_penalty_percent,
            max_users: row.max_users, booked_count: row.booked_count,
        };
    }
    const users: Record<number, UserInfo> = {};
    for (const key of Object.keys(state.users)) users[Number(key)] = {name: state.users[Number(key)].name};
    const counts: BookingCounts = {
        all: state.counts.all, pending: state.counts.pending, confirmed: state.counts.confirmed,
        cancelled: state.counts.cancelled, completed: state.counts.completed, past: state.counts.past,
    };
    const bookings = [];
    for (const row of state.bookings) {
        bookings.push({
            id: row.id, user_id: row.user_id, bookable_id: row.bookable_id,
            bookable_type: row.bookable_type, status: row.status, created_at: row.created_at,
            confirmed_at: row.confirmed_at, cancelled_role: row.cancelled_role, cancel_reason: row.cancel_reason,
        });
    }
    return {
        bookings, slots, experts: readExpertMap(state.experts), users, counts,
    };
}
