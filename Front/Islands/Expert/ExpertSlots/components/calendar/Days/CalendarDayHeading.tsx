import * as React from 'react';
import {I18nForeground as t} from '../../../../../../I18nGen/I18nForeground';

interface Props {
    dayOfWeek: number;
    label: string;
    isToday: boolean;
}

/** Получить или вычислить соответствующие данные. */
function dayLabel(dayOfWeek: number): string {
    const labels = [t.Cal_Sun, t.Cal_Mon, t.Cal_Tue, t.Cal_Wed, t.Cal_Thu, t.Cal_Fri, t.Cal_Sat];
    return labels[dayOfWeek]?.() || '';
}

/** Подготовить данные для соответствующего интерфейса. */
export const CalendarDayHeading: React.FC<Props> = ({dayOfWeek, label, isToday}) => (
    <div className={isToday ? 'expert-day-current-title' : 'expert-day-title'}>
        {dayLabel(dayOfWeek)} {label}
    </div>
);
