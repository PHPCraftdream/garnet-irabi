import * as React from 'react';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {BookingGroupData, ExpertInfo, SlotInfo, UserInfo, BookingsViewAs} from './bookingCardTypes';
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

const GroupHeader: React.FC<{group: BookingGroupData}> = ({group}) => {
    const slot = group.slot;
    const id = group.slotId ?? group.key;
    // Отменённая бронь на том же слоте остаётся в группе (история видна), но
    // не должна считаться как занятое место — иначе счётчик путает (D-170).
    const activeCount = group.bookings.filter(b => b.status !== 'cancelled').length;

    return (
        <div className="booking-group-header">
            <div>
                <div className="booking-group-title">{slot ? formatTs(slot.start_at) : t.Booking_NA()}</div>
                {slot && (
                    <div className="booking-group-meta">
                        {slot.is_online ? t.Slot_Online() : t.Slot_Location()}
                        {slot.cost ? ` · ${slot.cost} ₽` : ''}
                    </div>
                )}
            </div>
            <span className="booking-group-count" data-test-id={`booking-group-count-${id}`}>
                {t.Booking_GroupCount([activeCount])}
            </span>
        </div>
    );
};

/**
 * Занятие с несколькими записавшимися — одной карточкой со списком.
 *
 * Одиночная бронь остаётся обычной карточкой без обёртки: группа из одного
 * человека выглядела бы странно.
 */
export const BookingGroup: React.FC<Props> = ({group, ...cardProps}) => {
    const grouped = group.bookings.length > 1;
    const cards = group.bookings.map(booking => (
        <BookingCard key={booking.id} booking={booking} {...cardProps} hideCost={grouped} />
    ));

    if (!grouped) return cards[0];

    return (
        <div className="booking-group" data-test-id={`booking-group-${group.slotId ?? group.key}`}>
            <GroupHeader group={group} />
            <div className="booking-group-list">{cards}</div>
        </div>
    );
};
