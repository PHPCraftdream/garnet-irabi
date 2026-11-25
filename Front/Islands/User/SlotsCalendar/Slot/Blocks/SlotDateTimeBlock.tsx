import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {formatTime, formatDateLong} from '@common/Utils/Time/DateUtils';

const slotDateLabel = t.Slot_DateLabel;
const slotDuration = t.Slot_Duration;
const slotDurationMin = t.Slot_Duration_Min;

interface DateTimeProps {
    startAt: number;
    endTs: number;
    durationMin: number;
}

/** Обновляет данные календаря. */
export const SlotDateTimeBlock: React.FC<DateTimeProps> = ({startAt, endTs, durationMin}) => (
    <div className="slot-detail-datetime" data-test-id="slot-detail-datetime">
        <div className="slot-detail-label">{slotDateLabel()}</div>
        <div className="slot-detail-date">{formatDateLong(startAt)}</div>
        <div className="slot-detail-time">{formatTime(startAt)} — {formatTime(endTs)}</div>
        <div className="slot-detail-duration">
            {slotDuration()}: {durationMin} {slotDurationMin()}
        </div>
    </div>
);
