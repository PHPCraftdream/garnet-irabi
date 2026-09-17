import {I18nForeground as t} from '../../I18nGen/I18nForeground';

/**
 * Translate any status string to current language.
 * Works for booking and slot statuses.
 */
const STATUS_MAP: Record<string, () => string> = {
    // Booking statuses
    pending: () => t.Booking_Status_Pending(),
    confirmed: () => t.Booking_Status_Confirmed(),
    cancelled: () => t.Booking_Status_Cancelled(),
    completed: () => t.Booking_Status_Completed(),

    // Slot statuses
    free: () => t.Slot_Status_Free(),
    booked: () => t.Slot_Status_Booked(),
    // Занятия не было: время вышло, а на слоте так никто и не побывал.
    // У броней такого состояния нет — бронь на несостоявшееся занятие
    // отменяется с возвратом, а не доживает до терминального статуса.
    expired: () => t.Slot_Status_Expired(),
};

export function translateStatus(status: string): string {
    const fn = STATUS_MAP[status];
    return fn ? fn() : status;
}
