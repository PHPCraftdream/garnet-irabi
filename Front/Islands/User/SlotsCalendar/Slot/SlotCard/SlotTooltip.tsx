import * as React from 'react';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {slotPlaceLabel} from '@/Common/booking/formatting/slotPlaceLabel';
import {slotPlaceValue} from '@/Common/booking/formatting/slotPlaceValue';
import {slotSeatsLeftLine} from '@/Common/booking/formatting/slotSeatsLeftLine';
import {SlotItem, ExpertInfo} from '@/Islands/User/SlotsCalendar/State/view/types';

const slotExpert = t.Slot_Expert;
const slotDuration = t.Slot_Duration;
const slotDurationMin = t.Slot_Duration_Min;
const slotsPriceRange = t.Slots_PriceRange;
const slotFormat = t.Slot_Format;
const slotsOnline = t.Slots_Online;
const slotsOffline = t.Slots_Offline;
const slotType = t.Slot_Type;
const slotsGroup = t.Slots_Group;
const slotsIndividual = t.Slots_Individual;
const slotSeats = t.Slot_Seats;

const SLOT_TOOLTIP_EXPERT_LINK_TEMPLATE = (
    <a className="slot-tooltip-expert-link" />
);

interface Props {
    slot: SlotItem;
    expert?: ExpertInfo;
    startTime: string;
    endTime: string;
    style: React.CSSProperties;
}

/** Показывает подробности слота рядом с карточкой. */
export function SlotTooltip({slot, expert, startTime, endTime, style}: Props) {
    return (
        <div
            className="slot-tooltip-panel"
            style={style}
            data-test-id={`slot-tooltip-${slot.id}`}
        >
            <div className="slot-tooltip-heading">
                {startTime} — {endTime}
            </div>
            {expert && (
                <div className="slot-tooltip-row">
                    <span className="slot-tooltip-label">{slotExpert()}:</span>{' '}
                    <UserLink
                        id={slot.expert_id}
                        name={expert.display_name}
                        isExpert
                        anchor={SLOT_TOOLTIP_EXPERT_LINK_TEMPLATE}
                    />
                </div>
            )}
            <div className="slot-tooltip-row">
                <span className="slot-tooltip-label">{slotDuration()}:</span>{' '}
                {slot.duration_min || 60} {slotDurationMin()}
            </div>
            <div className="slot-tooltip-row">
                <span className="slot-tooltip-label">{slotsPriceRange()}:</span>{' '}
                {slot.cost} &#8381;
            </div>
            <div className="slot-tooltip-row">
                <span className="slot-tooltip-label">{slotFormat()}:</span>{' '}
                {slot.is_online ? slotsOnline() : slotsOffline()}
            </div>
            {slotPlaceValue(slot) && (
                <div className="slot-tooltip-row">
                    <span className="slot-tooltip-label">
                        {slotPlaceLabel(slot)}:
                    </span>{' '}
                    {slotPlaceValue(slot)}
                </div>
            )}
            <div className="slot-tooltip-row">
                <span className="slot-tooltip-label">{slotType()}:</span>{' '}
                {slot.max_users > 1 ? slotsGroup() : slotsIndividual()}
            </div>
            {/* D-196: тултип называл вместимость и молчал о занятости,
                хотя карточка рядом уже показывала остаток. Человек,
                открывший подробности, узнавал меньше, чем видел до
                этого. Строка считается тем же помощником. */}
            <div>
                <span className="slot-tooltip-label">{slotSeats()}:</span>{' '}
                {slot.max_users || 1}
                {slotSeatsLeftLine(slot) && (
                    <span
                        className="slot-tooltip-seats-left"
                        data-test-id={`slot-tooltip-seats-left-${slot.id}`}
                    >
                        ({slotSeatsLeftLine(slot)})
                    </span>
                )}
            </div>
        </div>
    );
}
