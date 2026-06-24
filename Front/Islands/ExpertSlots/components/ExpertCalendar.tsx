import * as React from 'react';
import {useState, useMemo, useCallback, useRef} from 'react';
import {Pencil, Trash2} from 'lucide-react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {UniversalBadge} from '../../../Common/StatusBadge';
import {translateStatus} from '../../../Common/statusHelpers';
import {CalendarPagerCounts, PagerCountItem} from '../../../Common/CalendarPagerCounts';
import {Slot} from '../types';
import {formatTime, formatDateShort, weekStartTs, addDaysTs, tsToInputDate} from '@common/Utils/DateUtils';

interface Props {
    slots: Slot[];
    onCancel?: (id: number) => void;
    onEdit?: (slot: Slot) => void;
    onCancelBooking?: (id: number) => void;
    onConfirmBooking?: (slot: Slot) => void;
    onDelete?: (id: number) => void;
    onUserClick?: (userId: number, userName: string) => void;
    onSlotDrop?: (slotId: number, newDateStr: string) => void;
}

const fmtTime = (ts: number): string => formatTime(ts);
const fmtDateShort = (ts: number): string => formatDateShort(ts);

const getDayLabel = (dow: number): string => {
    const labels = [t.Cal_Sun, t.Cal_Mon, t.Cal_Tue, t.Cal_Wed, t.Cal_Thu, t.Cal_Fri, t.Cal_Sat];
    return labels[dow]?.() || '';
};

