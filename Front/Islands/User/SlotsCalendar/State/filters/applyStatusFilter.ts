import type {SlotItem, SlotStatusFilter} from '../view/types';

/** Filters slots by booking state and, where relevant, their start time. */
export function applyStatusFilter(
    propertyFilteredSlots: readonly SlotItem[],
    statusFilter: SlotStatusFilter,
    effectiveBookedIds: ReadonlySet<number>,
    slotStatuses: Readonly<Record<string, string>>,
) {
    if (statusFilter === 'all') return propertyFilteredSlots;
    const nowSec = Math.floor(Date.now() / 1000);
    return propertyFilteredSlots.filter((slot) => {
        const isBooked = effectiveBookedIds.has(slot.id);
        if (statusFilter === 'free') return !isBooked;
        if (statusFilter === 'mine') return isBooked;
        if (!isBooked) return false;
        const bookingStatus = slotStatuses[String(slot.id)] || '';
        if (statusFilter === 'past') {
            return slot.start_at < nowSec && bookingStatus !== 'cancelled';
        }
        return bookingStatus === statusFilter;
    });
}
