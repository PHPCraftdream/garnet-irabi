import * as React from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {PenaltyTerms, actionCostHint, actionLabel, canActNow, isActionable, pendingTerms} from '../../../Common/bookingAction';
import {Booking, BookingsViewAs} from './bookingCardTypes';

interface Props {
    booking: Booking;
    viewAs: BookingsViewAs;
    terms: PenaltyTerms;
    confirmingId: number | null;
    onCancelOpen: (bookingId: number) => void;
    onConfirm: (bookingId: number) => void;
    onReject: (bookingId: number) => void;
    onRescheduleOpen: (bookingId: number) => void;
}

/**
 * Кнопки под карточкой и цена действия рядом с ними.
 *
 * Подпись стоит **до** нажатия, а не внутри окна: раньше человек узнавал,
 * во что обойдётся отмена, только открыв окно — то есть уже выбрав.
 */
export const BookingCardActions: React.FC<Props> = ({
    booking,
    viewAs,
    terms,
    confirmingId,
    onCancelOpen,
    onConfirm,
    onReject,
    onRescheduleOpen,
}) => {
    const isExpertView = viewAs === 'expert';
    const isPending = booking.status === 'pending';
    const cancellable = canActNow(booking.status, terms.startAt);
    // Кнопка исчезла из-за времени, а не из-за статуса — значит человеку надо
    // сказать почему. Молчаливо пропавшее действие читается как поломка, и
    // это мы уже проходили (D-169: кнопка без объяснения).
    const startedAndLocked = isActionable(booking.status) && !cancellable;
    const costHint = actionCostHint(viewAs, booking.status, terms);
    const cardTerms = pendingTerms(viewAs, booking.status, terms);

    return (
        <>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
                {isExpertView && isPending && (
                    <button
                        className="btn btn-sm btn-success"
                        data-test-id={`confirm-btn-${booking.id}`}
                        disabled={confirmingId === booking.id}
                        onClick={() => onConfirm(booking.id)}
                    >
                        {t.Booking_Confirm()}
                    </button>
                )}
                {isExpertView && cancellable && (
                    <button
                        className="btn btn-sm btn-outline-danger"
                        data-test-id={`reject-btn-${booking.id}`}
                        onClick={() => onReject(booking.id)}
                    >
                        {actionLabel('expert', booking.status)}
                    </button>
                )}
                {!isExpertView && cancellable && (
                    <button
                        className="btn btn-sm btn-outline-danger"
                        data-test-id={`cancel-btn-${booking.id}`}
                        onClick={() => onCancelOpen(booking.id)}
                    >
                        {actionLabel('user', booking.status)}
                    </button>
                )}
                {/* D-193: тот же порог, что у отмены — переносить можно ровно
                    то, что ещё можно отменить (не начавшееся, pending/confirmed). */}
                {cancellable && (
                    <button
                        className="btn btn-sm btn-outline-secondary"
                        data-test-id={`reschedule-btn-${booking.id}`}
                        onClick={() => onRescheduleOpen(booking.id)}
                    >
                        {t.Reschedule_Action()}
                    </button>
                )}
            </div>

            {costHint && (
                <p className="mt-2 mb-0 text-xs text-muted" data-test-id={`booking-cost-hint-${booking.id}`}>
                    {costHint}
                </p>
            )}

            {startedAndLocked && (
                <p className="mt-2 mb-0 text-xs text-muted" data-test-id={`booking-started-lock-${booking.id}`}>
                    {t.Booking_CannotCancelStarted()}
                </p>
            )}

            {/*
              * Что будет, если ничего не делать, и что будет после
              * подтверждения. Первый вопрос до этого не отвечался нигде вообще,
              * второй — в окне, которое человек видел до бронирования и уже
              * закрыл (нашла user-5).
              */}
            {cardTerms.length > 0 && (
                <ul className="mt-1 mb-0 pl-4 text-xs text-muted list-disc" data-test-id={`booking-cancel-terms-${booking.id}`}>
                    {cardTerms.map(term => <li key={term}>{term}</li>)}
                </ul>
            )}
        </>
    );
};
