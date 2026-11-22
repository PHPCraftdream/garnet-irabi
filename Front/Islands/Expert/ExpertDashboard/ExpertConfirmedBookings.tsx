import * as React from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {BookingPerson} from './BookingPerson';

export interface ConfirmedBookingItem {
    booking_id: number;
    user_id: number;
    user_name: string;
    slot_id: number;
    start_at: number;
    duration_min: number;
    cost: number;
    created_at: number;
}

interface Props {
    bookings: ConfirmedBookingItem[];
}

/**
 * Подтверждённые занятия преподавателя.
 *
 * От списка ожидающих отличается ровно одним: здесь решать нечего, поэтому нет
 * кнопок. Сама строка с человеком и временем — общая (`BookingPerson`): она
 * была написана дважды и разошлась бы при первой же правке.
 */
function renderBooking(b: Props['bookings'][number]) {
    return (
        <div key={b.booking_id} data-test-id={`confirmed-booking-${b.booking_id}`}>
            <BookingPerson
                userId={b.user_id}
                userName={b.user_name}
                startAt={b.start_at}
                durationMin={b.duration_min}
                cost={b.cost}
                testId={`confirmed-user-link-${b.booking_id}`}
            />
        </div>
    );
}

export const ExpertConfirmedBookings: React.FC<Props> = ({bookings}) => (
    <div data-test-id="expert-confirmed-bookings">
        <div className="user-dash-section-header">
            <h2 className="user-dash-section-heading">
                {t.Teaching_ConfirmedBookingsTitle()}
                {bookings.length > 0 && <span className="expert-bookings-count-success">{bookings.length}</span>}
            </h2>
        </div>

        {bookings.length === 0 && (
            <div className="empty-state-card">
                <p className="expert-bookings-empty-label">{t.Teaching_NoConfirmedBookings()}</p>
            </div>
        )}
        {bookings.length > 0 && (
            <div className="user-dash-list">
                {bookings.map(renderBooking)}
            </div>
        )}
    </div>
);
