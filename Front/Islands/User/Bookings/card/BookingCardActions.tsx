import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import type {PenaltyTerms} from '../../../../Common/booking/actions/rules/bookingAction';
import {actionCostHint} from '../../../../Common/booking/actions/outcomes/actionCostHint';
import {actionLabel} from '../../../../Common/booking/actions/labels/actionLabel';
import {canActNow} from '../../../../Common/booking/actions/rules/canActNow';
import {isActionable} from '../../../../Common/booking/actions/rules/isActionable';
import {pendingTerms} from '../../../../Common/booking/actions/rules/pendingTerms';
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
function renderTerm(term: string) { return <li key={term}>{term}</li>; }

export class BookingCardActions extends AntiHookComponent<Props> {
    /** Открывает окно отмены для этой брони. */
    private readonly cancel = () => this.props.onCancelOpen(this.props.booking.id);
    /** Запускает подтверждение этой брони. */
    private readonly confirm = () => this.props.onConfirm(this.props.booking.id);
    /** Открывает окно отказа для этой брони. */
    private readonly reject = () => this.props.onReject(this.props.booking.id);
    /** Открывает выбор нового времени для этой брони. */
    private readonly reschedule = () => this.props.onRescheduleOpen(this.props.booking.id);

    /** Формирует кнопки действий, доступные с учётом роли и статуса. */
    private renderActions(isExpertView: boolean, cancellable: boolean) {
        const {booking, confirmingId} = this.props;
        const isPending = booking.status === 'pending';
        return (
            <div className="booking-card-action-row">
                {isExpertView && isPending && (
                    <button
                        className="compact-success-action"
                        data-test-id={`confirm-btn-${booking.id}`}
                        disabled={confirmingId === booking.id}
                        onClick={this.confirm}
                    >
                        {t.Booking_Confirm()}
                    </button>
                )}
                {isExpertView && cancellable && (
                    <button
                        className="slot-remove-btn"
                        data-test-id={`reject-btn-${booking.id}`}
                        onClick={this.reject}
                    >
                        {actionLabel('expert', booking.status)}
                    </button>
                )}
                {!isExpertView && cancellable && (
                    <button
                        className="slot-remove-btn"
                        data-test-id={`cancel-btn-${booking.id}`}
                        onClick={this.cancel}
                    >
                        {actionLabel('user', booking.status)}
                    </button>
                )}
                {/* D-193: тот же порог, что у отмены — переносить можно ровно
                    то, что ещё можно отменить (не начавшееся, pending/confirmed). */}
                {cancellable && (
                    <button
                        className="booking-cancel-dismiss"
                        data-test-id={`reschedule-btn-${booking.id}`}
                        onClick={this.reschedule}
                    >
                        {t.Reschedule_Action()}
                    </button>
                )}
            </div>
        );
    }

    /** Показывает доступные действия, подсказку стоимости и условия брони. */
    render() {
        const {booking, viewAs, terms} = this.props;
        const isExpertView = viewAs === 'expert';
        const cancellable = canActNow(booking.status, terms.startAt);
        // Кнопка исчезла из-за времени, а не из-за статуса — значит человеку надо
        // сказать почему. Молчаливо пропавшее действие читается как поломка, и
        // это мы уже проходили (D-169: кнопка без объяснения).
        const startedAndLocked = isActionable(booking.status) && !cancellable;
        const costHint = actionCostHint(viewAs, booking.status, terms);
        const cardTerms = pendingTerms(viewAs, booking.status, terms);

        return (
            <>
                {this.renderActions(isExpertView, cancellable)}

                {costHint && (
                    <p className="booking-card-action-hint" data-test-id={`booking-cost-hint-${booking.id}`}>
                        {costHint}
                    </p>
                )}

                {startedAndLocked && (
                    <p className="booking-card-action-hint" data-test-id={`booking-started-lock-${booking.id}`}>
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
                    <ul className="booking-card-action-terms" data-test-id={`booking-cancel-terms-${booking.id}`}>
                        {cardTerms.map(renderTerm)}
                    </ul>
                )}
            </>
        );
    }
}
