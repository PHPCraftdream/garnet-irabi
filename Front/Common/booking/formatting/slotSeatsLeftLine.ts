import type {SeatsSource} from './slotFormat';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';

/** Returns the appropriate slot-format label. */
export function slotSeatsLeftLine(slot: SeatsSource): string {
    const max = slot.max_users ?? 1;

    if (max <= 1 || typeof slot.booked_count !== 'number') return '';

    return t.Slot_SeatsLeft([String(Math.max(0, max - slot.booked_count)), String(max)]);
}
