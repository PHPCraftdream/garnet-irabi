import {Carburetor} from '@react-carburetor/core';
import {sendPost} from '@common/Api/Send/sendPost';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {appUrl} from '@common/Utils/Url/appUrl';
import {refreshLiveCounts} from '@common/Utils/Data/liveCounts';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {bookErrorCode, bookErrorMessage} from './bookingErrors';
import type {SlotItem} from '../types';
import type {SlotsCalendarBookingStore} from '../SlotsCalendarBookingStore';
import type {SlotsCalendarBookingActions} from '../SlotsCalendarBookingActions';

/** Контекст брони, который сервер отдаёт для слота (/slots/~bookData). */
export interface SlotBookingData {
    slot: SlotItem;
    expert: {account_id: number; display_name: string};
    balance: number;
    csrf: string;
    bookUrl: string;
}

interface SlotBookingState {
    bookData: SlotBookingData | null;
    loading: boolean;
}

interface Options {
    booking?: SlotsCalendarBookingStore;
    actions?: SlotsCalendarBookingActions;
}

/**
 * Единственная точка сценария «забронировать слот»: загрузка контекста брони
 * с `/slots/~bookData` и модалка, которая на нём рисуется.
 *
 * Сам сценарий живёт здесь, а не в хуке: тот же поток нужен календарю, где
 * модалку открывает общий стор (`SlotsCalendarBookingStore`), и островам,
 * которые показывают карточку слота вдали от календаря (лента новостей,
 * рекомендованные слоты, профиль преподавателя).
 */
export class SlotBookingController extends Carburetor<SlotBookingState> {
    private readonly booking?: SlotsCalendarBookingStore;
    private readonly actions?: SlotsCalendarBookingActions;

    constructor(options: Options = {}) {
        super({bookData: null, loading: false});
        this.booking = options.booking;
        this.actions = options.actions;
    }

    /** Снимок состояния для React-адаптера (`useSyncExternalStore`). */
    readonly getSnapshot = () => this.getData();

    /** Подписка для React-адаптера (`useSyncExternalStore`); состояние не дублирует. */
    readonly subscribeState = (listener: () => void) => {
        const id = this.subscribe(listener);
        return () => this.unsubscribe(id);
    };

    private patch(changes: Partial<SlotBookingState>): void {
        this.setData({...this.getData(), ...changes});
    }

    readonly openBooking = async (slotId: number): Promise<void> => {
        if (this.getData().loading) return;
        if (!(slotId > 0)) {
            showToast(t.News_SlotUnavailable(), 'warning');
            return;
        }
        this.patch({loading: true});
        try {
            const res = await sendPost<{slot_id: number}, SlotBookingData & {error?: string}>(
                appUrl('/slots/~bookData'), {slot_id: slotId}
            );
            const data = ('data' in res && res.data ? res.data : res) as SlotBookingData & {error?: string};
            if (data.error) {
                showToast(bookErrorMessage(data.error), 'warning');
                return;
            }
            this.patch({bookData: data});
        } catch (e: any) {
            // The booking can't proceed (slot taken, in the past, not bookable,
            // …). NEVER navigate the user away — just explain why with a toast
            // and leave them where they are.
            const code = bookErrorCode(e);
            showToast(bookErrorMessage(code), 'warning');
        } finally {
            this.patch({loading: false});
        }
    };

    readonly closeModal = () => {
        if (this.getData().bookData) this.patch({bookData: null});
    };

    readonly handleModalBooked = (bookedIds: number[], onBooked?: (ids: number[]) => void): void => {
        this.patch({bookData: null});
        // Бронирование двигает деньги, а баланс висит в шапке на
        // каждой странице. Раньше его обновляли только те экраны,
        // которые сами про это помнили: забронировав с карточки
        // преподавателя, человек видел прежнюю сумму в шапке и
        // правильную на странице баланса — два вида одного числа
        // расходились (нашла user-6). Обновление стоит здесь, в общем
        // крючке, а не в каждом вызывающем экране: следующий экран,
        // который научится бронировать, получит его даром.
        refreshLiveCounts();
        onBooked?.(bookedIds);
    };

    readonly showBooking = (slot: SlotItem) => this.booking?.showBooking(slot);
    readonly showDetail = (slot: SlotItem) => this.booking?.showDetail(slot);
    readonly closeBooking = () => this.booking?.closeBooking();
    readonly closeDetail = () => this.booking?.closeDetail();
    readonly handleBooked = (bookedIds: number[]) => this.actions?.handleBooked(bookedIds);
    readonly handleCancelled = (slotId: number) => this.actions?.handleCancelled(slotId);
}
