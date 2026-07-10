import * as React from 'react';
import {useState, useMemo} from 'react';
import {sendPost} from '@common/Api/sendPost';
import {D} from '@common/Debug/D';
import {useSending} from '@common/hooks/useSending';
import {useBodyScrollLock} from '@common/hooks/useBodyScrollLock';
import {useShake} from '@common/hooks/useShake';
import SendButton from '@common/Components/SendButton';
import {Portal} from '@common/Components/Portal';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {SlotItem, ExpertMap} from './types';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {formatTime as fmtTime, formatDateShort as fmtDate} from '@common/Utils/DateUtils';
import {appUrl} from '@common/Utils/appUrl';

interface Props {
    slot: SlotItem;
    allSlots: SlotItem[];
    experts: ExpertMap;
    bookedIds: Set<number>;
    balance: number;
    bookUrl: string;
    csrf: string;
    onClose: () => void;
    onBooked: () => void;
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
                    onBooked();
                    onClose();
                }
            } catch (e: any) {
                setError(e?.message || t.General_Error());
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
                <div className="p-3 rounded-lg bg-accent-subtle mb-4" data-test-id="booking-main-slot">
                    <div className="font-medium">{fmtDate(slot.start_at)}, {fmtTime(slot.start_at)} — {fmtTime(slot.end_at || (slot.start_at + (slot.duration_min || 60) * 60))}</div>
                    {expert && (
                        <div className="text-sm text-secondary">
                            <UserLink id={slot.expert_id} name={expert.display_name} isExpert className="text-accent hover:underline" onClick={e => e.stopPropagation()} />
                        </div>
                    )}
                    <div className="text-sm font-medium mt-1">{slot.cost} &#8381;</div>
                    {slot.cancellation_penalty_percent > 0 && slot.cost > 0 && (
                        <div className="text-xs text-warning mt-1" data-test-id="booking-penalty-warning">
                            {t.Booking_PenaltyWarning([
                                slot.cancellation_penalty_percent,
                                Math.floor(slot.cost * slot.cancellation_penalty_percent / 100),
                            ])}
                        </div>
                    )}
                </div>

                {/* Other slots by same expert */}
                {otherSlots.length > 0 && (
                    <div className="mb-4">
                        <div className="text-sm font-medium text-secondary mb-2">
                            {t.Booking_OtherSlots()}:
                        </div>
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                            {otherSlots.map(s => (
                                <label
                                    key={s.id}
                                    className={`flex items-center gap-2 p-2 rounded cursor-pointer text-sm ${selected.has(s.id) ? 'bg-accent-subtle' : 'hover:bg-surface-hover'}`}
                                    data-test-id={`booking-extra-slot-${s.id}`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selected.has(s.id)}
                                        onChange={() => toggle(s.id)}
                                        className="accent-theme"
                                    />
                                    <span className="flex-1">
                                        {fmtDate(s.start_at)}, {fmtTime(s.start_at)} — {fmtTime(s.end_at || (s.start_at + (s.duration_min || 60) * 60))}
                                    </span>
                                    <span className="font-medium">{s.cost} &#8381;</span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}

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
