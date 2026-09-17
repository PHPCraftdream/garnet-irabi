import * as React from 'react';
import {formatTs} from '@common/Utils/DateUtils';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {UniversalBadge} from '../../../Common/booking/StatusBadge';
import {translateStatus} from '../../../Common/booking/statusHelpers';
import {EntityLink, userLinks} from '../../../Common/people/EntityLinks';
import {PenaltyTerms, outcomeLabel} from '../../../Common/booking/bookingAction';
import {Booking, BookingsViewAs, ExpertInfo, SlotInfo, UserInfo} from './bookingCardTypes';
import {BookingPlaceLine} from './BookingPlaceLine';
import {BookingCancelCause} from './BookingCancelCause';
import {BookingCardActions} from './BookingCardActions';

interface PartyProps {
    booking: Booking;
    slot: SlotInfo | null;
    expert?: ExpertInfo;
    bookingUser?: UserInfo;
    isExpertView: boolean;
    isModerator: boolean;
}

/** Вторая сторона занятия: преподавателю — ученик, ученику — преподаватель. */
const BookingParty: React.FC<PartyProps> = ({booking, slot, expert, bookingUser, isExpertView, isModerator}) => {
    if (isExpertView) {
        if (!bookingUser || !booking.user_id) return null;

        return (
            <p className="card-text mb-1" data-test-id={`booking-user-${booking.id}`}>
                <span className="text-muted text-sm">{t.Booking_User()}:</span>{' '}
                <EntityLink name={bookingUser.name} {...userLinks(booking.user_id, false)} isModerator={isModerator} />
            </p>
        );
    }

    if (!expert) return null;

    return (
        <p className="card-text mb-1" data-test-id={`booking-expert-${booking.id}`}>
            <span className="text-muted text-sm">{t.Slot_Expert()}:</span>{' '}
            <EntityLink name={expert.display_name} {...userLinks(slot?.expert_id ?? 0, true)} isModerator={isModerator} />
        </p>
    );
};

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
        <div className="card" data-test-id={`booking-card-${booking.id}`}>
            <div className="card-body">
                <div className="flex justify-between items-start mb-2">
                    <h5 className="card-title mb-0">{isSlot && slot ? formatTs(slot.start_at) : t.Booking_NA()}</h5>
                    <span data-test-id={`booking-status-${booking.id}`}>
                        <UniversalBadge
                            status={booking.status}
                            label={outcomeLabel(booking) || translateStatus(booking.status)}
                        />
                    </span>
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

                {isSlot && slot && !hideCost && (
                    <p className="card-text mb-1">
                        <span className="text-muted text-sm">{t.Slot_Cost()}:</span>{' '}
                        <span data-test-id={`booking-cost-${booking.id}`}>{slot.cost} &#8381;</span>
                    </p>
                )}

                {/* D-189: занятие с несколькими местами ничем не отличалось
                    от индивидуального, и ученик из своего списка не понимал,
                    что придёт не один. Признак берётся из тех же данных
                    слота, что и всё остальное на карточке. */}
                {isSlot && slot && (slot.max_users ?? 1) > 1 && (
                    <p className="card-text mb-1">
                        <span className="badge-soft" data-test-id={`booking-group-${booking.id}`}>
                            {t.Slot_GroupBadge([String(slot.max_users)])}
                        </span>
                    </p>
                )}

                <BookingCancelCause booking={booking} viewAs={viewAs} />

                <p className="card-text mb-0 text-sm text-muted">
                    {t.Booking_Created()}: {formatTs(booking.created_at)}
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
