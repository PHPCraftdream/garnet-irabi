import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import type {BookingViewer, PenaltyTerms} from './bookingAction';

/** Возвращает условия отмены ожидающей заявки. */
export const pendingTerms = (viewer: BookingViewer, status: string | undefined, terms?: PenaltyTerms): string[] => {
    if (viewer === 'expert' || status !== 'pending') return [];

    const out: string[] = [];
    const cost = terms?.cost ?? 0;
    const pct = terms?.penaltyPercent ?? 0;

    if (cost > 0 && pct > 0) {
        out.push(t.Booking_CancelTerms_AfterConfirm([pct, Math.floor(cost * pct / 100)]));
    }

    out.push(t.Booking_CancelTerms_Unanswered());

    return out;
};
