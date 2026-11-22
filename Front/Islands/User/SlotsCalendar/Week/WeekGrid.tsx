import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {SlotItem, ExpertMap, DayInfo} from '../types';
import {WeekEmptyNotice} from './WeekEmptyNotice';
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

export class WeekGrid extends React.Component<WeekGridProps> {
    private readonly renderDay = (day: DayInfo) => {
        const {slotsByDay, experts, bookedIds, slotStatuses, onBookClick, isModerator, canBook} = this.props;
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
    };

    private hasSlots(): boolean {
        const {days, slotsByDay} = this.props;
        for (const day of days) {
            if ((slotsByDay.get(day.dateStr) || []).length > 0) return true;
        }
        return false;
    }

    public render() {
        const {days} = this.props;
        return (
            <>
                <div className="week-calendar-grid" data-test-id="week-grid">
                    {days.map(this.renderDay)}
                </div>
                {!this.hasSlots() && <WeekEmptyNotice />}
            </>
        );
    }
}
