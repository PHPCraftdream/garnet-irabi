import {Carburetor} from '@react-carburetor/core';
import type {BookingsState, BookingsPageResponse} from './bookingsTabStateTypes';
import type {BookingsViewAs, StatusFilter} from '../card/bookingCardTypes';
export class BookingsStateStore extends Carburetor<BookingsState> {
    /** Применяет данные загруженной страницы и прекращает индикатор загрузки. */
    applyPage(data: BookingsPageResponse): void {
        const before = this.getData();
        this.replace(before, {...before, bookings: data.items, page: data.page, totalPages: data.totalPages,
            total: data.total, slots: data.slots || {}, experts: data.experts || {}, users: data.users || {},
            counts: data.counts || before.counts, pageLoading: false});
    }

    /** Меняет флаг загрузки страницы. */
    readonly setPageLoading = (value: boolean) => this.set('pageLoading', value);
    /** Меняет режим просмотра списка. */
    readonly setViewAs = (value: BookingsViewAs) => this.set('viewAs', value);
    /** Устанавливает активный фильтр статуса. */
    readonly setStatusFilter = (value: StatusFilter) => this.set('statusFilter', value);
    /** Включает или скрывает прошедшие занятия. */
    readonly setShowPast = (value: boolean) => this.set('showPast', value);
    /** Выбирает бронь для окна отмены или очищает выбор. */
    readonly setCancelBookingId = (value: number | null) => this.set('cancelBookingId', value);
    /** Выбирает бронь для окна отказа или очищает выбор. */
    readonly setRejectBookingId = (value: number | null) => this.set('rejectBookingId', value);
    /** Выбирает бронь для переноса или очищает выбор. */
    readonly setRescheduleBookingId = (value: number | null) => this.set('rescheduleBookingId', value);
    /** Задаёт либо очищает ошибку переноса. */
    readonly setRescheduleError = (value: string | undefined) => this.set('rescheduleError', value);
    /** Записывает идентификатор брони, которую подтверждают. */
    readonly setConfirmingId = (value: number | null) => this.set('confirmingId', value);
    /** Закрывает окно отмены. */
    readonly closeCancel = () => this.setCancelBookingId(null);
    /** Закрывает окно отказа. */
    readonly closeReject = () => this.setRejectBookingId(null);
    /** Закрывает окно переноса и очищает ошибку. */
    readonly closeReschedule = () => {
        this.setRescheduleBookingId(null);
        this.setRescheduleError(undefined);
    };

    /** Обновляет одно поле состояния и уведомляет подписчиков при изменении. */
    readonly set = <K extends keyof BookingsState>(key: K, value: BookingsState[K]) => {
        const before = this.getData();
        if (Object.is(before[key], value)) return;
        this.replace(before, {...before, [key]: value});
    };

    /** Записывает состояние и инициирует обновление, если оно не было объявлено само. */
    private replace(before: BookingsState, next: BookingsState): void {
        const version = this.getVersion();
        this.setData(next);
        if (this.getData() !== before && this.getVersion() === version) {
            this.markAllChanged();
            this.emitUpdate();
        }
    }
}

