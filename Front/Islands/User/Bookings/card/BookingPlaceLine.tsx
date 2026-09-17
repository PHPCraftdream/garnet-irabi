import * as React from 'react';
import {ExternalLink} from '@common/Components/Layout/ExternalLink';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {SlotInfo} from './bookingCardTypes';

interface Props {
    slot: SlotInfo;
    bookingId: number;
}

/**
 * Где пройдёт занятие.
 *
 * Три случая, и все три когда-то путались между собой:
 *
 *  - онлайн со ссылкой — показываем саму ссылку, её видит только участник;
 *  - онлайн без ссылки — «Площадка не указана». Раньше здесь подставлялось
 *    слово «Онлайн», то же самое, что стоит подписью слева, и выходило
 *    «Онлайн: Онлайн» (нашёл user-7). Потом было «Н/Д» — оно читалось как
 *    сокращение из отчёта, а не как ответ человеку;
 *  - очное — адрес.
 */
export const BookingPlaceLine: React.FC<Props> = ({slot, bookingId}) => {
    const label = slot.is_online ? t.Slot_Online() : t.Slot_Location();
    const testId = `booking-meeting-${bookingId}`;

    const value = (() => {
        if (!slot.is_online) {
            return <span data-test-id={testId}>{slot.location || t.Booking_NA()}</span>;
        }

        if (slot.location) {
            return (
                <ExternalLink href={slot.location} className="text-accent hover:underline" data-test-id={testId}>
                    {slot.location}
                </ExternalLink>
            );
        }

        return <span data-test-id={testId}>{slot.platform?.trim() || t.Booking_PlatformUnset()}</span>;
    })();

    return (
        <p className="card-text mb-1">
            <span className="text-muted text-sm">{label}:</span>{' '}
            {value}
        </p>
    );
};
