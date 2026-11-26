import * as React from 'react';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';

const slotsNoSlots = t.Slots_NoSlots;

/** Обновляет данные календаря. */
export const WeekEmptyNotice: React.FC = () => (
    <div className="week-empty-notice" data-test-id="week-empty-mobile">
        {slotsNoSlots()}
    </div>
);
