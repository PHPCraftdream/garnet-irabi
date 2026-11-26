import {sendPost} from '@common/Api/Send/sendPost';
import {appUrl} from '@common/Utils/Url/appUrl';
import {refreshLiveCounts} from '@common/Utils/Data/liveCounts/refreshLiveCounts';
import type {SlotsCalendarBookingStore} from './SlotsCalendarBookingStore';
import type {SlotItem} from '@/Islands/User/SlotsCalendar/State/view/types';

export class SlotsCalendarBookingActions {
    /** Создаёт состояние компонента. */
    constructor(private readonly booking: SlotsCalendarBookingStore) {}

    /**
     * Перечитать одно занятие после действия над ним (D-198).
     *
     * Сервер, а не арифметика на клиенте: пока мы бронировали, место мог
     * занять кто-то ещё, и прибавленная руками единица показала бы неправду
     * увереннее, чем устаревшее число. Молчаливый отказ здесь — это ровно то
     * поведение, что было до правки (значение останется прежним до
     * перезагрузки), поэтому ошибку не показываем: она сама по себе ничего
     * человеку не даёт, а действие его уже состоялось.
     */
    private async refreshSlot(slotId: number): Promise<void> {
        try {
            const res = await sendPost<{slot_id: number}, {slot?: SlotItem; error?: string}>(
                appUrl('/slots/~slotCard'), {slot_id: slotId}
            );
            const data = ('data' in res && res.data ? res.data : res) as {slot?: SlotItem; error?: string};
            if (!data.slot) return;

            this.booking.refresh(slotId, data.slot);
        } catch {
            // см. комментарий выше
        }
    }

    /** Обрабатывает успешное бронирование. */
    readonly handleBooked = (justBookedIds: number[]) => {
        // Модалка может отправить не только основной слот, но
        // и «ещё слоты» этого же преподавателя, выбранные тут
        // же (ExtraSlotPicker) — раньше статус/занятость
        // обновляли только у bookingSlot.id, и дополнительные
        // выборы застревали в прежнем виде до перезагрузки.
        // Оптимистично занимаем места, затем сверяем с сервером.
        this.booking.markBooked(justBookedIds);
        // The cost has just left the account; the header still
        // shows what it held when the page loaded.
        refreshLiveCounts();
        // Занятость слота изменило то же самое действие — и
        // до этой правки она единственная оставалась прежней
        // до перезагрузки (D-198).
        for (const id of justBookedIds) void this.refreshSlot(id);
    };
    /** Обрабатывает отмену бронирования. */
    readonly handleCancelled = (slotId: number) => {
        this.booking.markCancelled(slotId);
        // Отмена освободила место — и деньги вернулись.
        // Обе половины результата обновляются вместе.
        refreshLiveCounts();
        void this.refreshSlot(slotId);
    };
}
