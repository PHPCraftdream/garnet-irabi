import type {ProposedSlot} from '../../../types';

/** Перевести время `HH:mm` в число минут от начала суток. */
function timeToMinutes(time: string): number {
    const parts = time.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

/** Проверить пересечение занятия с другими предложенными занятиями. */
export function findProposedOverlap(
    slots: readonly ProposedSlot[],
    date: string,
    time: string,
    duration: number,
    excludeIndex: number,
): boolean {
    const start = timeToMinutes(time);
    const end = start + duration;
    for (const [index, slot] of slots.entries()) {
        if (index === excludeIndex || slot.date !== date) continue;
        const otherStart = timeToMinutes(slot.time);
        if (start < otherStart + slot.duration && end > otherStart) return true;
    }
    return false;
}
