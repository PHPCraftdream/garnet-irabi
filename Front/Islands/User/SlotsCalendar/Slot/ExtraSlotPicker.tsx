import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {formatDateShort} from '@common/Utils/Time/DateUtils/format/formatDateShort';
import {formatTime} from '@common/Utils/Time/DateUtils/format/formatTime';
import type {SlotItem} from '@/Islands/User/SlotsCalendar/State/view/types';

const bookingOtherSlots = t.Booking_OtherSlots;

interface OptionProps {
    slot: SlotItem;
    checked: boolean;
    onToggle: (id: number) => void;
}

class ExtraSlotOption extends AntiHookComponent<OptionProps> {
    /** Меняет выбор дополнительного слота. */
    private readonly toggle = () => this.props.onToggle(this.props.slot.id);

    /** Рисует опцию дополнительного слота. */
    render() {
        const {slot, checked} = this.props;
        const end = slot.end_at || slot.start_at + (slot.duration_min || 60) * 60;
        return (
            <label
                className="booking-extra-option"
                data-selected={checked}
                data-test-id={`booking-extra-slot-${slot.id}`}
            >
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={this.toggle}
                    className="booking-extra-check"
                />
                <span className="booking-extra-time">
                    {formatDateShort(slot.start_at)},{' '}
                    {formatTime(slot.start_at)} — {formatTime(end)}
                </span>
                <span className="booking-extra-price">{slot.cost} &#8381;</span>
            </label>
        );
    }
}

interface Props {
    slots: SlotItem[];
    selected: Set<number>;
    onToggle: (id: number) => void;
}

/** Рисует список дополнительных слотов для бронирования. */
export function ExtraSlotPicker({slots, selected, onToggle}: Props) {
    if (slots.length === 0) return null;
    const options: React.ReactNode[] = [];
    for (const slot of slots) {
        options.push(
            <ExtraSlotOption
                key={slot.id}
                slot={slot}
                checked={selected.has(slot.id)}
                onToggle={onToggle}
            />,
        );
    }
    return (
        <div className="booking-extra-picker">
            <div className="booking-extra-title">{bookingOtherSlots()}:</div>
            <div className="booking-extra-list">{options}</div>
        </div>
    );
}
