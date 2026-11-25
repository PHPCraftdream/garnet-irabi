import type {PenaltyPreview, PenaltyTerms} from '../rules/bookingAction';
import {isConfirmed} from '../../status/isConfirmed';

/** Рассчитывает удержание и возврат при отмене брони. */
export const penaltyPreview = (status: string | undefined, terms: PenaltyTerms): PenaltyPreview => {
    const cost = terms.cost ?? 0;
    const pct = terms.penaltyPercent ?? 0;
    const applies = isConfirmed(status)
        && cost > 0
        && pct > 0
        && terms.startAt > Math.floor(Date.now() / 1000);

    const penaltyAmount = applies ? Math.floor(cost * pct / 100) : 0;

    return {applies, penaltyAmount, refundAmount: cost - penaltyAmount};
};

/** Короткая подпись цены действия — рядом с кнопкой, до нажатия. */
