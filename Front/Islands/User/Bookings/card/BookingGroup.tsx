import * as React from 'react';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {Booking, BookingGroupData, ExpertInfo, SlotInfo, UserInfo, BookingsViewAs} from './bookingCardTypes';
import {BookingCard} from './BookingCard';

interface Props {
    group: BookingGroupData;
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
}

const isActiveBooking = (booking: Booking) => booking.status !== 'cancelled';

const BookingGroupCount: React.FC<{group: BookingGroupData}> = ({group}) => {
    const id = group.slotId ?? group.key;
    // Отменённая бронь остаётся в истории, но не занимает место (D-170).
    const activeCount = group.bookings.filter(isActiveBooking).length;
    return (
        <span data-test-id={`booking-group-count-${id}`}>
            {t.Booking_GroupCount([activeCount])}
        </span>
    );
};

const GroupHeader: React.FC<{group: BookingGroupData}> = ({group}) => {
    const slot = group.slot;

    return (
        <div>
            <div>
                <div>{slot ? formatTs(slot.start_at) : t.Booking_NA()}</div>
                {slot && (
                    <div>
                        {slot.is_online ? t.Slot_Online() : t.Slot_Location()}
                        {slot.cost ? ` · ${slot.cost} ₽` : ''}
                    </div>
                )}
            </div>
            <BookingGroupCount group={group} />
        </div>
    );
};

/**
 * Занятие с несколькими записавшимися — одной карточкой со списком.
 *
 * Одиночная бронь остаётся обычной карточкой без обёртки: группа из одного
 * человека выглядела бы странно.
 */
export class BookingGroup extends React.Component<Props> {
    private readonly renderCard = (booking: Booking) => {
        const {group, ...cardProps} = this.props;
        return <BookingCard key={booking.id} booking={booking} {...cardProps} hideCost={group.bookings.length > 1} />;
    };

    public render() {
        const {group} = this.props;
        const grouped = group.bookings.length > 1;
        const cards = group.bookings.map(this.renderCard);

        if (!grouped) return cards[0];

        return (
            <div data-test-id={`booking-group-${group.slotId ?? group.key}`}>
                <GroupHeader group={group} />
                <div>{cards}</div>
            </div>
        );
    }
}
