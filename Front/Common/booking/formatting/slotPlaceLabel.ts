import type {SlotFormatSource} from './slotFormat';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';

/** Returns the appropriate slot-format label. */
export function slotPlaceLabel(slot: SlotFormatSource): string {
    return Number(slot.is_online) ? t.Slot_Platform() : t.Slot_Location();
}

/** Само уточнение — площадка или адрес; пустая строка, если его нет. */
