export const TICKET_STATUS_TONE: Record<string, string> = {
    open:             'warning',
    investigation:    'info',
    in_progress:      'info',
    waiting_user:     'warning',
    waiting_support:  'warning',
    escalated:        'danger',
    on_hold:          'secondary',
    deferred:         'secondary',
    low_priority:     'secondary',
    resolved:         'success',
    rejected:         'secondary',
};

    /** Формирует представление данных для соответствующего раздела панели. */
