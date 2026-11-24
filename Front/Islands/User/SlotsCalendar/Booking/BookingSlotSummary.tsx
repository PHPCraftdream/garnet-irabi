import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {formatTime as fmtTime, formatDateShort as fmtDate} from '@common/Utils/Time/DateUtils';
import {slotFormatLine} from '../../../../Common/booking/slotFormat';
import type {SlotItem, ExpertInfo} from '../State/types';

const BOOKING_PLACE_LINK_TEMPLATE = <a className="booking-place-link" />;

interface Props {
    slot: SlotItem;
    expert?: ExpertInfo;
}

function stopClick(event: React.MouseEvent<HTMLAnchorElement>): void {
    event.stopPropagation();
}

function BookingExpert({slot, expert}: Props) {
    if (!expert) return null;
    return (
        <div className="booking-summary-expert">
            <UserLink id={slot.expert_id} name={expert.display_name} isExpert anchor={BOOKING_PLACE_LINK_TEMPLATE} onClick={stopClick} />
        </div>
    );
}

function BookingGroup({size}: {size: number}) {
    if (!(size > 1)) return null;
    return (
        <div className="booking-summary-group">
            <span className="slot-group-badge" data-test-id="booking-group-badge">{t.Slot_GroupBadge([size])}</span>
        </div>
    );
}

function BookingPenalty({slot}: {slot: SlotItem}) {
    const {cost, cancellation_penalty_percent: percent} = slot;
    if (!(percent > 0 && cost > 0)) return null;
    return (
        <div className="booking-summary-penalty" data-test-id="booking-penalty-warning">
            {t.Booking_PenaltyWarning([percent, Math.floor(cost * percent / 100)])}
        </div>
    );
}

export function BookingSlotSummary({slot, expert}: Props) {
    const endsAt = slot.end_at || (slot.start_at + (slot.duration_min || 60) * 60);
    return (
        <div className="booking-summary-slot" data-test-id="booking-main-slot">
            <div className="booking-summary-time">{fmtDate(slot.start_at)}, {fmtTime(slot.start_at)} — {fmtTime(endsAt)}</div>
            <BookingExpert slot={slot} expert={expert} />
            <div className="booking-summary-format" data-test-id="booking-format">{slotFormatLine(slot)}</div>
            <BookingGroup size={slot.max_users} />
            <div className="booking-summary-cost">{slot.cost} &#8381;</div>
            <BookingPenalty slot={slot} />
            <div className="booking-summary-refund" data-test-id="booking-refund-note">{t.Booking_CancelTerms_Unanswered()}</div>
        </div>
    );
}
