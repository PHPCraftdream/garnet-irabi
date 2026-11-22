import * as React from 'react';
import {formatTime} from '@common/Utils/Time/DateUtils';
import {I18nForeground as t} from '../../../../../../I18nGen/I18nForeground';
import {Slot} from '../../../types';

const slotEnd = (slot: Slot): number =>
    slot.end_at || (slot.start_at + (slot.duration_min || 60) * 60);

export const CalendarSlotSummary: React.FC<{slot: Slot}> = ({slot}) => (
    <>
        <div className="expert-slot-time">{formatTime(slot.start_at)} — {formatTime(slotEnd(slot))}</div>
        <div className="expert-slot-details">{slot.cost} ₽ · {slot.duration_min} {t.Slot_Duration_Min()}</div>
    </>
);
