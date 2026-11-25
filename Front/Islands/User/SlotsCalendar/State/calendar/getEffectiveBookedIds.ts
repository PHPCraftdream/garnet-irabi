/** Returns booked slot IDs, excluding cancelled bookings whose slots are free again. */
export function getEffectiveBookedIds(
    bookedIds: readonly number[],
    slotStatuses: Readonly<Record<string, string>>,
    slotStatusById: Map<number, string>,
) {
    const result = new Set<number>();
    for (const id of bookedIds) {
        const bookingStatus = slotStatuses[String(id)];
        if (bookingStatus === 'cancelled' && slotStatusById.get(id) === 'free')
            continue;
        result.add(id);
    }
    return result;
}
