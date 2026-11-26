import {Carburetor} from '@react-carburetor/core';
import {sendPost} from '@common/Api/Send/sendPost';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {D} from '@common/Support/Debug/D';
import {appUrl} from '@common/Utils/Url/appUrl';
import {refreshLiveCounts} from '@common/Utils/Data/liveCounts/refreshLiveCounts';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {bookErrorCode} from './bookErrorCode';
import {bookErrorMessage} from './bookingErrors';
import {canPay} from './canPay';
import {priceFor} from './priceFor';
import type {SlotItem} from '@/Islands/User/SlotsCalendar/State/view/types';
import type {SlotsCalendarBookingStore} from '@/Islands/User/SlotsCalendar/State/calendar/SlotsCalendarBookingStore';
import type {
    SlotsCalendarBookingActions,
} from '@/Islands/User/SlotsCalendar/State/calendar/SlotsCalendarBookingActions';

/** Контекст брони, который сервер отдаёт для слота (/slots/~bookData). */
export interface SlotBookingData {
    slot: SlotItem;
    expert: { account_id: number; display_name: string };
    balance: number;
    csrf: string;
    bookUrl: string;
}

interface SlotBookingState {
    bookData: SlotBookingData | null;
    loading: boolean;
    sending: boolean;
    error: string;
}

/** Что нужно, чтобы отправить бронь: выбор человека и контекст экрана. */
export interface SubmitBookingOptions {
    selected: readonly number[];
    allSlots: readonly SlotItem[];
    balance: number;
    csrf: string;
    bookUrl: string;
    onBooked: (bookedIds: number[]) => void;
    onClose: () => void;
    /** Нехватка средств: подсветить баланс вместо отправки. */
    onShake: () => void;
}


/** Собирает токены выбранных слотов для запроса. */
function uidsFor(
    ids: readonly number[],
    slots: readonly SlotItem[],
): Record<string, string> {
    const uids: Record<string, string> = {};
    for (const id of ids) {
        const uid = slots.find((slot) => slot.id === id)?.uid;
        if (uid) uids[String(id)] = uid;
    }
    return uids;
}

interface Options {
    booking?: SlotsCalendarBookingStore;
    actions?: SlotsCalendarBookingActions;
}

/**
  * Единственная точка сценария «забронировать слот»: загрузка контекста брони
  * с `/slots/~bookData`, отправка брони и модалка, которая на нём рисуется.
  *
  * Сам сценарий живёт здесь, а не в хуке и не в модалке: тот же поток нужен
  * календарю, где модалку открывает общий стор (`SlotsCalendarBookingStore`), и
  * островам, которые показывают карточку слота вдали от календаря (лента
  * новостей, рекомендованные слоты, профиль преподавателя).
  */
export class SlotBookingController extends Carburetor<SlotBookingState> {
    private readonly booking?: SlotsCalendarBookingStore;
    private readonly actions?: SlotsCalendarBookingActions;
    /** Номер показа модалки: ответ отправки после закрытия или нового открытия не трогает состояние нового показа. */
    private session = 0;

    /** Создаёт состояние компонента. */
    constructor(options: Options = {}) {
        super({ bookData: null, loading: false, sending: false, error: '' });
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

    /** Обновляет состояние контроллера. */
    private patch(changes: Partial<SlotBookingState>): void {
        this.setData({ ...this.getData(), ...changes });
    }

    /** Загружает контекст и открывает бронирование слота. */
    readonly openBooking = async (slotId: number): Promise<void> => {
        if (this.getData().loading) return;
        if (!(slotId > 0)) {
            showToast(t.News_SlotUnavailable(), 'warning');
            return;
        }
        this.session++;
        this.patch({ loading: true, sending: false, error: '' });
        try {
            const res = await sendPost<
                { slot_id: number },
                SlotBookingData & { error?: string }
            >(appUrl('/slots/~bookData'), { slot_id: slotId });
            const data = (
                'data' in res && res.data ? res.data : res
            ) as SlotBookingData & { error?: string };
            if (data.error) {
                showToast(bookErrorMessage(data.error), 'warning');
                return;
            }
            this.patch({ bookData: data });
        } catch (e: any) {
            // The booking can't proceed (slot taken, in the past, not bookable,
            // …). NEVER navigate the user away — just explain why with a toast
            // and leave them where they are.
            const code = bookErrorCode(e);
            showToast(bookErrorMessage(code), 'warning');
        } finally {
            this.patch({ loading: false });
        }
    };

    /** Закрывает модалку бронирования. */
    readonly closeModal = () => {
        this.session++;
        if (this.getData().bookData) this.patch({ bookData: null, error: '' });
    };

    /**
      * Отправка брони: цена, проверка баланса, POST и разбор ответа.
      *
      * Порядок прежний и важен: пустой выбор — молча выходим; не хватает денег —
      * подсвечиваем баланс и не идём в сеть (кнопка специально остаётся
      * доступной); двойной клик отсекает `sending`; `stale` показывает
      * «перезаписали», ответ с `error` — свою причину, исключение — код сервера.
      */
    readonly submitBooking = async ({
        selected,
        allSlots,
        balance,
        csrf,
        bookUrl,
        onBooked,
        onClose,
        onShake,
    }: SubmitBookingOptions): Promise<void> => {
        if (!selected.length) return;
        const total = priceFor(selected, allSlots);
        if (!canPay(balance, total)) {
            onShake();
            return;
        }
        if (this.getData().sending) return;
        const session = this.session;
        const current = () => session === this.session;
        this.patch({ sending: true, error: '' });
        try {
            D('booking.submit', { slotIds: [...selected], total });
            const result = (await sendPost(bookUrl, {
                slot_ids: [...selected],
                slot_uids: uidsFor(selected, allSlots),
                CSRF_TOKEN: csrf,
            })) as any;
            if (result?.stale) {
                if (current()) this.patch({ error: t.Slot_Rescheduled() });
            } else if (result?.error) {
                if (current()) this.patch({ error: result.error });
            } else {
                D('booking.success', { count: selected.length });
                onBooked([...selected]);
                if (current()) onClose();
            }
        } catch (e: any) {
            const code = bookErrorCode(e);
            if (current())
                this.patch({
                    error: code
                        ? bookErrorMessage(code)
                        : e?.message || t.General_Error(),
                });
        } finally {
            if (current()) this.patch({ sending: false });
        }
    };

    /** Обновляет данные календаря. */
    readonly handleModalBooked = (
        bookedIds: number[],
        onBooked?: (ids: number[]) => void,
    ): void => {
        this.patch({ bookData: null });
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

    /** Открывает бронирование выбранного слота. */
    readonly showBooking = (slot: SlotItem) => {
        this.session++;
        if (this.getData().error || this.getData().sending)
            this.patch({ error: '', sending: false });
        this.booking?.showBooking(slot);
    };
    /** Открывает подробности выбранного слота. */
    readonly showDetail = (slot: SlotItem) => this.booking?.showDetail(slot);
    /** Закрывает бронирование. */
    readonly closeBooking = () => {
        this.session++;
        this.booking?.closeBooking();
    };
    /** Закрывает подробности слота. */
    readonly closeDetail = () => this.booking?.closeDetail();
    /** Обрабатывает успешное бронирование. */
    readonly handleBooked = (bookedIds: number[]) =>
        this.actions?.handleBooked(bookedIds);
    /** Обрабатывает отмену бронирования. */
    readonly handleCancelled = (slotId: number) =>
        this.actions?.handleCancelled(slotId);
}
