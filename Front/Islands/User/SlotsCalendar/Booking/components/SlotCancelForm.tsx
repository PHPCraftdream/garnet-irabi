import * as React from "react";
import { AntiHookComponent } from "@react-carburetor/core";
import SendButton from "@common/Components/Controls/SendButton";
import { I18nForeground as t } from "../../../../../I18nGen/I18nForeground";
import { actionReasonLabel } from "../../../../../Common/booking/actions/labels/actionReasonLabel";
import { actionReasonPlaceholder } from "../../../../../Common/booking/actions/labels/actionReasonPlaceholder";
import { actionSubmitLabel } from "../../../../../Common/booking/actions/labels/actionSubmitLabel";
import { actionTitle } from "../../../../../Common/booking/actions/labels/actionTitle";
import { penaltyPreview } from "../../../../../Common/booking/actions/outcomes/penaltyPreview";

const bookingPenaltyKeptByExpert = t.Booking_PenaltyKeptByExpert;
const bookingRefundAmount = t.Booking_RefundAmount;
const bookingRefundInfo = t.Booking_RefundInfo;

interface MoneyProps {
  cost: number;
  penaltyPercent: number;
  penaltyApplies: boolean;
  penaltyAmount: number;
  refundAmount: number;
}

/** Сколько вернётся и сколько останется у преподавателя. */
const CancelMoney: React.FC<MoneyProps> = ({
  cost,
  penaltyPercent,
  penaltyApplies,
  penaltyAmount,
  refundAmount,
}) => {
  if (!penaltyApplies) {
    if (cost <= 0) return null;

    return (
      <div
        className="booking-cancel-money-muted"
        data-test-id="slot-detail-refund-full"
      >
        {bookingRefundInfo()}: {cost} &#8381;
      </div>
    );
  }

  return (
    <div
      className="booking-cancel-money"
      data-test-id="slot-detail-penalty-preview"
    >
      <div className="booking-cancel-money-warning">
        {bookingPenaltyKeptByExpert([penaltyPercent, penaltyAmount])}
      </div>
      <div className="booking-cancel-money-muted">
        {bookingRefundAmount([refundAmount])}
      </div>
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
function renderSummary(bookingStatus: string | undefined, cost: number, penaltyPercent: number, startAt: number) {
  const preview = penaltyPreview(bookingStatus, {cost, penaltyPercent, startAt});
  return (
    <>
      <div className="booking-cancel-title">{actionTitle("user", bookingStatus)}</div>
      <CancelMoney cost={cost} penaltyPercent={penaltyPercent} penaltyApplies={preview.applies}
        penaltyAmount={preview.penaltyAmount} refundAmount={preview.refundAmount} />
    </>
  );
}

export class SlotCancelForm extends AntiHookComponent<Props> {
  /** Сохраняет выбранную причину отмены. */
  private readonly changeReason = (
    event: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    this.props.onReasonChange(event.target.value);
  };

  /** Формирует разметку компонента. */
  private renderActions() {
    const { bookingStatus, sending, onSubmit, onDismiss } = this.props;
    return (
      <div className="booking-cancel-actions">
        <button
          type="button"
          className="booking-cancel-dismiss"
          onClick={onDismiss}
        >
          {t.Action_Cancel()}
        </button>
        <SendButton
          onClick={onSubmit}
          sending={sending}
          label={actionSubmitLabel("user", bookingStatus)}
          testId="slot-detail-cancel-submit"
          variant="outline-warning"
        />
      </div>
    );
  }

  /** Отображает поле причины отмены и связанные с ним ошибки. */
  private renderReason(bookingStatus: string | undefined, reason: string, error: string) {
    return (
      <>
        {error && <div className="booking-cancel-error">{error}</div>}
        <label className="booking-cancel-label">{actionReasonLabel("user", bookingStatus)}</label>
        <textarea className="booking-cancel-input" rows={3} value={reason} onChange={this.changeReason}
          placeholder={actionReasonPlaceholder("user", bookingStatus)} data-test-id="slot-detail-cancel-reason-input" />
      </>
    );
  }

  /** Отрисовывает содержимое компонента. */
  render() {
    const {bookingStatus, cost, penaltyPercent, reason, reasonError, cancelError} = this.props;
    return (
      <div className="booking-cancel-panel" data-test-id="slot-detail-cancel-form">
        {renderSummary(bookingStatus, cost, penaltyPercent, this.props.startAt)}
        {this.renderReason(bookingStatus, reason, reasonError || cancelError)}
        {this.renderActions()}
      </div>
    );
  }
}
