import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {pluralize} from '@common/Utils/Ui/pluralize';

export const WeekSlotCount: React.FC<{count: number}> = ({count}) => (
    <div className="text-xs text-muted text-right mt-3" data-test-id="week-slot-count">
        {pluralize(count, t.Slot_Plural_1(), t.Slot_Plural_2(), t.Slot_Plural_5())}
    </div>
);
