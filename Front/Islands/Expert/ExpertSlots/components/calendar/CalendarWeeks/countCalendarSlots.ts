import {emptyCounts} from '@/Islands/Expert/ExpertSlots/components/calendar/logic/emptyCounts';
import {slotKind} from '@/Islands/Expert/ExpertSlots/components/calendar/logic/slotKind';
import type {Slot} from '@/Islands/Expert/ExpertSlots/types';

/** Подсчитать занятия по статусам до, внутри и после календарного окна. */
export function countCalendarSlots(
    slots: readonly Slot[],
    windowStartUnix: number,
    windowEndUnix: number,
) {
    const prev = emptyCounts();
    const next = emptyCounts();
    const win = emptyCounts();

    for (const slot of slots) {
        const kind = slotKind(slot);
        if (!kind) continue;
        if (slot.start_at < windowStartUnix) prev[kind]++;
        else if (slot.start_at >= windowEndUnix) next[kind]++;
        else win[kind]++;
    }

    return {prevCounts: prev, nextCounts: next, windowCounts: win};
}
