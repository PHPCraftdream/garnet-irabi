import * as React from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {cancelActorLabel} from '../../../Common/booking/bookingAction';
import {Booking, BookingsViewAs} from './bookingCardTypes';

/**
 * Кто отменил бронь и почему.
 *
 * Потерять бронь можно тремя разными способами, и до недавнего времени все три
 * давали одну и ту же красную надпись «Отменён». Разница между ними огромная:
 * отменил сам — отвечаешь за решение; отклонил преподаватель — отвечает он;
 * сняла система — не отвечает никто, а деньги вернулись молча. Продукт эту
 * разницу знал и не показывал: единственным местом, где причина вообще
 * называлась, было примечание в истории операций.
 *
 * Пустая роль означает бронь, отменённую до того, как мы стали это
 * записывать. Таким показываем прежнюю сухую «Отменён» — выдумывать причину
 * задним числом хуже, чем промолчать.
 */
export const BookingCancelCause: React.FC<{booking: Booking; viewAs: BookingsViewAs}> = ({booking, viewAs}) => {
    if (booking.status !== 'cancelled') return null;

    // Подтверждения не было — значит бронь не отменяли: ученик снял заявку,
    // преподаватель её отклонил. Слово здесь то же, что на кнопке, которой это
    // сделали, и то же, что в значке состояния (D-135).
    const who = cancelActorLabel({
        role: booking.cancelled_role,
        wasConfirmed: !!booking.confirmed_at,
        viewerIsStudent: viewAs !== 'expert',
    });

    if (!who) return null;

    const reason = (booking.cancel_reason ?? '').trim();

    return (
        <div className="text-sm p-2 mb-2 rounded-lg bg-surface-alt" data-test-id={`booking-cancel-cause-${booking.id}`}>
            <div>{who}</div>
            {reason && <div className="text-muted mt-1">{t.Booking_CancelReason()}: {reason}</div>}
        </div>
    );
};
