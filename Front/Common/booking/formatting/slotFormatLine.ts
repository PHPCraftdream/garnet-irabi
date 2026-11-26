import type {SlotFormatSource} from './slotFormat';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';

/** Returns the appropriate slot-format label. */
export function slotFormatLine(slot: SlotFormatSource): string {
    const online = !!Number(slot.is_online);
    const word = online ? t.Slots_Online() : t.Slots_Offline();
    const detail = (online ? slot.platform : slot.location)?.trim();

    return detail ? `${word} · ${detail}` : word;
}

/**
 * Подпись для строки-уточнения там, где формат и место показаны отдельными
 * полями: у онлайна это площадка, у очного — адрес.
 */
