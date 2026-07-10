import * as React from 'react';
import {useState, useCallback} from 'react';
import {sendPost} from '@common/Api/sendPost';
import {showToast} from '@common/Components/GlobalToast';
import {appUrl} from '@common/Utils/appUrl';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import BookingModal from './BookingModal';
import {SlotItem, ExpertMap} from './types';

export interface SlotBookingData {
    slot: SlotItem;
    expert: {account_id: number; display_name: string};
    balance: number;
    csrf: string;
    bookUrl: string;
}

interface UseSlotBookingOptions {
    /** Run after a successful booking (e.g. reload a list). The modal closes regardless. */
    onBooked?: () => void;
}

/** Pull the server's booking error code out of a thrown request error. */
function bookErrorCode(e: any): string {
    const resp = e?.response;
    if (resp && typeof resp === 'object' && typeof resp.error === 'string') {
        return resp.error;
    }
    const raw = typeof resp === 'string' ? resp : (e?.message ?? '');
    return /not.?found/i.test(raw) ? 'not_found' : '';
}

/** Map a booking error code to a localized, user-facing message. */
function bookErrorMessage(code: string): string {
    switch (code) {
        case 'self_slot':        return t.Slot_BookError_Self();
        case 'not_user':         return t.Slot_BookError_NotUser();
        case 'slot_unavailable': return t.Slot_BookError_Unavailable();
        case 'slot_in_past':     return t.Slot_BookError_Past();
        default:                 return t.News_SlotUnavailable();
    }
}

/**
 * Centralised "open the booking modal for a slot" behaviour.
 *
 * Any island that surfaces a bookable slot (news feed, recommended slots, …)
 * gets the SAME flow from one place: fetch the slot's booking context from
 * `/slots/~bookData`, surface a localized toast when the slot is gone / on
 * error, follow a server redirect when required, and otherwise pop the shared
 * <BookingModal> — instead of hard-navigating to a separate booking page.
 *
 * Returns `openBooking(slotId)` to wire to a button and `bookingModal` to drop
 * into the island's JSX (null until a slot is opened).
 */
export function useSlotBooking(options: UseSlotBookingOptions = {}) {
    const {onBooked} = options;
    const [bookData, setBookData] = useState<SlotBookingData | null>(null);
    const [loading, setLoading] = useState(false);

    const openBooking = useCallback(async (slotId: number) => {
        if (loading) return;
        if (!(slotId > 0)) {
            showToast(t.News_SlotUnavailable(), 'warning');
            return;
        }
        setLoading(true);
        try {
            const res = await sendPost<{slot_id: number}, SlotBookingData & {error?: string}>(
                appUrl('/slots/~bookData'), {slot_id: slotId}
            );
            const data = ('data' in res && res.data ? res.data : res) as SlotBookingData & {error?: string};
            if (data.error) {
                showToast(bookErrorMessage(data.error), 'warning');
                return;
            }
            setBookData(data);
        } catch (e: any) {
            // The booking can't proceed (slot taken, in the past, not bookable,
            // …). NEVER navigate the user away — just explain why with a toast
            // and leave them where they are.
            const code = bookErrorCode(e);
            showToast(bookErrorMessage(code), 'warning');
        } finally {
            setLoading(false);
        }
    }, [loading]);

    const bookingModal = bookData ? (
        <BookingModal
            slot={bookData.slot}
            allSlots={[bookData.slot]}
            experts={{[String(bookData.expert.account_id)]: bookData.expert} as ExpertMap}
            bookedIds={new Set<number>()}
            balance={bookData.balance}
            bookUrl={bookData.bookUrl}
            csrf={bookData.csrf}
            onClose={() => setBookData(null)}
            onBooked={() => {
                setBookData(null);
                onBooked?.();
            }}
        />
    ) : null;

    return {openBooking, bookingModal, bookingLoading: loading};
}
