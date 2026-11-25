import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';

const slotCost = t.Slot_Cost;

interface Props {
    bookingId: number;
    cost: number;
}

/** Показывает стоимость занятия с идентификатором для тестов. */
export const BookingCostLine: React.FC<Props> = ({bookingId, cost}) => (
    <p className="booking-cost-line">
        <span className="booking-cost-label">{slotCost()}:</span>{' '}
        <span data-test-id={`booking-cost-${bookingId}`}>{cost} &#8381;</span>
    </p>
);
