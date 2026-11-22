import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {sendPost} from '@common/Api/Send/sendPost';
import {useSending} from '@common/hooks/data/useSending';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {D} from '@common/Support/Debug/D';
import {appUrl} from '@common/Utils/Url/appUrl';
import {actionImpact, actionReasonLabel, actionReasonPlaceholder, actionSubmitLabel, actionTitle} from '../../../Common/booking/bookingAction';
import {ReasonModal} from '../../../Common/Components/ReasonModal';
import {PendingBookingItem, PendingBookingRow} from './PendingBookingRow';

export type {PendingBookingItem} from './PendingBookingRow';

interface Props {
    bookings: PendingBookingItem[];
    onConfirmed: (booking: PendingBookingItem) => void;
    onRejected: (bookingId: number) => void;
}

interface ViewProps extends Props {
    confirmSending: boolean;
    rejectSending: boolean;
    withConfirmSending: ReturnType<typeof useSending>['withSending'];
    withRejectSending: ReturnType<typeof useSending>['withSending'];
}

interface PendingState {activeId: number | null; rejectId: number | null}

class PendingBookingsView extends AntiHookComponent<ViewProps> {
    private readonly ui = new Carburetor<PendingState>({activeId: null, rejectId: null});

    private patch(changes: Partial<PendingState>) {
        this.ui.setData({...this.ui.getData(), ...changes});
    }

    private readonly openReject = (rejectId: number) => this.patch({rejectId});
    private readonly closeReject = () => this.patch({rejectId: null});

    private readonly handleConfirm = (bookingId: number) => {
        const {bookings, onConfirmed, withConfirmSending} = this.props;
        this.patch({activeId: bookingId});
        withConfirmSending(async () => {
            D('teaching.pendingBookings.confirm', {bookingId});
            try {
                const csrf = (window as any).__GARNET_CSRF__ ?? '';
                await sendPost(appUrl('/expert/~confirmBooking'), {CSRF_TOKEN: csrf, booking_id: bookingId});
                const confirmed = bookings.find(b => b.booking_id === bookingId);
                if (confirmed) onConfirmed(confirmed);
            } catch (e: any) {
                D('teaching.pendingBookings.error', {action: 'confirm', bookingId, error: e?.message});
                showToast(e?.message || t.General_Error(), 'danger');
            } finally {
                this.patch({activeId: null});
            }
        });
    };

    private readonly handleReject = (reason: string) => {
        const bookingId = this.ui.getData().rejectId;
        if (bookingId === null) return;
        const {onRejected, withRejectSending} = this.props;
        this.patch({activeId: bookingId});
        withRejectSending(async () => {
            D('teaching.pendingBookings.reject', {bookingId, reason});
            try {
                const csrf = (window as any).__GARNET_CSRF__ ?? '';
                await sendPost(appUrl('/expert/~cancelBooking'), {CSRF_TOKEN: csrf, booking_id: bookingId, reason});
                onRejected(bookingId);
                this.patch({rejectId: null});
            } catch (e: any) {
                D('teaching.pendingBookings.error', {action: 'reject', bookingId, error: e?.message});
                showToast(e?.message || t.General_Error(), 'danger');
            } finally {
                this.patch({activeId: null});
            }
        });
    };

    private renderList(activeId: number | null) {
        const {bookings, confirmSending, rejectSending} = this.props;
        const rows: React.ReactNode[] = [];
        for (const b of bookings) rows.push(<PendingBookingRow key={b.booking_id} booking={b}
                                confirming={confirmSending && activeId === b.booking_id}
                                rejecting={rejectSending && activeId === b.booking_id}
                                onConfirm={this.handleConfirm} onReject={this.openReject} />);
        return (
            <>
                {bookings.length === 0 && (
                    <div className="empty-state-card">
                        <p className="expert-bookings-empty-label">{t.Teaching_NoPendingBookings()}</p>
                    </div>
                )}
                {bookings.length > 0 && (
                    <div className="user-dash-list">
                        {rows}
                    </div>
                )}
            </>
        );
    }

    render() {
        const {bookings, rejectSending} = this.props;
        const {activeId, rejectId} = this.useCarburetor(this.ui);
        return (
            <div data-test-id="expert-pending-bookings">
                <div className="user-dash-section-header">
                    <h2 className="user-dash-section-heading">
                        {t.Teaching_PendingBookingsTitle()}
                        {bookings.length > 0 && <span className="expert-bookings-count-warning">{bookings.length}</span>}
                    </h2>
                </div>
                {this.renderList(activeId)}
                <ReasonModal
                    open={rejectId !== null}
                    title={actionTitle('expert', 'pending')}
                    impact={actionImpact('expert', 'pending')}
                    reasonLabel={actionReasonLabel('expert', 'pending')}
                    reasonPlaceholder={actionReasonPlaceholder('expert', 'pending')}
                    submitLabel={actionSubmitLabel('expert', 'pending')}
                    sending={rejectSending}
                    testId="reject-modal"
                    onSubmit={this.handleReject}
                    onClose={this.closeReject}
                />
            </div>
        );
    }
}

/** Заявки, ждущие решения преподавателя. */
export const ExpertPendingBookings: React.FC<Props> = props => {
    const {sending: confirmSending, withSending: withConfirmSending} = useSending();
    const {sending: rejectSending, withSending: withRejectSending} = useSending();
    return <PendingBookingsView {...props} {...{confirmSending, rejectSending, withConfirmSending, withRejectSending}} />;
};
