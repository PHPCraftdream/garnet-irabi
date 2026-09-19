import * as React from 'react';
import {useState, useMemo} from 'react';
import {sendPost} from '@common/Api/Send/sendPost';
import {D} from '@common/Support/Debug/D';
import {useSending} from '@common/hooks/data/useSending';
import {useBodyScrollLock} from '@common/hooks/ui/useBodyScrollLock';
import {useShake} from '@common/hooks/ui/useShake';
import {bookErrorCode, bookErrorMessage} from './bookingErrors';
import {BookingSlotSummary} from './BookingSlotSummary';
import SendButton from '@common/Components/Controls/SendButton';
import {Portal} from '@common/Components/Layout/Portal';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {ExtraSlotPicker} from '../Slot/ExtraSlotPicker';
import {SlotItem, ExpertMap} from '../types';
import {appUrl} from '@common/Utils/Url/appUrl';

interface Props {
    slot: SlotItem;
    allSlots: SlotItem[];
    experts: ExpertMap;
    bookedIds: Set<number>;
    balance: number;
    bookUrl: string;
    csrf: string;
    onClose: () => void;
    /** Called with every slot id actually submitted — not just the one the modal opened for. */
    onBooked: (bookedIds: number[]) => void;
}

export default function BookingModal({slot, allSlots, experts, bookedIds, balance, bookUrl, csrf, onClose, onBooked}: Props) {
    useBodyScrollLock(true);
    const [selected, setSelected] = useState<Set<number>>(() => new Set([slot.id]));
    const [error, setError] = useState('');
    const {sending, withSending} = useSending();
    const [balanceShaking, shakeBalance] = useShake();

    const expert = experts[slot.expert_id];

    // Other available slots from same expert (not booked, not the clicked one)
    const otherSlots = useMemo(() =>
        allSlots
            .filter(s => s.expert_id === slot.expert_id && s.id !== slot.id && !bookedIds.has(s.id) && s.status === 'free')
            .sort((a, b) => a.start_at - b.start_at)
            .slice(0, 10),
    [allSlots, slot, bookedIds]);

    const toggle = (id: number) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const totalPrice = useMemo(() => {
        let sum = 0;
        for (const id of selected) {
            const s = allSlots.find(sl => sl.id === id);
            if (s) sum += s.cost;
        }
        return sum;
    }, [selected, allSlots]);

    const canAfford = totalPrice === 0 || balance >= totalPrice;

    const handleBook = () => {
        if (selected.size === 0) return;
        // Button stays enabled when funds are short so the click can draw
        // attention to the notice instead of silently doing nothing.
        if (!canAfford) {
            shakeBalance();
            return;
        }
        withSending(async () => {
            D('booking.submit', {slotIds: [...selected], total: totalPrice});
            setError('');
            try {
                // Build id+uid pairs for concurrency guard
                const slotUids: Record<string, string> = {};
                for (const id of selected) {
                    const s = allSlots.find(sl => sl.id === id);
                    if (s?.uid) slotUids[String(id)] = s.uid;
                }
                const r = await sendPost(bookUrl, {
                    slot_ids: [...selected],
                    slot_uids: slotUids,
                    CSRF_TOKEN: csrf,
                }) as any;
                if (r?.stale) {
                    // Slot was rescheduled — notify user and close modal
                    setError(t.Slot_Rescheduled());
                    return;
                }
                if (r?.error) {
                    setError(r.error);
                } else {
                    D('booking.success', {count: selected.size});
                    onBooked([...selected]);
                    onClose();
                }
            } catch (e: any) {
                // The refusal travels as a machine code in the response body,
                // not in Error.message. Reading the message showed nothing
                // useful, so a booking refused because the lesson had already
                // started looked to the user like a button that did nothing.
                const code = bookErrorCode(e);
                setError(code ? bookErrorMessage(code) : (e?.message || t.General_Error()));
            }
        });
    };

    return (
        <Portal><div className="fg-modal-overlay-high" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label={t.Slot_BookSlot()}
                className="fg-modal-card fg-modal-card-md"
                onClick={e => e.stopPropagation()}
                data-test-id="booking-modal"
            >
                <div className="fg-modal-header-row">
                    <h3 className="fg-modal-title">{t.Slot_BookSlot()}</h3>
                    <button type="button" className="fg-modal-close-x" title={t.Action_Close()} aria-label={t.Action_Close()} onClick={onClose}>&times;</button>
                </div>

                {/* Main slot details */}
                <BookingSlotSummary slot={slot} expert={expert} />

                {/* Other slots by same expert */}
                <ExtraSlotPicker slots={otherSlots} selected={selected} onToggle={toggle} />

                {/* Total */}
                <div className="flex justify-between items-center py-3 border-t border-default">
                    <span className="text-sm text-secondary">
                        {t.Booking_Total()}: <strong className="text-lg">{totalPrice} &#8381;</strong>
                        <span className="ml-2 text-xs text-muted">({selected.size} {t.Booking_Items()})</span>
                    </span>
                    <span className="text-xs text-muted">
                        {t.Booking_Balance()}: {balance} &#8381;
                    </span>
                </div>

                {!canAfford && (
                    <div
                        className={`text-danger text-sm mb-2 inline-block ${balanceShaking ? 'animate-shake' : ''}`}
                        data-test-id="booking-insufficient"
                    >
                        {t.Booking_InsufficientBalance()}{' '}
                        <a href={appUrl('/balance')} className="text-accent hover:underline">(&#8593; {t.Balance_TopUp()})</a>
                    </div>
                )}
                {error && <div className="text-danger text-sm mb-2">{error}</div>}

                <div className="flex gap-3">
                    <SendButton
                        onClick={handleBook}
                        disabled={selected.size === 0}
                        sending={sending}
                        label={`${t.Slot_Book()} (${totalPrice} ₽)`}
                        testId="booking-confirm-btn"
                    />
                    <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
                        {t.Action_Cancel()}
                    </button>
                </div>
            </div>
        </div></Portal>
    );
}
