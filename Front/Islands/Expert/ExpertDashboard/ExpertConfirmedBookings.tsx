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
export const ExpertConfirmedBookings: React.FC<Props> = ({bookings}) => (
    <div data-test-id="expert-confirmed-bookings">
        <div className="section-header-row">
            <h2 className="section-heading mb-0">
                {t.Teaching_ConfirmedBookingsTitle()}
                {bookings.length > 0 && <span className="ms-2 count-badge-success">{bookings.length}</span>}
            </h2>
        </div>

        {bookings.length === 0 && (
            <div className="empty-state-card">
                <p className="text-muted font-medium">{t.Teaching_NoConfirmedBookings()}</p>
            </div>
        )}
        {bookings.length > 0 && (
            <div className="space-y-2">
                {bookings.map(b => (
                    <div key={b.booking_id} className="booking-row" data-test-id={`confirmed-booking-${b.booking_id}`}>
                        <BookingPerson
                            userId={b.user_id}
                            userName={b.user_name}
                            startAt={b.start_at}
                            durationMin={b.duration_min}
                            cost={b.cost}
                            testId={`confirmed-user-link-${b.booking_id}`}
                        />
                    </div>
                ))}
            </div>
        )}
    </div>
);
