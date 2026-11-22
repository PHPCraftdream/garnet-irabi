import {Carburetor} from '@react-carburetor/core';
import type {ExistingItem, ProposedSlot} from '../../types';

function timeToMinutes(t: string): number {
    const parts = t.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

/** Mirrors BatchPreviewTable's per-row isDateInPast — kept in one place so
 * the "any row past" check used to gate submission matches exactly what
 * the warning badge is based on. */
export function isDateInPast(date: string, time: string): boolean {
    const now = new Date();
    const slotDate = new Date(date + 'T' + (time || '00:00'));
    return slotDate < now;
}

interface State {
    batchSlots: ProposedSlot[];
    existingSlots: ExistingItem[];
    availableDates: Record<string, string>;
    restrictedDates: Record<string, string>;
}

export class BatchSlotsState extends Carburetor<State> {
    constructor() {
        super({batchSlots: [], existingSlots: [], availableDates: {}, restrictedDates: {}});
    }

    replacePreview(data: State): void {
        this.setData(data);
    }

    private updateSlots(batchSlots: ProposedSlot[]): void {
        this.setData({...this.getData(), batchSlots});
    }

    addSlot(date: string, time: string, duration: number): void {
        const {batchSlots, availableDates} = this.getData();
        if (batchSlots.some(slot => slot.date === date)) return;
        this.updateSlots([...batchSlots, {id: crypto.randomUUID(), date, hebrewDate: availableDates[date] || '', time, duration}]);
    }

    private updateSlot(index: number, patch: Partial<ProposedSlot>): void {
        const slots = this.getData().batchSlots;
        const slot = slots[index];
        if (!slot) return;
        const next = slots.slice();
        next[index] = {...slot, ...patch};
        this.updateSlots(next);
    }

    readonly removeSlot = (index: number) => {
        this.updateSlots(this.getData().batchSlots.filter((_, i) => i !== index));
    };

    readonly updateSlotDate = (index: number, date: string) => {
        this.updateSlot(index, {date, hebrewDate: this.getData().availableDates[date] || ''});
    };

    readonly updateSlotTime = (index: number, time: string) => this.updateSlot(index, {time});
    readonly updateSlotDuration = (index: number, duration: number) => this.updateSlot(index, {duration});
}

export function findExistingOverlap(existingSlots: readonly ExistingItem[], date: string, time: string, duration: number): boolean {
    const start = timeToMinutes(time);
    const end = start + duration;
    for (const slot of existingSlots) {
        if (slot.date !== date) continue;
        const otherStart = timeToMinutes(slot.time);
        if (start < otherStart + slot.duration_min && end > otherStart) return true;
    }
    return false;
}

export function findProposedOverlap(slots: readonly ProposedSlot[], date: string, time: string, duration: number, excludeIndex: number): boolean {
    const start = timeToMinutes(time);
    const end = start + duration;
    for (const [index, slot] of slots.entries()) {
        if (index === excludeIndex || slot.date !== date) continue;
        const otherStart = timeToMinutes(slot.time);
        if (start < otherStart + slot.duration && end > otherStart) return true;
    }
    return false;
}

function isPastSlot(slot: ProposedSlot): boolean {
    return isDateInPast(slot.date, slot.time);
}

export function anyPastDate(slots: readonly ProposedSlot[]): boolean {
    return slots.some(isPastSlot);
}
