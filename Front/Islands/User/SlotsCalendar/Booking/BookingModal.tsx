import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {sendPost} from '@common/Api/Send/sendPost';
import {D} from '@common/Support/Debug/D';
import {useBodyScrollLock} from '@common/hooks/ui/useBodyScrollLock';
import {useShake} from '@common/hooks/ui/useShake';
import SendButton from '@common/Components/Controls/SendButton';
import {Portal} from '@common/Components/Layout/Portal';
import {appUrl} from '@common/Utils/Url/appUrl';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {bookErrorCode, bookErrorMessage} from './bookingErrors';
import {BookingSlotSummary} from './BookingSlotSummary';
import {ExtraSlotPicker} from '../Slot/ExtraSlotPicker';
import type {SlotItem, ExpertMap} from '../types';

interface Props {
    slot: SlotItem;
    allSlots: SlotItem[];
    experts: ExpertMap;
    bookedIds: Set<number>;
    balance: number;
    bookUrl: string;
    csrf: string;
    onClose: () => void;
    onBooked: (bookedIds: number[]) => void;
}

interface ViewProps extends Props {
    balanceShaking: boolean;
    shakeBalance: () => void;
}

interface State {
    selected: number[];
    error: string;
    sending: boolean;
}

function stopClick(event: React.MouseEvent<HTMLDivElement>): void {
    event.stopPropagation();
}

function compareStart(left: SlotItem, right: SlotItem): number {
    return left.start_at - right.start_at;
}

function getOtherSlots({allSlots, slot, bookedIds}: Props): SlotItem[] {
    const available = allSlots.filter(other => other.expert_id === slot.expert_id && other.id !== slot.id && !bookedIds.has(other.id) && other.status === 'free');
    // Сортируем свежий массив, не исходные слоты.
    // oxlint-disable-next-line unicorn/no-array-sort
    available.sort(compareStart);
    return available.slice(0, 10);
}

function priceFor(ids: readonly number[], slots: SlotItem[]): number {
    let sum = 0;
    for (const id of ids) sum += slots.find(slot => slot.id === id)?.cost ?? 0;
    return sum;
}

function uidsFor(ids: readonly number[], slots: SlotItem[]): Record<string, string> {
    const uids: Record<string, string> = {};
    for (const id of ids) {
        const uid = slots.find(slot => slot.id === id)?.uid;
        if (uid) uids[String(id)] = uid;
    }
    return uids;
}

function canPay(balance: number, total: number): boolean {
    return total === 0 || balance >= total;
}

class BookingModalView extends AntiHookComponent<ViewProps> {
    private readonly store = new Carburetor<State>({selected: [this.props.slot.id], error: '', sending: false});
    private readonly selection = this.connectSelection(this.store, state => state.selected);
    private selectionCache?: {ids: readonly number[]; value: Set<number>};
    private otherCache?: {slot: SlotItem; allSlots: SlotItem[]; bookedIds: Set<number>; value: SlotItem[]};

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

    private readonly book = async () => {
        const {selected, sending} = this.store.getData();
        if (!selected.length) return;
        const {allSlots, balance, csrf, bookUrl, onBooked, onClose, shakeBalance} = this.props;
        const total = priceFor(selected, allSlots);
        // Кнопка остаётся доступной, чтобы подсветить нехватку средств.
        if (!canPay(balance, total)) {
            shakeBalance();
            return;
        }
        if (sending) return;
        this.update({sending: true, error: ''});
        try {
            D('booking.submit', {slotIds: [...selected], total});
            const result = await sendPost(bookUrl, {
                slot_ids: [...selected],
                slot_uids: uidsFor(selected, allSlots),
                CSRF_TOKEN: csrf,
            }) as any;
            if (result?.stale) {
                this.update({error: t.Slot_Rescheduled()});
            } else if (result?.error) {
                this.update({error: result.error});
            } else {
                D('booking.success', {count: selected.length});
                onBooked([...selected]);
                onClose();
            }
        } catch (e: any) {
            const code = bookErrorCode(e);
            this.update({error: code ? bookErrorMessage(code) : (e?.message || t.General_Error())});
        } finally {
            this.update({sending: false});
        }
    };

    private renderHeader() {
        return (
            <div className="booking-dialog-header">
                <h3 className="booking-dialog-title">{t.Slot_BookSlot()}</h3>
                <button type="button" className="booking-dialog-close" title={t.Action_Close()} aria-label={t.Action_Close()} onClick={this.props.onClose}>&times;</button>
            </div>
        );
    }

    private renderTotal(total: number, count: number) {
        const {balance, balanceShaking} = this.props;
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
                    <div className={balanceShaking ? 'booking-dialog-error-shake' : 'booking-dialog-error-funds'} data-booking-error={balanceShaking ? 'shake' : 'funds'} data-test-id="booking-insufficient">
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
        const {error, sending} = this.useCarburetor(this.store);
        const ids = this.selection();
        const total = priceFor(ids, allSlots);
        return (
            <Portal>
                <div className="fg-modal-overlay-high" onClick={onClose}>
                    <div role="dialog" aria-modal="true" aria-label={t.Slot_BookSlot()} className="booking-dialog" onClick={stopClick} data-test-id="booking-modal">
                        {this.renderHeader()}
                        <BookingSlotSummary slot={slot} expert={experts[slot.expert_id]} />
                        <ExtraSlotPicker slots={this.otherSlots()} selected={this.getSelection(ids)} onToggle={this.toggle} />
                        {this.renderTotal(total, ids.length)}
                        {error && <div className="booking-dialog-error">{error}</div>}
                        {this.renderActions(total, ids.length, sending)}
                    </div>
                </div>
            </Portal>
        );
    }
}

export default function BookingModal(props: Props) {
    useBodyScrollLock(true);
    const [balanceShaking, shakeBalance] = useShake();
    return <BookingModalView {...props} balanceShaking={balanceShaking} shakeBalance={shakeBalance} />;
}
