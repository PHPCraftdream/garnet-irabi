import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {formatDateShort, formatTime} from '@common/Utils/Time/DateUtils';
import {SlotItem} from '../types';

const slotEnd = (s: SlotItem): number => s.end_at || (s.start_at + (s.duration_min || 60) * 60);

const ExtraSlotOption: React.FC<{slot: SlotItem; checked: boolean; onToggle: (id: number) => void}> = ({
    slot,
    checked,
    onToggle,
}) => (
    <label
        className={`flex items-center gap-2 p-2 rounded cursor-pointer text-sm ${checked ? 'bg-accent-subtle' : 'hover:bg-surface-hover'}`}
        data-test-id={`booking-extra-slot-${slot.id}`}
    >
        <input type="checkbox" checked={checked} onChange={() => onToggle(slot.id)} className="accent-theme" />
        <span className="flex-1">
            {formatDateShort(slot.start_at)}, {formatTime(slot.start_at)} — {formatTime(slotEnd(slot))}
        </span>
        <span className="font-medium">{slot.cost} &#8381;</span>
    </label>
);

interface Props {
    slots: SlotItem[];
    selected: Set<number>;
    onToggle: (id: number) => void;
}

/**
 * Другие занятия того же преподавателя — чтобы записаться сразу на несколько.
 *
 * Показывается только когда есть из чего выбирать: пустой блок с заголовком
 * «Другие занятия» обещает то, чего нет.
 */
export const ExtraSlotPicker: React.FC<Props> = ({slots, selected, onToggle}) => {
    if (slots.length === 0) return null;

    return (
        <div className="mb-4">
            <div className="text-sm font-medium text-secondary mb-2">{t.Booking_OtherSlots()}:</div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
                {slots.map(s => (
                    <ExtraSlotOption key={s.id} slot={s} checked={selected.has(s.id)} onToggle={onToggle} />
                ))}
            </div>
        </div>
    );
};
