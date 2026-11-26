import type {SlotItem} from '@/Islands/User/SlotsCalendar/State/view/types';

/** Builds a lookup from slot IDs to their current statuses. */
export function indexSlotStatuses(
    slots: readonly SlotItem[],
): Map<number, string> {
    const statuses = new Map<number, string>();
    for (const slot of slots) statuses.set(slot.id, slot.status);
    return statuses;
}
