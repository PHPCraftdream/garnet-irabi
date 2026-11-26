import type {PagerCounts} from '@/Islands/Expert/ExpertSlots/components/calendar/CalendarPager';

/** Создать нулевые счётчики для категорий пагинатора. */
export const emptyCounts = (): PagerCounts => ({free: 0, pending: 0, booked: 0, completed: 0});
