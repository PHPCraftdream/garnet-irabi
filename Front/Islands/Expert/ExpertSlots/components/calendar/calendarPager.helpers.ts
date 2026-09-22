import type {Slot} from '../../types';
import type {PagerKind, PagerCounts} from './CalendarPager';

export const PAGER_KINDS = ['free', 'pending', 'booked', 'completed'] as const;

/** Отнести слот к виду для подсказки пагинатора; отменённые не считаются. */
export const slotKind = (s: Slot): PagerKind | null => {
    if (s.status === 'free') return 'free';
    if (s.status === 'completed') return 'completed';
    if (s.status === 'booked') return s.booking_status === 'pending' ? 'pending' : 'booked';
    return null;
};

export const emptyCounts = (): PagerCounts => ({free: 0, pending: 0, booked: 0, completed: 0});
