import type {ExistingItem} from '@/Islands/Expert/ExpertSlots/types';

/** Перевести время `HH:mm` в число минут от начала суток. */
function timeToMinutes(time: string): number {
    const parts = time.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

/** Проверить пересечение занятия с существующими занятиями на дату и время. */
export function findExistingOverlap(
    existingSlots: readonly ExistingItem[],
    date: string,
    time: string,
    duration: number,
): boolean {
    const start = timeToMinutes(time);
    const end = start + duration;
    for (const slot of existingSlots) {
        if (slot.date !== date) continue;
        const otherStart = timeToMinutes(slot.time);
        if (start < otherStart + slot.duration_min && end > otherStart) return true;
    }
    return false;
}
