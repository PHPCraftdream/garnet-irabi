import type {ProposedSlot} from '../../../types';

/** Проверить, наступила ли дата пакетного занятия. */
function isPastSlot(slot: ProposedSlot): boolean {
    return new Date(slot.date + 'T' + (slot.time || '00:00')) < new Date();
}

/** Проверить, содержит ли пакет занятия в прошлом. */
export function anyPastDate(slots: readonly ProposedSlot[]): boolean {
    return slots.some(isPastSlot);
}
