import * as React from 'react';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {SlotItem, ExpertMap, DayInfo} from '@/Islands/User/SlotsCalendar/State/view/types';
import {SlotCard} from '@/Islands/User/SlotsCalendar/Slot/SlotCard';

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

export class DayColumn extends React.Component<DayColumnProps> {
    /** Формирует разметку компонента. */
    private readonly renderSlot = (slot: SlotItem) => {
        const {experts, bookedIds, slotStatuses, onBookClick, isModerator, canBook} = this.props;
        return (
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
        );
    };

    /** Отрисовывает содержимое компонента. */
    public render() {
        const {day, slots, dayLabel} = this.props;
        return (
            <div
                className={slots.length === 0
                    ? (day.isPast ? 'week-day-empty-past' : 'week-day-empty')
                    : (day.isPast ? 'week-day-past' : 'week-day-normal')}
                data-test-id={`day-column-${day.dateStr}`}
            >
                <div className="week-day-head">
                    <div className="week-day-label" data-today={day.isToday ? 'true' : 'false'}>{dayLabel}</div>
                    <div className="week-day-number" data-today={day.isToday ? 'true' : 'false'}>
                        {day.dayNum}
                    </div>
                </div>
                <div className="week-day-content">
                    {slots.length === 0 ? (
                        <div className="week-day-empty-message">{t.Slots_NoSlots()}</div>
                    ) : slots.map(this.renderSlot)}
                </div>
            </div>
        );
    }
}
