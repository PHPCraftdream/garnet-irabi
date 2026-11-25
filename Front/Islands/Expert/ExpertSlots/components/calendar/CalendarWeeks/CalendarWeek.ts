import type {Slot} from '../../../types';
import type {CalendarDay} from '../Days/index';

/** Представляет неделю календаря, её дни и занятия, сгруппированные по дате. */
export interface CalendarWeek {
    days: CalendarDay[];
    slotsByDay: Map<string, Slot[]>;
}
