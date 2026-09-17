import * as React from 'react';
import {useState, useCallback} from 'react';
import {sendPost} from '@common/Api/Send/sendPost';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {appUrl} from '@common/Utils/Url/appUrl';
import {refreshLiveCounts} from '@common/Utils/Data/liveCounts';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import BookingModal from './BookingModal';
import {bookErrorCode, bookErrorMessage} from './bookingErrors';
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
                // Бронирование двигает деньги, а баланс висит в шапке на
                // каждой странице. Раньше его обновляли только те экраны,
                // которые сами про это помнили: забронировав с карточки
                // преподавателя, человек видел прежнюю сумму в шапке и
                // правильную на странице баланса — два вида одного числа
                // расходились (нашла user-6). Обновление стоит здесь, в общем
                // крючке, а не в каждом вызывающем экране: следующий экран,
                // который научится бронировать, получит его даром.
                refreshLiveCounts();
                onBooked?.();
            }}
        />
    ) : null;

    return {openBooking, bookingModal, bookingLoading: loading};
}
