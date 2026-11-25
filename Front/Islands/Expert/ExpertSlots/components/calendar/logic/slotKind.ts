import type {Slot} from '../../../types';
import type {PagerKind} from '../CalendarPager';

/** Определить учитываемый пагинатором статус занятия. */
export const slotKind = (s: Slot): PagerKind | null => {
    if (s.status === 'free') return 'free';
    if (s.status === 'completed') return 'completed';
    if (s.status === 'booked') return s.booking_status === 'pending' ? 'pending' : 'booked';
    return null;
};
