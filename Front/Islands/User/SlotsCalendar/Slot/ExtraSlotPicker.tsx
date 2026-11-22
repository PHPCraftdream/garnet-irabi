import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {formatDateShort, formatTime} from '@common/Utils/Time/DateUtils';
import type {SlotItem} from '../types';

interface OptionProps {
    slot: SlotItem;
    checked: boolean;
    onToggle: (id: number) => void;
}

class ExtraSlotOption extends AntiHookComponent<OptionProps> {
    private readonly toggle = () => this.props.onToggle(this.props.slot.id);

    render() {
        const {slot, checked} = this.props;
        const end = slot.end_at || (slot.start_at + (slot.duration_min || 60) * 60);
        return (
            <label className="booking-extra-option" data-selected={checked} data-test-id={`booking-extra-slot-${slot.id}`}>
                <input type="checkbox" checked={checked} onChange={this.toggle} className="booking-extra-check" />
                <span className="booking-extra-time">
                    {formatDateShort(slot.start_at)}, {formatTime(slot.start_at)} — {formatTime(end)}
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

export function ExtraSlotPicker({slots, selected, onToggle}: Props) {
    if (slots.length === 0) return null;
    const options: React.ReactNode[] = [];
    for (const slot of slots) {
        options.push(<ExtraSlotOption key={slot.id} slot={slot} checked={selected.has(slot.id)} onToggle={onToggle} />);
    }
    return (
        <div className="booking-extra-picker">
            <div className="booking-extra-title">{t.Booking_OtherSlots()}:</div>
            <div className="booking-extra-list">{options}</div>
        </div>
    );
}
