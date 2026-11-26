import {Carburetor} from '@react-carburetor/core';
import type {ExistingItem, ProposedSlot} from '@/Islands/Expert/ExpertSlots/types';

interface State {
    batchSlots: ProposedSlot[];
    existingSlots: ExistingItem[];
    availableDates: Record<string, string>;
    restrictedDates: Record<string, string>;
}

/** Хранить и изменять состояние пакетно создаваемых занятий. */
export class BatchSlotsState extends Carburetor<State> {
    /** Создать пустое состояние пакета занятий. */
    constructor() {
        super({batchSlots: [], existingSlots: [], availableDates: {}, restrictedDates: {}});
    }

    /** Заменить пакет данными предварительного расчёта. */
    replacePreview(data: State): void {
        this.setData(data);
    }

    /** Сохранить обновлённый список пакетных занятий. */
    private updateSlots(batchSlots: ProposedSlot[]): void {
        this.setData({...this.getData(), batchSlots});
    }

    /** Добавить занятие, если для даты ещё нет записи. */
    addSlot(date: string, time: string, duration: number): void {
        const {batchSlots, availableDates} = this.getData();
        if (batchSlots.some(slot => slot.date === date)) return;
        this.updateSlots([...batchSlots, {id: crypto.randomUUID(), date, hebrewDate: availableDates[date] || '',
        time, duration}]);
    }

    /** Обновить свойства занятия по его индексу. */
    private updateSlot(index: number, patch: Partial<ProposedSlot>): void {
        const slots = this.getData().batchSlots;
        const slot = slots[index];
        if (!slot) return;
        const next = slots.slice();
        next[index] = {...slot, ...patch};
        this.updateSlots(next);
    }

    /** Удалить пакетное занятие по индексу. */
    readonly removeSlot = (index: number) => {
        this.updateSlots(this.getData().batchSlots.filter((_, i) => i !== index));
    };

    /** Изменить дату занятия и связанную еврейскую дату. */
    readonly updateSlotDate = (index: number, date: string) => {
        this.updateSlot(index, {date, hebrewDate: this.getData().availableDates[date] || ''});
    };

    /** Изменить время занятия. */
    readonly updateSlotTime = (index: number, time: string) => this.updateSlot(index, {time});

    /** Изменить длительность занятия. */
    readonly updateSlotDuration = (index: number, duration: number) => this.updateSlot(index, {duration});
}
