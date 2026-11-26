import type {SupportStatus} from '@/Islands/Comms/Support/parts/supportTypes';

/** Список статусов, доступных для фильтрации обращений. */
export const ALL_STATUSES: SupportStatus[] = [
    'open', 'investigation', 'in_progress', 'waiting_user', 'waiting_support',
    'escalated', 'on_hold', 'resolved', 'rejected',
];
