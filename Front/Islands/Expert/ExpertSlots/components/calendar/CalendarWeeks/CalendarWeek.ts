import type {Slot} from '@/Islands/Expert/ExpertSlots/types';
import type {CalendarDay} from '@/Islands/Expert/ExpertSlots/components/calendar/Days/index';

/** Представляет неделю календаря, её дни и занятия, сгруппированные по дате. */
export interface CalendarWeek {
    days: CalendarDay[];
    slotsByDay: Map<string, Slot[]>;
}
