import * as React from 'react';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {EntityLink} from '@/Common/people/links/EntityLink';
import {userLinks} from '@/Common/people/links/userLinks';
import {Booking, ExpertInfo, SlotInfo, UserInfo} from '@/Islands/User/Bookings/card/bookingCardTypes';

const bookingUserLabel = t.Booking_User;
const slotExpert = t.Slot_Expert;

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
                <span className="booking-party-label">{bookingUserLabel()}:</span>{' '}
                <EntityLink name={bookingUser.name} {...userLinks(booking.user_id, false)} isModerator={isModerator} />
            </p>
        );
    }

    if (!expert) return null;
    return (
        <p className="booking-party-line" data-test-id={`booking-expert-${booking.id}`}>
            <span className="booking-party-label">{slotExpert()}:</span>{' '}
            <EntityLink name={expert.display_name}
                {...userLinks(slot?.expert_id ?? 0, true)} isModerator={isModerator} />
        </p>
    );
};
