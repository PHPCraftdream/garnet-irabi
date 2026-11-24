import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import SendButton from '@common/Components/Controls/SendButton';
import {Portal} from '@common/Components/Layout/Portal';
import {appUrl} from '@common/Utils/Url/appUrl';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {BookingSlotSummary} from './BookingSlotSummary';
import {ExtraSlotPicker} from '../Slot/ExtraSlotPicker';
import type {SlotItem, ExpertMap} from '../State/types';
import {sortByStart} from '../State/slotsCalendarSelectors';
import {priceFor, canPay, type SlotBookingController} from './SlotBookingController';

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

function stopClick(event: React.MouseEvent<HTMLDivElement>): void {
    event.stopPropagation();
}

function getOtherSlots({allSlots, slot, bookedIds}: Props): SlotItem[] {
    const available = allSlots.filter(other => other.expert_id === slot.expert_id && other.id !== slot.id && !bookedIds.has(other.id) && other.status === 'free');
    return sortByStart(available).slice(0, 10);
}

export default class BookingModal extends AntiHookComponent<Props> {
    private readonly store = new Carburetor<State>({selected: [this.props.slot.id], shaking: false});
    private shakeTimer?: number;
    private shakeFrame?: number;

    protected useEffects(): void {
        this.useEffect('bodyScrollLock', () => {
            const previous = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = previous;
            };
        }, []);
    }

    componentWillUnmount(): void {
        window.clearTimeout(this.shakeTimer);
        if (this.shakeFrame !== undefined) cancelAnimationFrame(this.shakeFrame);
        super.componentWillUnmount();
    }

    private readonly stopShake = () => this.update({shaking: false});

    private readonly startShake = () => {
        this.update({shaking: true});
        this.shakeTimer = window.setTimeout(this.stopShake, 500);
    };

    private readonly shakeBalance = () => {
        window.clearTimeout(this.shakeTimer);
        if (this.shakeFrame !== undefined) cancelAnimationFrame(this.shakeFrame);
        this.update({shaking: false});
        this.shakeFrame = requestAnimationFrame(this.startShake);
    };
    private readonly selection = this.connectSelection(this.store, state => state.selected);
    private selectionCache?: {ids: readonly number[]; value: Set<number>};
    private otherCache?: {slot: SlotItem; allSlots: readonly SlotItem[]; bookedIds: Set<number>; value: SlotItem[]};

    private update(patch: Partial<State>): void {
        this.store.setData({...this.store.getData(), ...patch});
    }

    private getSelection(ids: readonly number[]): Set<number> {
        const cache = this.selectionCache;
        if (cache?.ids === ids) return cache.value;
        const value = new Set(ids);
        this.selectionCache = {ids, value};
        return value;
    }

    private otherSlots(): SlotItem[] {
        const {slot, allSlots, bookedIds} = this.props;
        const cache = this.otherCache;
        if (cache?.slot === slot && cache.allSlots === allSlots && cache.bookedIds === bookedIds) return cache.value;
        const value = getOtherSlots(this.props);
        this.otherCache = {slot, allSlots, bookedIds, value};
        return value;
    }

    private readonly toggle = (id: number) => {
        const {selected} = this.store.getData();
        this.update({selected: selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id]});
    };

    private readonly book = () => {
        const {selected} = this.store.getData();
        if (!selected.length) return;
        const {allSlots, balance, csrf, bookUrl, onBooked, onClose, controller} = this.props;
        void controller.submitBooking({selected, allSlots, balance, csrf, bookUrl, onBooked, onClose, onShake: this.shakeBalance});
    };

    private renderHeader() {
        return (
            <div className="booking-dialog-header">
                <h3 className="booking-dialog-title">{t.Slot_BookSlot()}</h3>
                <button type="button" className="booking-dialog-close" title={t.Action_Close()} aria-label={t.Action_Close()} onClick={this.props.onClose}>&times;</button>
            </div>
        );
    }

    private renderTotal(total: number, count: number, shaking: boolean) {
        const {balance} = this.props;
        return (
            <>
                <div className="booking-dialog-total">
                    <span className="booking-dialog-total-label">
                        {t.Booking_Total()}: <strong className="booking-dialog-amount">{total} &#8381;</strong>
                        <span className="booking-dialog-count">({count} {t.Booking_Items()})</span>
                    </span>
                    <span className="booking-summary-balance">{t.Booking_Balance()}: {balance} &#8381;</span>
                </div>
                {!canPay(balance, total) && (
                    <div className={shaking ? 'booking-dialog-error-shake' : 'booking-dialog-error-funds'} data-booking-error={shaking ? 'shake' : 'funds'} data-test-id="booking-insufficient">
                        {t.Booking_InsufficientBalance()}{' '}
                        <a href={appUrl('/balance')} className="booking-place-link">(&#8593; {t.Balance_TopUp()})</a>
                    </div>
                )}
            </>
        );
    }

    private renderActions(total: number, count: number, sending: boolean) {
        return (
            <div className="booking-dialog-actions">
                <SendButton onClick={this.book} disabled={count === 0} sending={sending}
                    label={`${t.Slot_Book()} (${total} ₽)`} testId="booking-confirm-btn" />
                <button type="button" className="booking-cancel-dismiss-regular" data-booking-action="regular" onClick={this.props.onClose}>
                    {t.Action_Cancel()}
                </button>
            </div>
        );
    }

    render() {
        const {slot, allSlots, experts, onClose} = this.props;
        const {sending, error} = this.useCarburetor(this.props.controller);
        const {shaking} = this.useCarburetor(this.store);
        const ids = this.selection();
        const total = priceFor(ids, allSlots);
        return (
            <Portal>
                <div className="fg-modal-overlay-high" onClick={onClose}>
                    <div role="dialog" aria-modal="true" aria-label={t.Slot_BookSlot()} className="booking-dialog" onClick={stopClick} data-test-id="booking-modal">
                        {this.renderHeader()}
                        <BookingSlotSummary slot={slot} expert={experts[slot.expert_id]} />
                        <ExtraSlotPicker slots={this.otherSlots()} selected={this.getSelection(ids)} onToggle={this.toggle} />
                        {this.renderTotal(total, ids.length, shaking)}
                        {error && <div className="booking-dialog-error" data-test-id="booking-error">{error}</div>}
                        {this.renderActions(total, ids.length, sending)}
                    </div>
                </div>
            </Portal>
        );
    }
}
