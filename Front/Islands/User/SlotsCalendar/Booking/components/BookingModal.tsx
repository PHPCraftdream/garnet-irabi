import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import SendButton from '@common/Components/Controls/SendButton';
import {Portal} from '@common/Components/Layout/Portal';
import {appUrl} from '@common/Utils/Url/appUrl';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {BookingSlotSummary} from './BookingSlotSummary';
import {ExtraSlotPicker} from '@/Islands/User/SlotsCalendar/Slot/ExtraSlotPicker';
import type {SlotItem, ExpertMap} from '@/Islands/User/SlotsCalendar/State/view/types';
import {sortByStart} from '@/Islands/User/SlotsCalendar/State/calendar/sortByStart';
import {priceFor} from '@/Islands/User/SlotsCalendar/Booking/logic/priceFor';
import {canPay} from '@/Islands/User/SlotsCalendar/Booking/logic/canPay';
import type {SlotBookingController} from '@/Islands/User/SlotsCalendar/Booking/logic/SlotBookingController';

interface Props {
    slot: SlotItem;
    allSlots: readonly SlotItem[];
    experts: ExpertMap;
    bookedIds: Set<number>;
    balance: number;
    bookUrl: string;
    csrf: string;
    onClose: () => void;
    onBooked: (bookedIds: number[]) => void;
    controller: SlotBookingController;
}

interface State {
    selected: number[];
    shaking: boolean;
}

/** Останавливает всплытие события клика. */
function stopClick(event: React.MouseEvent<HTMLDivElement>): void {
    event.stopPropagation();
}

/** Выбирает доступные дополнительные слоты эксперта. */
function getOtherSlots({ allSlots, slot, bookedIds }: Props): SlotItem[] {
    const available = allSlots.filter(
        (other) =>
            other.expert_id === slot.expert_id &&
            other.id !== slot.id &&
            !bookedIds.has(other.id) &&
            other.status === 'free',
    );
    return sortByStart(available).slice(0, 10);
}

/** Renders the booking error message in the modal. */
function renderError(error: string) {
    return (
        <div className="booking-dialog-error" data-test-id="booking-error">
            {error}
        </div>
    );
}

export default class BookingModal extends AntiHookComponent<Props> {
    private readonly store = new Carburetor<State>({
        selected: [this.props.slot.id],
        shaking: false,
    });
    private shakeTimer?: number;
    private shakeFrame?: number;

    /** Настраивает побочные эффекты компонента. */
    protected useEffects(): void {
        this.useEffect(
            'bodyScrollLock',
            () => {
                const previous = document.body.style.overflow;
                document.body.style.overflow = 'hidden';
                return () => {
                    document.body.style.overflow = previous;
                };
            },
            [],
        );
    }

    /** Освобождает ресурсы при размонтировании. */
    componentWillUnmount(): void {
        window.clearTimeout(this.shakeTimer);
        if (this.shakeFrame !== undefined) cancelAnimationFrame(this.shakeFrame);
        super.componentWillUnmount();
    }

    /** Обновляет данные календаря. */
    private readonly stopShake = () => this.update({ shaking: false });

    /** Обновляет данные календаря. */
    private readonly startShake = () => {
        this.update({ shaking: true });
        this.shakeTimer = window.setTimeout(this.stopShake, 500);
    };

    /** Обновляет данные календаря. */
    private readonly shakeBalance = () => {
        window.clearTimeout(this.shakeTimer);
        if (this.shakeFrame !== undefined) cancelAnimationFrame(this.shakeFrame);
        this.update({ shaking: false });
        this.shakeFrame = requestAnimationFrame(this.startShake);
    };
    private readonly selection = this.connectSelection(
        this.store,
        (state) => state.selected,
    );
    private selectionCache?: { ids: readonly number[]; value: Set<number> };
    private otherCache?: {
        slot: SlotItem;
        allSlots: readonly SlotItem[];
        bookedIds: Set<number>;
        value: SlotItem[];
    };

    /** Обновляет состояние компонента. */
    private update(patch: Partial<State>): void {
        this.store.setData({ ...this.store.getData(), ...patch });
    }

    /** Создаёт или возвращает кэшированный набор выбранных идентификаторов. */
    private getSelection(ids: readonly number[]): Set<number> {
        const cache = this.selectionCache;
        if (cache?.ids === ids) return cache.value;
        const value = new Set(ids);
        this.selectionCache = { ids, value };
        return value;
    }

