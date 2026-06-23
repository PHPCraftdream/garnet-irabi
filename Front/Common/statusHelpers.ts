import {I18nForeground as t} from '../I18nGen/I18nForeground';

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
};

export function translateStatus(status: string): string {
    const fn = STATUS_MAP[status];
    return fn ? fn() : status;
}
