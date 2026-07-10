import * as React from 'react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {SlotItem, ExpertMap, DayInfo} from './types';
import {SlotCard} from './SlotCard';

interface DayColumnProps {
    day: DayInfo;
    slots: SlotItem[];
    experts: ExpertMap;
    dayLabel: string;
    bookedIds?: Set<number>;
    slotStatuses?: Record<string, string>;
    onBookClick?: (slot: SlotItem) => void;
    isModerator?: boolean;
    canBook?: boolean;
}

export const DayColumn: React.FC<DayColumnProps> = ({day, slots, experts, dayLabel, bookedIds, slotStatuses, onBookClick, isModerator, canBook}) => {
    return (
        <div
            // On mobile (single-column stack) empty days are hidden so the
            // list shows only days that actually have slots; on desktop the
            // full 7-column week grid keeps every day for alignment.
            className={`flex flex-col min-w-[148px] ${day.isPast ? 'opacity-60' : ''} ${slots.length === 0 ? 'max-md:hidden' : ''}`}
            data-test-id={`day-column-${day.dateStr}`}
        >
            <div className="day-column-head">
                <div className={`day-column-label ${day.isToday ? 'text-accent' : 'text-muted'}`}>{dayLabel}</div>
                <div className={`day-num-badge ${day.isToday ? 'day-num-badge-active' : ''}`}>
                    {day.dayNum}
                </div>
            </div>

            <div className="flex-1 p-2">
                {slots.length === 0 ? (
                    <div className="muted-empty-state">
                        {t.Slots_NoSlots()}
                    </div>
                ) : (
                    slots.map(slot => (
                        <SlotCard
                            key={slot.id}
                            slot={slot}
                            experts={experts}
                            isBooked={bookedIds?.has(slot.id)}
                            bookingStatus={slotStatuses?.[String(slot.id)]}
                            onBookClick={onBookClick}
                            isModerator={isModerator}
                            canBook={canBook}
                        />
                    ))
                )}
            </div>
        </div>
    );
};
