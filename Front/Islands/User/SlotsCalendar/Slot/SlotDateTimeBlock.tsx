import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {formatTime, formatDateLong} from '@common/Utils/Time/DateUtils';

interface DateTimeProps {
    startAt: number;
    endTs: number;
    durationMin: number;
}

export const SlotDateTimeBlock: React.FC<DateTimeProps> = ({startAt, endTs, durationMin}) => (
    <div className="p-3 rounded-lg bg-accent-subtle" data-test-id="slot-detail-datetime">
        <div className="text-sm text-muted mb-1">{t.Slot_DateLabel()}</div>
        <div className="font-semibold">{formatDateLong(startAt)}</div>
        <div className="text-sm font-medium mt-0.5">{formatTime(startAt)} — {formatTime(endTs)}</div>
        <div className="text-xs text-muted mt-1">
            {t.Slot_Duration()}: {durationMin} {t.Slot_Duration_Min()}
        </div>
    </div>
);
