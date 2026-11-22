import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {formatTime, formatDateLong} from '@common/Utils/Time/DateUtils';

interface DateTimeProps {
    startAt: number;
    endTs: number;
    durationMin: number;
}

export const SlotDateTimeBlock: React.FC<DateTimeProps> = ({startAt, endTs, durationMin}) => (
    <div className="slot-detail-datetime" data-test-id="slot-detail-datetime">
        <div className="slot-detail-label">{t.Slot_DateLabel()}</div>
        <div className="slot-detail-date">{formatDateLong(startAt)}</div>
        <div className="slot-detail-time">{formatTime(startAt)} — {formatTime(endTs)}</div>
        <div className="slot-detail-duration">
            {t.Slot_Duration()}: {durationMin} {t.Slot_Duration_Min()}
        </div>
    </div>
);
