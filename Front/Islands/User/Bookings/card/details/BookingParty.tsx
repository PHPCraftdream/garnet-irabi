import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {EntityLink} from '../../../../../Common/people/EntityLink';
import {userLinks} from '../../../../../Common/people/entityLinkHelpers';
import {Booking, ExpertInfo, SlotInfo, UserInfo} from '../bookingCardTypes';

interface Props {
    booking: Booking;
    slot: SlotInfo | null;
    expert?: ExpertInfo;
    bookingUser?: UserInfo;
    isExpertView: boolean;
    isModerator: boolean;
}

/** Вторая сторона занятия: преподавателю — ученик, ученику — преподаватель. */
export const BookingParty: React.FC<Props> = ({booking, slot, expert, bookingUser, isExpertView, isModerator}) => {
    if (isExpertView) {
        if (!bookingUser || !booking.user_id) return null;
        return (
            <p className="booking-party-line" data-test-id={`booking-user-${booking.id}`}>
                <span className="booking-party-label">{t.Booking_User()}:</span>{' '}
                <EntityLink name={bookingUser.name} {...userLinks(booking.user_id, false)} isModerator={isModerator} />
            </p>
        );
    }

    if (!expert) return null;
    return (
        <p className="booking-party-line" data-test-id={`booking-expert-${booking.id}`}>
            <span className="booking-party-label">{t.Slot_Expert()}:</span>{' '}
            <EntityLink name={expert.display_name} {...userLinks(slot?.expert_id ?? 0, true)} isModerator={isModerator} />
        </p>
    );
};
