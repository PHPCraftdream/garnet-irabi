import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {pluralize} from '@common/Utils/Ui/pluralize';

const slotPlural1 = t.Slot_Plural_1;
const slotPlural2 = t.Slot_Plural_2;
const slotPlural5 = t.Slot_Plural_5;

/** Обновляет данные календаря. */
export const WeekSlotCount: React.FC<{count: number}> = ({count}) => (
    <div className="week-slot-total" data-test-id="week-slot-count">
        {pluralize(count, slotPlural1(), slotPlural2(), slotPlural5())}
    </div>
);
