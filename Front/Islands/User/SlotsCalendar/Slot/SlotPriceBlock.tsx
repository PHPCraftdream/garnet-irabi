import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';

export const SlotPriceBlock: React.FC<{cost: number}> = ({cost}) => (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-alt" data-test-id="slot-detail-price">
        <span className="text-sm text-muted">{t.Slot_PricePaid()}</span>
        <span className="font-semibold text-lg">{cost} &#8381;</span>
    </div>
);
