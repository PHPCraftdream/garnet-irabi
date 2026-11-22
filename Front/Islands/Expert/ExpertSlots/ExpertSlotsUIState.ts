import {Carburetor} from '@react-carburetor/core';
import type {Slot} from './types';

interface State {
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

    readonly snapshot = () => this.getData();
    readonly subscribeSnapshot = (listener: () => void) => {
        const id = this.subscribe(listener);
        return () => this.unsubscribe(id);
    };

    private update<K extends keyof State>(key: K, value: State[K]): void {
        const current = this.getData();
        if (Object.is(current[key], value)) return;
        const version = this.getVersion();
        this.setData({...current, [key]: value});
        // React отслеживает ссылку на снимок, даже если данные структурно равны.
        if (this.getVersion() === version) {
            this.markAllChanged();
            this.emitUpdate();
        }
    }

    appendSlots(slots: Slot[]): void {
        this.update('slots', [...this.getData().slots, ...slots]);
    }

    removeSlot(id: number): void {
        this.update('slots', this.getData().slots.filter(slot => slot.id !== id));
    }

    cancelSlot(id: number | null): void {
        this.changeSlot(id, {status: 'cancelled'});
    }

    confirmBooking(id: number): void {
        this.changeSlot(id, {booking_status: 'confirmed'});
    }

    private changeSlot(id: number | null, patch: Partial<Slot>): void {
        const slots = this.getData().slots;
        const index = slots.findIndex(slot => slot.id === id);
        if (index < 0) return;
        const next = slots.slice();
        next[index] = {...slots[index], ...patch};
        this.update('slots', next);
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
        this.update('slots', next);
    }
    readonly setEditingSlot = (slot: Slot | null) => this.update('editingSlot', slot);
    readonly setShowCreateModal = (open: boolean) => this.update('showCreateModal', open);
    readonly setShowBatchModal = (open: boolean) => this.update('showBatchModal', open);
    readonly setCancelBookingSlotId = (slotId: number | null) => this.update('cancelBookingSlotId', slotId);
    readonly openCreateModal = () => this.setShowCreateModal(true);
    readonly closeCreateModal = () => this.setShowCreateModal(false);
    readonly openBatchModal = () => this.setShowBatchModal(true);
    readonly closeBatchModal = () => this.setShowBatchModal(false);
}
