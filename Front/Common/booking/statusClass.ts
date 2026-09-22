/**
 * Universal status badge — uses @utility classes from theme.css.
 * status-info, status-success, status-danger, etc.
 * No inline styles, no hardcoded colors.
 */

export const STATUS_CLASS: Record<string, string> = {
    // Booking
    pending:    'status-warning',
    confirmed:  'status-success',
    completed:  'status-info',
    cancelled:  'status-danger',

    // Slots
    free:       'status-success',
    booked:     'status-info',

    // Runs
    active:     'status-success',
    draft:      'status-muted',
    planned:    'status-notice',
    scheduled:  'status-info',

    // Support
    open:              'status-info',
    investigation:     'status-active',
    in_progress:       'status-warning',
    waiting_user:      'status-notice',
    waiting_support:   'status-danger',
    escalated:         'status-special',
    on_hold:           'status-muted',
    resolved:          'status-success',
    rejected:          'status-muted',

    // Roles
    user:       'status-info',
    expert:     'status-success',
    moderator:  'status-special',
    owner:      'status-warning',
    admin:      'status-danger',
};

/**
 * Класс подсветки для статуса — для мест, которым нужен цвет без самой
 * плашки. Заводить рядом второй такой словарь нельзя: он неизбежно
 * разойдётся с этим, и один и тот же статус окажется разного цвета на
 * соседних экранах.
 */
export const statusClass = (status: string): string => STATUS_CLASS[status] || 'status-muted';
