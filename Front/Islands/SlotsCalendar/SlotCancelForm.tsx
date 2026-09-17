import * as React from 'react';
import SendButton from '@common/Components/Controls/SendButton';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {
    actionReasonLabel,
    actionReasonPlaceholder,
    actionSubmitLabel,
    actionTitle,
    penaltyPreview,
} from '../../Common/booking/bookingAction';

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
            <div className="text-xs text-muted" data-test-id="slot-detail-refund-full">
                {t.Booking_RefundInfo()}: {cost} &#8381;
            </div>
        );
    }

    return (
        <div className="space-y-1" data-test-id="slot-detail-penalty-preview">
            <div className="text-xs text-warning">{t.Booking_PenaltyKeptByExpert([penaltyPercent, penaltyAmount])}</div>
            <div className="text-xs text-muted">{t.Booking_RefundAmount([refundAmount])}</div>
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
export const SlotCancelForm: React.FC<Props> = ({
    bookingStatus,
    cost,
    penaltyPercent,
    startAt,
    reason,
    reasonError,
    cancelError,
    sending,
    onReasonChange,
    onSubmit,
    onDismiss,
}) => {
    const preview = penaltyPreview(bookingStatus, {cost, penaltyPercent, startAt});
    const shownError = reasonError || cancelError;

    return (
        <div className="p-3 rounded-lg border border-default bg-surface-alt space-y-3" data-test-id="slot-detail-cancel-form">
            <div className="text-sm font-medium">{actionTitle('user', bookingStatus)}</div>
            <CancelMoney
                cost={cost}
                penaltyPercent={penaltyPercent}
                penaltyApplies={preview.applies}
                penaltyAmount={preview.penaltyAmount}
                refundAmount={preview.refundAmount}
            />
            {shownError && <div className="text-sm text-danger">{shownError}</div>}
            <label className="text-sm text-secondary mb-1 block">{actionReasonLabel('user', bookingStatus)}</label>
            <textarea
                className="form-control text-sm"
                rows={3}
                value={reason}
                onChange={e => onReasonChange(e.target.value)}
                placeholder={actionReasonPlaceholder('user', bookingStatus)}
                data-test-id="slot-detail-cancel-reason-input"
            />
            <div className="flex gap-2 justify-end">
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onDismiss}>
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
        </div>
    );
};
