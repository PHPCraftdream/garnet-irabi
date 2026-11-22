import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import SendButton from '@common/Components/Controls/SendButton';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {
    actionReasonLabel,
    actionReasonPlaceholder,
    actionSubmitLabel,
    actionTitle,
    penaltyPreview,
} from '../../../../Common/booking/bookingAction';

interface MoneyProps {
    cost: number;
    penaltyPercent: number;
    penaltyApplies: boolean;
    penaltyAmount: number;
    refundAmount: number;
}

/** Сколько вернётся и сколько останется у преподавателя. */
const CancelMoney: React.FC<MoneyProps> = ({cost, penaltyPercent, penaltyApplies, penaltyAmount, refundAmount}) => {
    if (!penaltyApplies) {
        if (cost <= 0) return null;

        return (
            <div className="booking-cancel-money-muted" data-test-id="slot-detail-refund-full">
                {t.Booking_RefundInfo()}: {cost} &#8381;
            </div>
        );
    }

    return (
        <div className="booking-cancel-money" data-test-id="slot-detail-penalty-preview">
            <div className="booking-cancel-money-warning">{t.Booking_PenaltyKeptByExpert([penaltyPercent, penaltyAmount])}</div>
            <div className="booking-cancel-money-muted">{t.Booking_RefundAmount([refundAmount])}</div>
        </div>
    );
};

interface Props {
    bookingStatus?: string;
    cost: number;
    penaltyPercent: number;
    startAt: number;
    reason: string;
    reasonError: string;
    cancelError: string;
    sending: boolean;
    onReasonChange: (v: string) => void;
    onSubmit: () => void;
    onDismiss: () => void;
}

/**
 * Форма отмены брони внутри карточки занятия.
 *
 * В отличие от трёх остальных мест это не отдельное окно, а раскрывающийся
 * блок в уже открытом окне, — поэтому общий `ReasonModal` здесь не подходит:
 * окно поверх окна было бы другим поведением, а не тем же самым. Общими
 * остаются слова (`bookingAction`) и расчёт сумм (`penaltyPreview`) — то, из-за
 * расхождения чего и заводилась эта задача.
 */
export class SlotCancelForm extends AntiHookComponent<Props> {
    private readonly changeReason = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        this.props.onReasonChange(event.target.value);
    };

    private renderActions() {
        const {bookingStatus, sending, onSubmit, onDismiss} = this.props;
        return (
            <div className="booking-cancel-actions">
                <button type="button" className="booking-cancel-dismiss" onClick={onDismiss}>
                    {t.Action_Cancel()}
                </button>
                <SendButton
                    onClick={onSubmit}
                    sending={sending}
                    label={actionSubmitLabel('user', bookingStatus)}
                    testId="slot-detail-cancel-submit"
                    variant="outline-warning"
                />
            </div>
        );
    }

    render() {
        const {bookingStatus, cost, penaltyPercent, startAt, reason, reasonError, cancelError} = this.props;
        const preview = penaltyPreview(bookingStatus, {cost, penaltyPercent, startAt});
        const shownError = reasonError || cancelError;

        return (
            <div className="booking-cancel-panel" data-test-id="slot-detail-cancel-form">
                <div className="booking-cancel-title">{actionTitle('user', bookingStatus)}</div>
                <CancelMoney
                    cost={cost}
                    penaltyPercent={penaltyPercent}
                    penaltyApplies={preview.applies}
                    penaltyAmount={preview.penaltyAmount}
                    refundAmount={preview.refundAmount}
                />
                {shownError && <div className="booking-cancel-error">{shownError}</div>}
                <label className="booking-cancel-label">{actionReasonLabel('user', bookingStatus)}</label>
                <textarea
                    className="booking-cancel-input"
                    rows={3}
                    value={reason}
                    onChange={this.changeReason}
                    placeholder={actionReasonPlaceholder('user', bookingStatus)}
                    data-test-id="slot-detail-cancel-reason-input"
                />
                {this.renderActions()}
            </div>
        );
    }
}
