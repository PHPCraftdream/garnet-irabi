import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';

export const WeekEmptyNotice: React.FC = () => (
    <div className="week-empty-notice" data-test-id="week-empty-mobile">
        {t.Slots_NoSlots()}
    </div>
);
