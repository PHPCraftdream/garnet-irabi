import {I18nForeground as t} from '../../I18nGen/I18nForeground';

/**
 * Turning a refused booking into something a person can read.
 *
 * The server answers a refusal with a short machine code — `slot_in_past`,
 * `self_slot` — because the two booking entry points need to branch on it
 * (one of them follows a redirect). The code is not a message: shown as-is it
 * reads like a leaked internal name, and a modal that fails without saying
 * anything looks to the user like the button simply did not work.
 *
 * These two helpers live apart from either entry point so both can use them.
 * They used to sit inside the hook, which meant the catalogue's own booking
 * dialog — the busiest path of the two — had no access to them and showed
 * whatever `Error.message` happened to hold.
 */

/** Pull the server's booking error code out of a thrown request error. */
export function bookErrorCode(e: any): string {
    const resp = e?.response;
    if (resp && typeof resp === 'object' && typeof resp.error === 'string') {
        return resp.error;
    }
    const raw = typeof resp === 'string' ? resp : (e?.message ?? '');
    return /not.?found/i.test(raw) ? 'not_found' : '';
}

/** Map a booking error code to a localized, user-facing message. */
export function bookErrorMessage(code: string): string {
    switch (code) {
        case 'self_slot':        return t.Slot_BookError_Self();
        case 'not_user':         return t.Slot_BookError_NotUser();
        case 'slot_unavailable': return t.Slot_BookError_Unavailable();
        case 'slot_in_past':     return t.Slot_BookError_Past();
        case 'insufficient_balance': return t.Booking_InsufficientBalance();
        case 'slot_rescheduled': return t.Slot_Rescheduled();
        case 'account_busy':     return t.Slot_BookError_Busy();
        default:                 return t.News_SlotUnavailable();
    }
}
