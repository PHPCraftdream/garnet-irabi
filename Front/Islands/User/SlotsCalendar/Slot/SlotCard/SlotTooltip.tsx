import * as React from 'react';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {slotPlaceLabel, slotPlaceValue, slotSeatsLeftLine} from '../../../../../Common/booking/slotFormat';
import {SlotItem, ExpertInfo} from '../../types';

interface Props {
    slot: SlotItem;
    expert?: ExpertInfo;
    startTime: string;
    endTime: string;
    style: React.CSSProperties;
}

export function SlotTooltip({slot, expert, startTime, endTime, style}: Props) {
    return (
        <div className="slot-tooltip-panel" style={style} data-test-id={`slot-tooltip-${slot.id}`}>
            <div className="slot-tooltip-heading">{startTime} — {endTime}</div>
            {expert && <div className="slot-tooltip-row"><span className="slot-tooltip-label">{t.Slot_Expert()}:</span> <UserLink id={slot.expert_id} name={expert.display_name} isExpert className="slot-tooltip-expert-link" /></div>}
            <div className="slot-tooltip-row"><span className="slot-tooltip-label">{t.Slot_Duration()}:</span> {slot.duration_min || 60} {t.Slot_Duration_Min()}</div>
            <div className="slot-tooltip-row"><span className="slot-tooltip-label">{t.Slots_PriceRange()}:</span> {slot.cost} &#8381;</div>
            <div className="slot-tooltip-row"><span className="slot-tooltip-label">{t.Slot_Format()}:</span> {slot.is_online ? t.Slots_Online() : t.Slots_Offline()}</div>
            {slotPlaceValue(slot) && <div className="slot-tooltip-row"><span className="slot-tooltip-label">{slotPlaceLabel(slot)}:</span> {slotPlaceValue(slot)}</div>}
            <div className="slot-tooltip-row"><span className="slot-tooltip-label">{t.Slot_Type()}:</span> {slot.max_users > 1 ? t.Slots_Group() : t.Slots_Individual()}</div>
            {/* D-196: тултип называл вместимость и молчал о занятости,
                хотя карточка рядом уже показывала остаток. Человек,
                открывший подробности, узнавал меньше, чем видел до
                этого. Строка считается тем же помощником. */}
            <div><span className="slot-tooltip-label">{t.Slot_Seats()}:</span> {slot.max_users || 1}
                {slotSeatsLeftLine(slot) && (
                    <span className="slot-tooltip-seats-left" data-test-id={`slot-tooltip-seats-left-${slot.id}`}>({slotSeatsLeftLine(slot)})</span>
                )}
            </div>
        </div>
    );
}
