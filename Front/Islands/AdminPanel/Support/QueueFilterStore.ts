import {Carburetor} from '@react-carburetor/core';
import type {SupportStatus} from '@/Islands/Comms/Support/parts/supportTypes';

type DateField = 'created_at' | 'updated_at';

export interface QueueFilters {
    statusFilter: SupportStatus | 'all';
    userId: string;
    assigneeId: string;
    dateField: DateField;
    dateFrom: string;
    dateTo: string;
}

export class QueueFilterStore extends Carburetor<QueueFilters> {
    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    constructor() {
        super({statusFilter: 'all', userId: '', assigneeId: '', dateField: 'updated_at', dateFrom: '', dateTo: ''});
    }

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    readonly snapshot = () => this.getData();
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    readonly subscribeSnapshot = (listener: () => void) => {
        const id = this.subscribe(listener);
        return () => this.unsubscribe(id);
    };

    // Не update: это имя занято методом базы Carburetor.
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private patch(patch: Partial<QueueFilters>): void {
        const before = this.getData();
        const next = {...before, ...patch};
        if (before.statusFilter === next.statusFilter && before.userId === next.userId &&
            before.assigneeId === next.assigneeId && before.dateField === next.dateField &&
            before.dateFrom === next.dateFrom && before.dateTo === next.dateTo) return;
        this.setData(next);
    }

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    readonly setStatusFilter = (statusFilter: QueueFilters['statusFilter']) => this.patch({statusFilter});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    readonly setUserId = (userId: string) => this.patch({userId});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    readonly setAssigneeId = (assigneeId: string) => this.patch({assigneeId});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    readonly setDateField = (dateField: DateField) => this.patch({dateField});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    readonly setDateFrom = (dateFrom: string) => this.patch({dateFrom});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    readonly setDateTo = (dateTo: string) => this.patch({dateTo});
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    readonly reset = () => this.patch({userId: '', assigneeId: '', dateFrom: '', dateTo: ''});
}
