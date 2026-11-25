/**
 * Universal status badge — uses @utility classes from theme.css.
 * status-info, status-success, status-danger, etc.
 * No inline styles, no hardcoded colors.
 */

/**
 * Класс подсветки для статуса — для мест, которым нужен цвет без самой
 * плашки. Заводить рядом второй такой словарь нельзя: он неизбежно
 * разойдётся с этим, и один и тот же статус окажется разного цвета на
 * соседних экранах.
 */
/** Класс подсветки статуса без плашки. */
import {STATUS_CLASS} from './STATUS_CLASS';

/** Класс подсветки статуса без плашки. */
export const statusClass = (status: string): string => STATUS_CLASS[status] || 'status-muted';
