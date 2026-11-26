import {I18nForeground as t} from '@/I18nGen/I18nForeground';

/** Возвращает локализованное сообщение об ошибке бронирования. */
export function bookErrorMessage(code: string): string {
    switch (code) {
        case 'self_slot': return t.Slot_BookError_Self();
        case 'not_user': return t.Slot_BookError_NotUser();
        case 'slot_unavailable': return t.Slot_BookError_Unavailable();
        case 'slot_in_past': return t.Slot_BookError_Past();
        case 'insufficient_balance': return t.Booking_InsufficientBalance();
        case 'slot_rescheduled': return t.Slot_Rescheduled();
        case 'account_busy': return t.Slot_BookError_Busy();
        case 'already_booked': return t.Slot_BookError_AlreadyBooked();
        default: return t.News_SlotUnavailable();
    }
}
