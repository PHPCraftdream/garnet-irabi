import * as React from 'react';
import {useState, useRef} from 'react';
import {createPortal} from 'react-dom';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {SlotItem, ExpertMap} from './types';
import {EntityLink, userLinks} from '../../Common/EntityLinks';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {formatTime} from '@common/Utils/DateUtils';

interface SlotCardProps {
    slot: SlotItem;
    experts: ExpertMap;
    isBooked?: boolean;
    bookingStatus?: string; // 'pending' | 'confirmed'
    onBookClick?: (slot: SlotItem) => void;
    isModerator?: boolean;
    canBook?: boolean;
}

export const SlotCard: React.FC<SlotCardProps> = ({slot, experts, isBooked, bookingStatus, onBookClick, isModerator = false, canBook = false}) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);
    const startTime = formatTime(slot.start_at);
    const endTime = formatTime(slot.end_at || (slot.start_at + (slot.duration_min || 60) * 60));
    const expert = experts[slot.expert_id];
    // Calculate tooltip position relative to viewport
    const getTooltipStyle = (): React.CSSProperties => {
        if (!cardRef.current) return { display: 'none' };
        const rect = cardRef.current.getBoundingClientRect();
        const left = rect.right + 8;
        const top = rect.top;
        // If tooltip goes off right edge, show on left
        const useLeft = left + 230 > window.innerWidth;
        return {
            position: 'fixed',
            top: Math.max(8, Math.min(top, window.innerHeight - 250)),
            left: useLeft ? rect.left - 238 : left,
            zIndex: 9999,
        };
    };

    return (
        <div
            ref={cardRef}
            className="slot-card group"
            data-test-id={`slot-card-${slot.id}`}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
        >
            <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="font-semibold text-[13px] tabular-nums leading-tight whitespace-nowrap">
                    {startTime}<span className="text-muted mx-1">–</span>{endTime}
                </div>
                <span className="text-base font-bold tabular-nums whitespace-nowrap text-accent">{slot.cost}&nbsp;₽</span>
            </div>

            {expert && (
                <div className="text-[13px] mb-2 truncate" data-test-id={`slot-expert-link-${slot.id}`}>
                    <EntityLink name={expert.display_name} {...userLinks(slot.expert_id, true)} isModerator={isModerator} />
                </div>
            )}

            <div className="flex items-center gap-1.5 mb-5 text-[11px] text-muted">
                <span className="inline-flex items-center gap-1">
                    {slot.is_online ? (
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 5a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V5z"/><path d="M14 6l-2 2 2 2V6z" fill="currentColor"/></svg>
                    ) : (
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 8L8 2l6 6"/><path d="M3 7v7h10V7"/></svg>
                    )}
                    {slot.is_online ? t.Slots_Online() : t.Slots_Offline()}
                </span>
                {slot.duration_min && (
                    <>
                        <span className="text-default/30">·</span>
                        <span className="tabular-nums">{slot.duration_min} {t.Slot_Duration_Min()}</span>
                    </>
                )}
            </div>

            {isBooked ? (
                <button
                    type="button"
                    className={`w-full text-center text-xs font-semibold py-2 px-3 rounded-lg cursor-pointer hover:opacity-80 transition-opacity ${bookingStatus === 'confirmed' ? 'status-success' : 'status-notice'}`}
                    title={t.Slot_Details()}
                    data-test-id={`slot-booked-${slot.id}`}
                    onClick={() => onBookClick?.(slot)}
                >
                    {bookingStatus === 'confirmed' ? t.Booking_Status_Confirmed() : t.Booking_Status_Pending()}
                </button>
            ) : canBook ? (
                <button
                    type="button"
                    className="w-full text-center text-xs font-semibold py-2 px-3 rounded-lg bg-accent text-accent-text hover:bg-accent-hover transition-colors group-hover:shadow-md group-hover:shadow-accent/20"
                    title={t.Slot_Book()}
                    data-test-id={`slot-book-btn-${slot.id}`}
                    onClick={() => onBookClick?.(slot)}
                >
                    {t.Slot_Book()}
                </button>
            ) : null}

            {/* Tooltip rendered via portal — floats above everything, no scrollbar issues */}
            {showTooltip && createPortal(
                <div className="w-56 p-3 rounded-lg border-2 border-accent bg-surface-alt text-xs pointer-events-none shadow-2xl"
                     style={getTooltipStyle()}
                     data-test-id={`slot-tooltip-${slot.id}`}>
                    <div className="font-semibold text-sm mb-2">{startTime} — {endTime}</div>
                    {expert && <div className="mb-1"><span className="text-muted">{t.Slot_Expert()}:</span> <UserLink id={slot.expert_id} name={expert.display_name} isExpert className="text-accent hover:underline pointer-events-auto" /></div>}
                    <div className="mb-1"><span className="text-muted">{t.Slot_Duration()}:</span> {slot.duration_min || 60} {t.Slot_Duration_Min()}</div>
                    <div className="mb-1"><span className="text-muted">{t.Slots_PriceRange()}:</span> {slot.cost} &#8381;</div>
                    <div className="mb-1"><span className="text-muted">{t.Slot_Format()}:</span> {slot.is_online ? t.Slots_Online() : t.Slots_Offline()}</div>
                    {!slot.is_online && slot.location && <div className="mb-1"><span className="text-muted">{t.Slot_Location()}:</span> {slot.location}</div>}
                    <div className="mb-1"><span className="text-muted">{t.Slot_Type()}:</span> {t.Slots_Individual()}</div>
                    <div><span className="text-muted">{t.Slot_Seats()}:</span> {slot.max_users || 1}</div>
                </div>,
                document.body
            )}
        </div>
    );
};
