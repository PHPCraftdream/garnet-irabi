import * as React from 'react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {SlotItem, ExpertMap, DayInfo} from './types';
import {DayColumn} from './DayColumn';

interface WeekGridProps {
    days: DayInfo[];
    slotsByDay: Map<string, SlotItem[]>;
    experts: ExpertMap;
    bookedIds?: Set<number>;
    slotStatuses?: Record<string, string>;
    onBookClick?: (slot: SlotItem) => void;
    isModerator?: boolean;
    canBook?: boolean;
}

const DAY_LABELS: (() => string)[] = [
    () => t.Cal_Sun(),
    () => t.Cal_Mon(),
    () => t.Cal_Tue(),
    () => t.Cal_Wed(),
    () => t.Cal_Thu(),
    () => t.Cal_Fri(),
    () => t.Cal_Sat(),
];

export const WeekGrid: React.FC<WeekGridProps> = ({days, slotsByDay, experts, bookedIds, slotStatuses, onBookClick, isModerator, canBook}) => {
    // Empty days are hidden on mobile (DayColumn → max-md:hidden). If the whole
    // week is empty the mobile list would be blank, so show one notice instead.
    const anySlots = days.some(day => (slotsByDay.get(day.dateStr) || []).length > 0);

    return (
        <>
        <div
            className="grid grid-cols-7 gap-0 border border-default rounded-lg overflow-hidden max-md:grid-cols-1 max-md:gap-2 max-md:border-0"
            data-test-id="week-grid"
        >
            {days.map(day => {
                const key = day.dateStr;
                const slots = slotsByDay.get(key) || [];
                const dayLabel = DAY_LABELS[day.dayOfWeek]();

                return (
                    <DayColumn
                        key={key}
                        day={day}
                        slots={slots}
                        experts={experts}
                        dayLabel={dayLabel}
                        bookedIds={bookedIds}
                        slotStatuses={slotStatuses}
                        onBookClick={onBookClick}
                        isModerator={isModerator}
                        canBook={canBook}
                    />
                );
            })}
        </div>
        {!anySlots && (
            <div className="md:hidden muted-empty-state text-center py-6" data-test-id="week-empty-mobile">
                {t.Slots_NoSlots()}
            </div>
        )}
        </>
    );
};
