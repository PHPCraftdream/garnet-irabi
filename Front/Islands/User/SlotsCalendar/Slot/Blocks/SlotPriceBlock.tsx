import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';

const slotPricePaid = t.Slot_PricePaid;

/** Обновляет данные календаря. */
export const SlotPriceBlock: React.FC<{cost: number}> = ({cost}) => (
    <div className="slot-detail-price-panel" data-test-id="slot-detail-price">
        <span className="slot-detail-price-label">{slotPricePaid()}</span>
        <span className="slot-detail-price-value">{cost} &#8381;</span>
    </div>
);
