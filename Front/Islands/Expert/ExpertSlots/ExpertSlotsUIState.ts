import {Carburetor} from '@react-carburetor/core';
import type {Slot} from './types';

export interface State {
    slots: Slot[];
    editingSlot: Slot | null;
    showCreateModal: boolean;
    showBatchModal: boolean;
    cancelBookingSlotId: number | null;
}

export class ExpertSlotsUIState extends Carburetor<State> {
    constructor(slots: Slot[]) {
        super({slots, editingSlot: null, showCreateModal: false, showBatchModal: false, cancelBookingSlotId: null});
    }

    private patch<K extends keyof State>(key: K, value: State[K]): void {
        const current = this.getData();
        if (Object.is(current[key], value)) return;
        this.setData({...current, [key]: value});
    }

    appendSlots(slots: Slot[]): void {
        this.patch('slots', [...this.getData().slots, ...slots]);
    }

    removeSlot(id: number): void {
        this.patch('slots', this.getData().slots.filter(slot => slot.id !== id));
    }

    cancelSlot(id: number | null): void {
        this.changeSlot(id, {status: 'cancelled'});
    }

    confirmBooking(id: number): void {
        this.changeSlot(id, {booking_status: 'confirmed'});
    }

    private changeSlot(id: number | null, fields: Partial<Slot>): void {
        const slots = this.getData().slots;
        const index = slots.findIndex(slot => slot.id === id);
        if (index < 0) return;
        const next = slots.slice();
        next[index] = {...slots[index], ...fields};
        this.patch('slots', next);
    }

    replaceSlot(updated: Slot, keepBooking = false): void {
        const slots = this.getData().slots;
        const index = slots.findIndex(slot => slot.id === updated.id);
        if (index < 0) return;
        const next = slots.slice();
        const previous = slots[index];
        next[index] = keepBooking ? {
            ...previous, ...updated,
            user_id: previous.user_id, user_name: previous.user_name,
            booking_id: previous.booking_id, booking_status: previous.booking_status,
        } : updated;
        this.patch('slots', next);
    }
    readonly setEditingSlot = (slot: Slot | null) => this.patch('editingSlot', slot);
    readonly setShowCreateModal = (open: boolean) => this.patch('showCreateModal', open);
    readonly setShowBatchModal = (open: boolean) => this.patch('showBatchModal', open);
    readonly setCancelBookingSlotId = (slotId: number | null) => this.patch('cancelBookingSlotId', slotId);
    readonly openCreateModal = () => this.setShowCreateModal(true);
    readonly closeCreateModal = () => this.setShowCreateModal(false);
    readonly openBatchModal = () => this.setShowBatchModal(true);
    readonly closeBatchModal = () => this.setShowBatchModal(false);
}
