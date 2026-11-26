import {I18nForeground as t} from '@/I18nGen/I18nForeground';

/** Возвращает итоговую подпись отменённой брони. */
export const outcomeLabel = (booking: {
    status?: string;
    confirmed_at?: number | null;
    cancelled_role?: string | null;
}): string => {
    if (booking.status !== 'cancelled') return '';

    const wasConfirmed = !!booking.confirmed_at;
    if (wasConfirmed) return t.Booking_Status_Cancelled();

    switch (booking.cancelled_role) {
        case 'user':
            return t.Booking_Status_Withdrawn();
        case 'expert':
            return t.Booking_Status_Declined();
        // D-260: fell through to the same generic "Отменён" as every other
        // cancellation, so an expert scanning their own bookings list for
        // the one behind the "Не ответил на заявок" stat had no way to
        // tell it apart from an ordinary cancellation.
        case 'system':
            return t.Booking_Status_Missed();
        default:
            return t.Booking_Status_Cancelled();
    }
};

/**
 * Кто потерял бронь и каким действием — одной фразой.
 *
 * Живёт здесь, а не в карточке, потому что ровно эту фразу показывают два
 * разных экрана: карточка брони и строка истории операций. Пока их было две
 * копии, они разъезжались (D-124 — почин на карточке, забытая мини-карточка).
 *
 * `viewerIsStudent` решает, говорить «вы» или называть вторую сторону.
 */
