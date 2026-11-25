import * as React from 'react';
import {Carburetor} from '@react-carburetor/core';
import {tsToInputDate} from '@common/Utils/Time/DateUtils';
import {Slot} from '../../types';

interface DragState {
    dragOverDay: string | null;
    draggingSlotId: number | null;
}

interface DragProps {
    slots: Slot[];
    onSlotDrop?: (slotId: number, newDateStr: string) => void;
}

export class CalendarDragController {
    public readonly state = new Carburetor<DragState>({dragOverDay: null, draggingSlotId: null});
    private readonly counters = new Map<string, number>();

    /** Подготовить данные для соответствующего интерфейса. */
    public constructor(private readonly getProps: () => DragProps) {}

    /** Обработать соответствующее действие пользователя. */
    public readonly handleDragStart = (e: React.DragEvent<HTMLDivElement>, slot: Slot) => {
        e.dataTransfer.setData('text/plain', String(slot.id));
        e.dataTransfer.effectAllowed = 'move';
        this.state.setData({...this.state.getData(), draggingSlotId: slot.id});
    };

    /** Обработать соответствующее действие пользователя. */
    public readonly handleDragEnd = () => {
        this.state.setData({dragOverDay: null, draggingSlotId: null});
        this.counters.clear();
    };

    /** Обработать соответствующее действие пользователя. */
    public readonly handleDragEnter = (e: React.DragEvent<HTMLDivElement>, dayIso: string) => {
        e.preventDefault();
        const counter = (this.counters.get(dayIso) || 0) + 1;
        this.counters.set(dayIso, counter);
        if (counter === 1) this.state.setData({...this.state.getData(), dragOverDay: dayIso});
    };

    /** Обработать соответствующее действие пользователя. */
    public readonly handleDragLeave = (e: React.DragEvent<HTMLDivElement>, dayIso: string) => {
        e.preventDefault();
        const counter = (this.counters.get(dayIso) || 0) - 1;
        this.counters.set(dayIso, Math.max(0, counter));
        if (counter <= 0) {
            this.counters.delete(dayIso);
            const state = this.state.getData();
            if (state.dragOverDay === dayIso) this.state.setData({...state, dragOverDay: null});
        }
    };

    /** Обработать соответствующее действие пользователя. */
    public readonly handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    /** Обработать соответствующее действие пользователя. */
    public readonly handleDrop = (e: React.DragEvent<HTMLDivElement>, dayIso: string) => {
        e.preventDefault();
        this.state.setData({dragOverDay: null, draggingSlotId: null});
        this.counters.clear();

        const slotId = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (isNaN(slotId)) return;
        const {slots, onSlotDrop} = this.getProps();
        const slot = slots.find(s => s.id === slotId);
        if (!slot) return;
        if (tsToInputDate(slot.start_at) === dayIso) return;
        onSlotDrop?.(slotId, dayIso);
    };
}