    /** Возвращает доступные слоты того же эксперта. */
    private otherSlots(): SlotItem[] {
        const { slot, allSlots, bookedIds } = this.props;
        const cache = this.otherCache;
        if (
            cache?.slot === slot &&
            cache.allSlots === allSlots &&
            cache.bookedIds === bookedIds
        )
            return cache.value;
        const value = getOtherSlots(this.props);
        this.otherCache = { slot, allSlots, bookedIds, value };
        return value;
    }

    /** Переключает выбранное значение. */
    private readonly toggle = (id: number) => {
        const { selected } = this.store.getData();
        this.update({
            selected: selected.includes(id)
                ? selected.filter((value) => value !== id)
                : [...selected, id],
        });
    };

    /** Обновляет данные календаря. */
    private readonly book = () => {
        const { selected } = this.store.getData();
        if (!selected.length) return;
        const { allSlots, balance, csrf, bookUrl, onBooked, onClose, controller } =
            this.props;
        void controller.submitBooking({
            selected,
            allSlots,
            balance,
            csrf,
            bookUrl,
            onBooked,
            onClose,
            onShake: this.shakeBalance,
        });
    };

    /** Формирует разметку компонента. */
    private renderHeader() {
        return (
            <div className="booking-dialog-header">
                <h3 className="booking-dialog-title">{t.Slot_BookSlot()}</h3>
                <button
                    type="button"
                    className="booking-dialog-close"
                    title={t.Action_Close()}
                    aria-label={t.Action_Close()}
                    onClick={this.props.onClose}
                >
                    &times;
                </button>
            </div>
        );
    }

    /** Формирует разметку компонента. */
    private renderTotal(total: number, count: number, shaking: boolean) {
        const { balance } = this.props;
        return (
            <>
                <div className="booking-dialog-total">
                    <span className="booking-dialog-total-label">
                        {t.Booking_Total()}:{' '}
                        <strong className="booking-dialog-amount">{total} &#8381;</strong>
                        <span className="booking-dialog-count">
                            ({count} {t.Booking_Items()})
                        </span>
                    </span>
                    <span className="booking-summary-balance">
                        {t.Booking_Balance()}: {balance} &#8381;
                    </span>
                </div>
                {!canPay(balance, total) && (
                    <div
                        className={
                            shaking
                                ? 'booking-dialog-error-shake'
                                : 'booking-dialog-error-funds'
                        }
                        data-booking-error={shaking ? 'shake' : 'funds'}
                        data-test-id="booking-insufficient"
                    >
                        {t.Booking_InsufficientBalance()}{' '}
                        <a href={appUrl('/balance')} className="booking-place-link">
                            (&#8593; {t.Balance_TopUp()})
                        </a>
                    </div>
                )}
            </>
        );
    }

    /** Формирует разметку компонента. */
    private renderActions(total: number, count: number, sending: boolean) {
        return (
            <div className="booking-dialog-actions">
                <SendButton
                    onClick={this.book}
                    disabled={count === 0}
                    sending={sending}
                    label={`${t.Slot_Book()} (${total} ₽)`}
                    testId="booking-confirm-btn"
                />
                <button
                    type="button"
                    className="booking-cancel-dismiss-regular"
                    data-booking-action="regular"
                    onClick={this.props.onClose}
                >
                    {t.Action_Cancel()}
                </button>
            </div>
        );
    }

    /** Отрисовывает содержимое компонента. */
    render() {
        const { slot, allSlots, experts, onClose } = this.props;
        const { sending, error } = this.useCarburetor(this.props.controller);
        const { shaking } = this.useCarburetor(this.store);
        const ids = this.selection();
        const total = priceFor(ids, allSlots);
        return (
            <Portal>
                <div className="fg-modal-overlay-high" onClick={onClose}>
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label={t.Slot_BookSlot()}
                        className="booking-dialog"
                        onClick={stopClick}
                        data-test-id="booking-modal"
                    >
                        {this.renderHeader()}
                        <BookingSlotSummary slot={slot} expert={experts[slot.expert_id]} />
                        <ExtraSlotPicker
                            slots={this.otherSlots()}
                            selected={this.getSelection(ids)}
                            onToggle={this.toggle}
                        />
                        {this.renderTotal(total, ids.length, shaking)}
                        {error && renderError(error)}
                        {this.renderActions(total, ids.length, sending)}
                    </div>
                </div>
            </Portal>
        );
    }
}
