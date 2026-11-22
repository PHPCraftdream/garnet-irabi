import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {sendPost} from '@common/Api/Send/sendPost';
import {Portal} from '@common/Components/Layout/Portal';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {canActNow} from '../../../../Common/booking/bookingAction';
import {SlotCancelForm} from '../Booking/SlotCancelForm';
import {SlotItem, ExpertMap} from '../State/types';
import {SlotDateTimeBlock} from './Blocks/SlotDateTimeBlock';
import {SlotExpertBlock} from './Blocks/SlotExpertBlock';
import {SlotFormatBlock} from './Blocks/SlotFormatBlock';
import {SlotPriceBlock} from './Blocks/SlotPriceBlock';
import {QuickChatSection} from './Blocks/QuickChatSection';
import {CancelReasonNotice} from './Blocks/CancelReasonNotice';
import {SlotModalHeader} from './Blocks/SlotModalHeader';
import {SlotDetailUIStore} from './SlotDetailUIStore';
import {appUrl} from '@common/Utils/Url/appUrl';

interface Props {
    slot: SlotItem;
    experts: ExpertMap;
    bookingStatus: string;
    bookingId: number;
    csrf: string;
    cancelReason?: string;
    quickChatUrl?: string;
    sendUrl?: string;
    currentAccountId?: number;
    onClose: () => void;
    onCancelled: (slotId: number) => void;
}

function CancelBookingSection({
    canCancel, showCancelForm, bookingStatus, slot, reason, reasonError, cancelError, sending,
    onShow, onReasonChange, onSubmit, onDismiss,
}: {
    canCancel: boolean;
    showCancelForm: boolean;
    bookingStatus: string;
    slot: SlotItem;
    reason: string;
    reasonError: string;
    cancelError: string;
    sending: boolean;
    onShow: () => void;
    onReasonChange: (v: string) => void;
    onSubmit: () => void;
    onDismiss: () => void;
}) {
    return (
        <>
            {canCancel && !showCancelForm && (
                <button
                    type="button"
                    className="btn-outline-warning-full"
                    onClick={onShow}
                    data-test-id="slot-detail-cancel-btn"
                >
                    {t.Slot_CancelBooking()}
                </button>
            )}

            {canCancel && showCancelForm && (
                <SlotCancelForm
                    bookingStatus={bookingStatus}
                    cost={slot.cost}
                    penaltyPercent={slot.cancellation_penalty_percent}
                    startAt={slot.start_at}
                    reason={reason}
                    reasonError={reasonError}
                    cancelError={cancelError}
                    sending={sending}
                    onReasonChange={onReasonChange}
                    onSubmit={onSubmit}
                    onDismiss={onDismiss}
                />
            )}
        </>
    );
}

function stopClick(event: React.MouseEvent<HTMLDivElement>): void {
    event.stopPropagation();
}

export default class SlotDetailModal extends AntiHookComponent<Props> {
    private readonly ui = new SlotDetailUIStore();

    private readonly handleEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') this.props.onClose();
    };

    componentDidMount(): void {
        super.componentDidMount();
        document.addEventListener('keydown', this.handleEscape);
    }

    componentWillUnmount(): void {
        document.removeEventListener('keydown', this.handleEscape);
        super.componentWillUnmount();
    }

    protected useEffects(): void {
        this.useEffect('bodyScrollLock', () => {
            const previous = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = previous;
            };
        }, []);
    }

    private readonly submitCancel = async () => {
        const {reason, sending} = this.ui.getData();
        const {bookingId, slot, onCancelled, onClose} = this.props;
        const trimmed = reason.trim();
        if (!trimmed) {
            this.ui.setReasonError(t.User_Cancel_ReasonRequired());
            return;
        }
        if (sending) return;
        this.ui.setSending(true);
        this.ui.setCancelError('');
        try {
            const res = await sendPost(appUrl(`/bookings/id~${bookingId}/~cancel`), {reason: trimmed}) as any;
            if (res?.error) {
                this.ui.setCancelError(res.error);
            } else {
                onCancelled(slot.id);
                onClose();
            }
        } catch {
            this.ui.setCancelError(t.General_Error());
        } finally {
            this.ui.setSending(false);
        }
    };

    private renderDetails() {
        const {slot, experts, quickChatUrl, sendUrl, currentAccountId, cancelReason} = this.props;
        const expert = experts[slot.expert_id];
        const endTs = slot.end_at || (slot.start_at + (slot.duration_min || 60) * 60);
        return (
            <>
                <SlotDateTimeBlock startAt={slot.start_at} endTs={endTs} durationMin={slot.duration_min || 60} />
                <SlotPriceBlock cost={slot.cost} />
                <SlotFormatBlock slot={slot} />
                {expert && <SlotExpertBlock expertId={slot.expert_id} expert={expert} />}
                {quickChatUrl && sendUrl && currentAccountId && expert && (
                    <QuickChatSection slot={slot} quickChatUrl={quickChatUrl} sendUrl={sendUrl} currentAccountId={currentAccountId} />
                )}
                {cancelReason && <CancelReasonNotice reason={cancelReason} />}
            </>
        );
    }

    private renderCancel({showCancelForm, reason, reasonError, cancelError, sending}: ReturnType<SlotDetailUIStore['getData']>) {
        const {slot, bookingStatus} = this.props;
        return (
            <CancelBookingSection
                canCancel={canActNow(bookingStatus, slot.start_at)}
                showCancelForm={showCancelForm}
                bookingStatus={bookingStatus}
                slot={slot}
                reason={reason}
                reasonError={reasonError}
                cancelError={cancelError}
                sending={sending}
                onShow={this.ui.showCancel}
                onReasonChange={this.ui.changeReason}
                onSubmit={this.submitCancel}
                onDismiss={this.ui.dismissCancel}
            />
        );
    }

    render() {
        const {bookingStatus, onClose} = this.props;
        const state = this.useCarburetor(this.ui);
        return (
            <Portal>
                <div className="fg-modal-overlay-high" onClick={onClose} data-test-id="slot-detail-overlay">
                    <div role="dialog" aria-modal="true" aria-label={t.Slot_Details()} className="fg-modal-card-flush-lg"
                        onClick={stopClick} data-test-id="slot-detail-modal">
                        <SlotModalHeader bookingStatus={bookingStatus} onClose={onClose} />
                        <div className="slot-modal-body">
                            {this.renderDetails()}
                            {this.renderCancel(state)}
                        </div>
                    </div>
                </div>
            </Portal>
        );
    }
}