const STATUS_FILTERS = ['all', 'pending', 'free', 'booked', 'completed', 'cancelled'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

// Pager hint: how many slots of each kind sit outside the visible window.
const PAGER_KINDS = ['free', 'pending', 'booked', 'completed'] as const;
type PagerKind = typeof PAGER_KINDS[number];

/** Bucket a slot into a pager-hint kind (cancelled / other → null, not shown). */
const slotKind = (s: Slot): PagerKind | null => {
    if (s.status === 'free') return 'free';
    if (s.status === 'completed') return 'completed';
    if (s.status === 'booked') return s.booking_status === 'pending' ? 'pending' : 'booked';
    return null;
};

const pagerKindLabel = (k: PagerKind): string => k === 'pending' ? t.Slot_Filter_Pending() : translateStatus(k);

const pagerItems = (counts: Record<PagerKind, number>): PagerCountItem[] =>
    PAGER_KINDS.map(k => ({key: k, count: counts[k], label: pagerKindLabel(k), cls: `cal-nav-badge--${k}`}));

const PAGE_WEEKS = 4;

export const ExpertCalendar: React.FC<Props> = ({slots, onCancel: _onCancel, onEdit, onCancelBooking, onConfirmBooking, onDelete, onUserClick, onSlotDrop}) => {
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    // Window offset in weeks (multiples of PAGE_WEEKS). Lets the expert page back
    // to past weeks / forward beyond the default window so EVERY slot — including
    // booked ones that fell outside the initial 4-week window — is reachable.
    const [weekOffset, setWeekOffset] = useState(0);
    const [dragOverDay, setDragOverDay] = useState<string | null>(null);
    const [draggingSlotId, setDraggingSlotId] = useState<number | null>(null);
    const dragCounterRef = useRef<Map<string, number>>(new Map());
    const nowSec = Math.floor(Date.now() / 1000);
    const todayIso = tsToInputDate(nowSec);

    const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, slot: Slot) => {
        e.dataTransfer.setData('text/plain', String(slot.id));
        e.dataTransfer.effectAllowed = 'move';
        setDraggingSlotId(slot.id);
    }, []);

    const handleDragEnd = useCallback(() => {
        setDraggingSlotId(null);
        setDragOverDay(null);
        dragCounterRef.current.clear();
    }, []);

    const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>, dayIso: string) => {
        e.preventDefault();
        const counter = (dragCounterRef.current.get(dayIso) || 0) + 1;
        dragCounterRef.current.set(dayIso, counter);
        if (counter === 1) {
            setDragOverDay(dayIso);
        }
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>, dayIso: string) => {
        e.preventDefault();
        const counter = (dragCounterRef.current.get(dayIso) || 0) - 1;
        dragCounterRef.current.set(dayIso, Math.max(0, counter));
        if (counter <= 0) {
            dragCounterRef.current.delete(dayIso);
            setDragOverDay(prev => prev === dayIso ? null : prev);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }, []);

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>, dayIso: string) => {
        e.preventDefault();
        setDragOverDay(null);
        setDraggingSlotId(null);
        dragCounterRef.current.clear();

        const slotIdStr = e.dataTransfer.getData('text/plain');
        const slotId = parseInt(slotIdStr, 10);
        if (isNaN(slotId)) return;

        // Find the slot to check if we are dropping on the same day
        const slot = slots.find(s => s.id === slotId);
        if (!slot) return;

        const originalIso = tsToInputDate(slot.start_at);
        if (originalIso === dayIso) return; // Same day — no action

        onSlotDrop?.(slotId, dayIso);
    }, [slots, onSlotDrop]);

    const filteredSlots = useMemo(() => {
        if (statusFilter === 'all') return slots;
        if (statusFilter === 'pending') return slots.filter(s => s.booking_status === 'pending');
        return slots.filter(s => s.status === statusFilter);
    }, [slots, statusFilter]);

    // Build a PAGE_WEEKS-week window starting at the current offset (all
    // timestamps resolved in the user's TZ). Every week of the window is always
    // rendered so paging is predictable and slots in any week are reachable.
    const {weeks, rangeLabel, windowStartUnix, windowEndUnix} = useMemo(() => {
        const baseWeekStart = addDaysTs(weekStartTs(nowSec), weekOffset * 7);
        const result: { days: { dateStr: string; dayLabelStr: string; dayOfWeek: number; isToday: boolean; dayIso: string }[]; slotsByDay: Map<string, Slot[]> }[] = [];

        for (let w = 0; w < PAGE_WEEKS; w++) {
            const wsUnix = addDaysTs(baseWeekStart, w * 7);
            const weekEndUnix = addDaysTs(wsUnix, 7);

            const days = [];
            for (let i = 0; i < 7; i++) {
                const dayTs = addDaysTs(wsUnix, i);
                const dayIso = tsToInputDate(dayTs);
                days.push({
                    dateStr: dayIso,
                    dayLabelStr: fmtDateShort(dayTs),
                    dayOfWeek: i,
                    isToday: dayIso === todayIso,
                    dayIso,
                });
            }

            const map = new Map<string, Slot[]>();
            for (const day of days) map.set(day.dateStr, []);

            for (const slot of filteredSlots) {
                if (slot.start_at >= wsUnix && slot.start_at < weekEndUnix) {
                    const key = tsToInputDate(slot.start_at);
                    map.get(key)?.push(slot);
                }
            }
            for (const arr of map.values()) arr.sort((a, b) => a.start_at - b.start_at);

            result.push({ days, slotsByDay: map });
        }

        const first = result[0].days[0];
        const last = result[result.length - 1].days[6];
        return {
            weeks: result,
            rangeLabel: `${first.dayLabelStr} – ${last.dayLabelStr}`,
            windowStartUnix: baseWeekStart,
            windowEndUnix: addDaysTs(baseWeekStart, PAGE_WEEKS * 7),
        };
    }, [filteredSlots, nowSec, todayIso, weekOffset]);

    const handlePrevPage = useCallback(() => setWeekOffset(o => o - PAGE_WEEKS), []);
    const handleNextPage = useCallback(() => setWeekOffset(o => o + PAGE_WEEKS), []);
    const handleToday = useCallback(() => setWeekOffset(0), []);

    // How many slots (by kind) sit OUTSIDE the current window, so the pager can
    // hint whether it's worth paging back / forward. Based on the full slot set,
    // independent of the active status filter.
    const {prevCounts, nextCounts, windowCounts} = useMemo(() => {
        const prev: Record<PagerKind, number> = {free: 0, pending: 0, booked: 0, completed: 0};
        const next: Record<PagerKind, number> = {free: 0, pending: 0, booked: 0, completed: 0};
        const win: Record<PagerKind, number> = {free: 0, pending: 0, booked: 0, completed: 0};
        for (const s of slots) {
            const k = slotKind(s);
            if (!k) continue;
            if (s.start_at < windowStartUnix) prev[k]++;
            else if (s.start_at >= windowEndUnix) next[k]++;
            else win[k]++;
        }
        return {prevCounts: prev, nextCounts: next, windowCounts: win};
    }, [slots, windowStartUnix, windowEndUnix]);

    const hasFreeSlots = slots.some(s => s.status === 'free');

    return (
        <div className="space-y-4">
            {/* Status filter */}
            <div className="flex gap-1 mb-2" data-test-id="expert-status-filter">
                {STATUS_FILTERS.filter(f => {
                    if (f === 'all') return true;
                    if (f === 'pending') return slots.some(s => s.booking_status === 'pending');
                    return slots.some(s => s.status === f);
                }).map(f => {
                    const count = f === 'pending'
                        ? slots.filter(s => s.booking_status === 'pending').length
                        : slots.filter(s => s.status === f).length;
                    let label: string;
                    if (f === 'all') label = t.Admin_Tab_All();
                    else if (f === 'pending') label = t.Slot_Filter_Pending();
                    else label = translateStatus(f);
                    return (
                        <button
                            key={f}
                            type="button"
                            className={`status-filter-btn ${statusFilter === f ? 'status-filter-btn-active' : ''}`}
                            onClick={() => setStatusFilter(f)}
                            data-test-id={`filter-status-${f}`}
                        >
                            {label}
                            {f !== 'all' && ` (${count})`}
                        </button>
                    );
                })}
            </div>
            {/* Drag hint */}
            {hasFreeSlots && onSlotDrop && (
                <div className="text-xs text-muted" data-test-id="slot-drag-hint">
                    {t.Slot_DragHint()}
                </div>
            )}
            {/* Week-window pagination — reach past / far-future slots */}
            <div className="grid grid-cols-3 items-center gap-3 mb-2" data-test-id="expert-week-nav">
                <div className="flex items-center gap-2 min-w-0">
                    <button
                        className="btn-icon-round"
                        onClick={handlePrevPage}
                        title={t.Slots_PrevWeek()}
                        aria-label={t.Slots_PrevWeek()}
                        data-test-id="expert-week-prev"
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="10 12 6 8 10 4"/></svg>
                    </button>
                    <CalendarPagerCounts items={pagerItems(prevCounts)} side="prev" />
                </div>
                <div className="flex flex-col items-center gap-1 min-w-0">
                    <CalendarPagerCounts items={pagerItems(windowCounts)} side="now" />
                    <div className="flex items-center gap-2 flex-wrap justify-center">
                        <span className="text-sm font-semibold text-on-surface">{rangeLabel}</span>
                        {weekOffset !== 0 && (
                            <button className="chip" onClick={handleToday} data-test-id="expert-week-today">
                                {t.Slots_Today()}
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2 min-w-0 justify-end">
                    <CalendarPagerCounts items={pagerItems(nextCounts)} side="next" />
                    <button
                        className="btn-icon-round"
                        onClick={handleNextPage}
                        title={t.Slots_NextWeek()}
                        aria-label={t.Slots_NextWeek()}
                        data-test-id="expert-week-next"
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 4 10 8 6 12"/></svg>
                    </button>
                </div>
            </div>
            {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-0 border border-default rounded-lg overflow-hidden" data-test-id={`expert-week-${wi}`}>
                    {week.days.map(day => {
                        const daySlots = week.slotsByDay.get(day.dateStr) || [];
                        const isDropTarget = dragOverDay === day.dayIso && draggingSlotId !== null;
                        return (
                            <div
                                key={day.dateStr}
                                className={`flex flex-col min-w-0 transition-colors ${day.isToday ? 'bg-accent-subtle' : ''} ${isDropTarget ? 'bg-accent-subtle' : ''}`}
                                onDragEnter={(e) => handleDragEnter(e, day.dayIso)}
                                onDragLeave={(e) => handleDragLeave(e, day.dayIso)}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, day.dayIso)}
                                data-test-id={`calendar-day-${day.dayIso}`}
                            >
                                <div className={`expert-cal-day-head ${day.isToday ? 'text-accent font-bold' : 'text-muted'}`}>
                                    {getDayLabel(day.dayOfWeek)} {day.dayLabelStr}
                                </div>
                                <div className="flex-1 p-1 overflow-y-auto" style={{maxHeight: '50vh'}}>
                                    {daySlots.length === 0 ? (
                                        <div className="text-center text-[10px] text-muted py-3">—</div>
                                    ) : daySlots.map(slot => {
                                        const isDraggable = slot.status === 'free' && !!onSlotDrop;
                                        const isDragging = draggingSlotId === slot.id;
                                        return (
                                            <div
                                                key={slot.id}
                                                className={`expert-cal-slot ${isDraggable ? 'cursor-grab' : ''} ${isDragging ? 'opacity-40' : ''}`}
                                                draggable={isDraggable}
                                                onDragStart={isDraggable ? (e) => handleDragStart(e, slot) : undefined}
                                                onDragEnd={isDraggable ? handleDragEnd : undefined}
                                                data-test-id={`expert-slot-${slot.id}`}
                                            >
                                                <div className="font-semibold">{fmtTime(slot.start_at)} — {fmtTime(slot.end_at || (slot.start_at + (slot.duration_min || 60) * 60))}</div>
                                                <div className="text-muted">{slot.cost} ₽ · {slot.duration_min} {t.Slot_Duration_Min()}</div>
                                                <div className="mt-1">
                                                    {slot.status === 'booked' ? (
                                                        <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded ${slot.booking_status === 'confirmed' ? 'status-success' : 'status-notice'}`}>
                                                            {slot.booking_status === 'confirmed' ? t.Booking_Status_Confirmed() : t.Booking_Status_Pending()}
                                                        </span>
                                                    ) : (
                                                        <UniversalBadge status={slot.status} label={translateStatus(slot.status)} />
                                                    )}
                                                </div>
                                                {slot.status === 'booked' && slot.user_name && (
                                                    <div className="mt-1 text-[10px]">
                                                        <span className="text-muted">{t.Slot_User()}: </span>
                                                        <button
                                                            type="button"
                                                            className="text-accent hover:underline font-medium"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onUserClick?.(slot.user_id!, slot.user_name!);
                                                            }}
                                                            data-test-id={`user-link-${slot.id}`}
                                                        >
                                                            {slot.user_name}
                                                        </button>
                                                    </div>
                                                )}
                                                {slot.status === 'free' && (
                                                    <div className="flex gap-1.5 mt-1.5">
                                                        {onEdit && <button type="button" className="expert-cal-icon-btn text-accent hover:bg-accent-subtle" title={t.Action_Edit()} onClick={() => onEdit(slot)} data-test-id={`edit-slot-${slot.id}`}><Pencil size={14} aria-hidden="true" /></button>}
                                                        {onDelete && <button type="button" className="expert-cal-icon-btn text-danger hover:bg-danger-subtle" title={t.Action_Delete()} onClick={() => onDelete(slot.id)} data-test-id={`delete-slot-${slot.id}`}><Trash2 size={14} aria-hidden="true" /></button>}
                                                    </div>
                                                )}
                                                {slot.status === 'booked' && (
                                                    <div className="flex gap-1.5 mt-1.5">
                                                        {slot.booking_status === 'pending' && onConfirmBooking && (
                                                            <button
                                                                type="button"
                                                                className="text-sm px-1.5 py-0.5 rounded btn btn-sm btn-success"
                                                                onClick={() => onConfirmBooking(slot)}
                                                                data-test-id={`confirm-booking-${slot.id}`}
                                                            >
                                                                {t.Booking_Confirm()}
                                                            </button>
                                                        )}
                                                        {onCancelBooking && (
                                                            <button
                                                                type="button"
                                                                className="expert-cal-icon-btn text-danger hover:bg-danger-subtle"
                                                                onClick={() => onCancelBooking(slot.id)}
                                                                data-test-id={`cancel-booking-${slot.id}`}
                                                            >
                                                                {t.Cancel_BookedSlot()}
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
};
