import {Carburetor} from '@react-carburetor/core';
import type {SlotItem, SlotsCalendarProps} from './types';

interface BookingState {
    slots: SlotItem[];
    bookedIds: number[];
    slotStatuses: Record<string, string>;
    bookingSlot: SlotItem | null;
    detailSlot: SlotItem | null;
}

function uniqueIds(ids: number[] = []): number[] {
    return [...new Set(ids)];
}

export class SlotsCalendarBookingStore extends Carburetor<BookingState> {
    constructor({slots, bookedSlotIds, bookedSlotStatuses}: SlotsCalendarProps) {
        super({slots, bookedIds: uniqueIds(bookedSlotIds), slotStatuses: {...bookedSlotStatuses}, bookingSlot: null, detailSlot: null});
    }

    private replace(previous: BookingState, next: BookingState): void {
        const version = this.getVersion();
        this.setData(next);
        if (this.getData() !== previous && this.getVersion() === version) {
            this.markAllChanged();
            this.emitUpdate();
        }
    }

    /** Объект слота из собственных данных: в стор не должен попадать вью-прокси useCarburetor. */
    private resolve(slot: SlotItem | null): SlotItem | null {
        if (!slot) return null;
        return this.getData().slots.find(candidate => candidate.id === slot.id) ?? slot;
    }

    readonly showBooking = (slot: SlotItem | null) => {
        const before = this.getData();
        const target = this.resolve(slot);
        if (before.bookingSlot !== target) this.replace(before, {...before, bookingSlot: target});
    };

    readonly showDetail = (slot: SlotItem | null) => {
        const before = this.getData();
        const target = this.resolve(slot);
        if (before.detailSlot !== target) this.replace(before, {...before, detailSlot: target});
    };

    readonly closeBooking = () => this.showBooking(null);
    readonly closeDetail = () => this.showDetail(null);

    refresh(slotId: number, updated: SlotItem): void {
        const before = this.getData();
        const index = before.slots.findIndex(slot => slot.id === slotId);
        if (index < 0) return;
        const slots = before.slots.slice();
        slots[index] = {...slots[index], ...updated};
        this.replace(before, {...before, slots});
    }

    markBooked(ids: number[]): void {
        const before = this.getData();
        const bookedIds = [...new Set([...before.bookedIds, ...ids])];
        const slotStatuses = {...before.slotStatuses};
        for (const id of ids) slotStatuses[String(id)] = 'pending';
        const slots: SlotItem[] = [];
        for (const slot of before.slots) {
            slots.push(ids.includes(slot.id) ? {...slot, booked_count: Math.min((slot.booked_count ?? 0) + 1, slot.max_users || 1)} : slot);
        }
        this.replace(before, {...before, slots, bookedIds, slotStatuses, bookingSlot: null});
    }

    markCancelled(id: number): void {
        const before = this.getData();
        const slotStatuses = {...before.slotStatuses, [String(id)]: 'cancelled'};
        this.replace(before, {...before, slotStatuses, detailSlot: null});
    }
}
