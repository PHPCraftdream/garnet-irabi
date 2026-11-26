import * as React from 'react';
import {formatTs} from '@common/Utils/Time/DateUtils/format/formatTs';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import type {PenaltyTerms} from '@/Common/booking/actions/rules/bookingAction';
import {Booking, BookingsViewAs, ExpertInfo, SlotInfo, UserInfo} from './bookingCardTypes';
import {BookingPlaceLine} from './details/BookingPlaceLine';
import {BookingParty} from './details/BookingParty';
import {BookingCostLine} from './details/BookingCostLine';
import {BookingStatus} from './details/BookingStatus';
import {BookingGroupBadge} from './details/BookingGroupBadge';
import {BookingCancelCause} from './cancel/BookingCancelCause';
import {BookingCardActions} from './BookingCardActions';

const bookingCreated = t.Booking_Created;
const bookingNA = t.Booking_NA;

export interface BookingCardProps {
    booking: Booking;
    slots: Record<number, SlotInfo>;
    experts: Record<number, ExpertInfo>;
    users: Record<number, UserInfo>;
    viewAs: BookingsViewAs;
    isModerator: boolean;
    onCancelOpen: (bookingId: number) => void;
    onConfirm: (bookingId: number) => void;
    onReject: (bookingId: number) => void;
    onRescheduleOpen: (bookingId: number) => void;
    confirmingId: number | null;
    /** Внутри группового занятия цену уже назвал заголовок группы — второй раз не повторяем. */
    hideCost?: boolean;
}

/** Описывает строку брони в карточке со сведениями о занятии и участниках. */
export const BookingCard: React.FC<BookingCardProps> = ({
    booking,
    slots,
    experts,
    users,
    viewAs,
    isModerator,
    onCancelOpen,
    onConfirm,
    onReject,
    onRescheduleOpen,
    confirmingId,
    hideCost = false,
}) => {
    const isSlot = booking.bookable_type === 'time_slot';
    const slot = isSlot ? slots[booking.bookable_id] : null;
    const expert = experts[slot?.expert_id ?? 0];
    const bookingUser = booking.user_id ? users[booking.user_id] : undefined;

    const terms: PenaltyTerms = {
        cost: slot?.cost ?? 0,
        penaltyPercent: slot?.cancellation_penalty_percent ?? 0,
        startAt: slot?.start_at ?? 0,
    };

    return (
        <div className="booking-card-shell" data-test-id={`booking-card-${booking.id}`}>
            <div className="booking-card-body">
                <div className="booking-card-header">
                    <h5 className="booking-card-title">{isSlot && slot ? formatTs(slot.start_at) : bookingNA()}</h5>
                    <BookingStatus booking={booking} />
                </div>

                <BookingParty
                    booking={booking}
                    slot={slot}
                    expert={expert}
                    bookingUser={bookingUser}
                    isExpertView={viewAs === 'expert'}
                    isModerator={isModerator}
                />

                {isSlot && slot && <BookingPlaceLine slot={slot} bookingId={booking.id} />}

                {isSlot && slot && !hideCost && <BookingCostLine bookingId={booking.id} cost={slot.cost} />}

                {/* D-189: занятие с несколькими местами ничем не отличалось
                    от индивидуального, и ученик из своего списка не понимал,
                    что придёт не один. Признак берётся из тех же данных
                    слота, что и всё остальное на карточке. */}
                {isSlot && slot && (slot.max_users ?? 1) > 1 && (
                    <BookingGroupBadge bookingId={booking.id} maxUsers={slot.max_users} />
                )}

                <BookingCancelCause booking={booking} viewAs={viewAs} />

                <p className="booking-created-line">
                    {bookingCreated()}: {formatTs(booking.created_at)}
                </p>

                <BookingCardActions
                    booking={booking}
                    viewAs={viewAs}
                    terms={terms}
                    confirmingId={confirmingId}
                    onCancelOpen={onCancelOpen}
                    onConfirm={onConfirm}
                    onReject={onReject}
                    onRescheduleOpen={onRescheduleOpen}
                />
            </div>
        </div>
    );
};
