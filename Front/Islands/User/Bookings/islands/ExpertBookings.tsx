import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {D} from '@common/Support/Debug/D';
import {useConfirm} from '@common/hooks/ui/useConfirm';

const BOOKING_PLACE_LINK_TEMPLATE = <a className="booking-place-link" />;

import {ConfirmModal} from '@common/Components/Feedback/ConfirmModal';
import {showToast} from '@common/Components/Feedback/GlobalToast';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {sendPost} from '@common/Api/Send/sendPost';
import {appUrl} from '@common/Utils/Url/appUrl';
import {UniversalBadge} from '../../../../Common/booking/status/StatusBadge';
import {translateStatus} from '../../../../Common/booking/status/statusHelpers';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {actionCostHint} from '../../../../Common/booking/actions/outcomes/actionCostHint';
import {actionImpact} from '../../../../Common/booking/actions/labels/actionImpact';
import {actionLabel} from '../../../../Common/booking/actions/labels/actionLabel';
import {isActionable} from '../../../../Common/booking/actions/rules/isActionable';
import {outcomeLabel} from '../../../../Common/booking/actions/outcomes/outcomeLabel';
import {IrabiPreviewProvider} from '../../../../Common/people/preview/IrabiPreviewProvider';
import {PageHeader} from '@common/Components/Layout/PageHeader';
import {CalendarCheck} from 'lucide-react';

interface Booking {
    id: number;
    bookable_id: number;
    bookable_type: string;
    status: string;
    created_at: number;
    /** Пусто — бронь так и не подтвердили: её сняли или отклонили, а не отменили (D-135). */
    confirmed_at?: number | null;
    cancelled_role?: string | null;
    user_id?: number;
    user_name?: string;
}

interface SlotMap {
    [slotId: string]: {
        start_at: number;
    };
}

interface ExpertBookingsProps {
    bookings: Booking[];
    slots: SlotMap;
    title: string;
    csrf: string;
}

interface CardProps {
    booking: Booking;
    slot?: {start_at: number};
    busy: boolean;
    onConfirm: (id: number) => void;
    onCancel: (id: number) => void;
}

/**
 * Входящая бронь глазами преподавателя.
 *
 * Тот же экран, что и «Брони», только вход с другой стороны: преподаватель
 * чаще подтверждает именно отсюда. Названия действий и подпись цены берутся из
 * общего `bookingAction` — одно и то же действие над одной и той же бронью не
 * должно называться по-разному в двух местах кабинета (нашла expert-2).
 */
class ExpertBookingCard extends AntiHookComponent<CardProps> {
    /** Передаёт идентификатор брони обработчику подтверждения. */
    private readonly confirm = () => this.props.onConfirm(this.props.booking.id);
    /** Передаёт идентификатор брони обработчику отмены. */
    private readonly cancel = () => this.props.onCancel(this.props.booking.id);

    /** Показывает доступные преподавателю действия и подсказку об их цене. */
    private renderActions() {
        const {booking, busy} = this.props;
        return (
            <>
                    {isActionable(booking.status) && (
                        <div className="booking-list-actions">
                            {booking.status === 'pending' && (
                                <button
                                    className="compact-success-action"
                                    data-test-id={`confirm-btn-${booking.id}`}
                                    disabled={busy}
                                    onClick={this.confirm}
                                >
                                    {busy ? '...' : t.Booking_Confirm()}
                                </button>
                            )}
                            <button
                                className="slot-remove-btn"
                                data-test-id={`expert-cancel-btn-${booking.id}`}
                                disabled={busy}
                                onClick={this.cancel}
                            >
                                {busy ? '...' : actionLabel('expert', booking.status)}
                            </button>
                        </div>
                    )}
                    {isActionable(booking.status) && (
                        <p className="booking-card-action-hint" data-test-id={`booking-cost-hint-${booking.id}`}>
                            {actionCostHint('expert', booking.status)}
                        </p>
                    )}
            </>
        );
    }

    /** Отрисовывает данные входящей брони и доступные действия. */
    render() {
        const {booking, slot} = this.props;
        return (
            <div className="booking-card-shell" data-test-id={`booking-card-${booking.id}`}>
                <div className="booking-card-body">
                    <h5 className="booking-list-card-title">
                        {t.Booking_Slot()}: {slot ? formatTs(slot.start_at) : t.Booking_NA()}
                    </h5>
                    {booking.user_name && (
                        <p className="booking-list-card-meta">
                            <strong>{t.Booking_UserName()}:</strong>{' '}
                            {booking.user_id
                            ? <UserLink id={booking.user_id} name={booking.user_name}
                                anchor={BOOKING_PLACE_LINK_TEMPLATE} />
                                : booking.user_name}
                        </p>
                    )}
                    <p className="booking-list-card-meta">
                        <strong>{t.Slot_Status()}:</strong>{' '}
                        <UniversalBadge
                            status={booking.status}
                            label={outcomeLabel(booking) || translateStatus(booking.status)}
                        />
                    </p>
                    <p className="booking-list-card-meta">
                        <strong>{t.Booking_Created()}:</strong> {formatTs(booking.created_at)}
                    </p>
                    {this.renderActions()}
                </div>
            </div>
        );
    }
}

interface ExpertBookingsState {
    bookingList: Booking[];
    loading: Record<number, boolean>;
}

type ConfirmControls = ReturnType<typeof useConfirm>;

class ExpertBookingsView extends AntiHookComponent<ExpertBookingsProps & {confirmControls: ConfirmControls}> {
    private readonly ui = new Carburetor<ExpertBookingsState>({bookingList: this.props.bookings, loading: {}});
    private readonly bookings = this.connectSelection(this.ui, state => state.bookingList);
    /** Обновляет локальное состояние, не меняя остальные его поля. */
    private readonly patch = (patch: Partial<ExpertBookingsState>) => this.ui.setData({...this.ui.getData(), ...patch});

    /** Заменяет статус брони в локальном списке, если она там найдена. */
    private updateStatus(id: number, status: Booking['status']): void {
        const {bookingList} = this.ui.getData();
        const index = bookingList.findIndex(booking => booking.id === id);
        if (index < 0) return;
        const next = bookingList.slice();
        next[index] = {...next[index], status};
        this.patch({bookingList: next});
    }

    /** Отправляет подтверждение и отражает результат в карточке. */
    private readonly handleConfirm = async (bookingId: number) => {
        if (this.ui.getData().loading[bookingId]) return;
        this.patch({loading: {...this.ui.getData().loading, [bookingId]: true}});
        D('booking.confirm', {bookingId});
        try {
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            await sendPost(appUrl('/expert/~confirmBooking'), {CSRF_TOKEN: csrf, booking_id: bookingId});
            this.updateStatus(bookingId, 'confirmed');
            this.patch({loading: {...this.ui.getData().loading, [bookingId]: false}});
        } catch (e: any) {
            D('booking.error', {action: 'confirm', bookingId, error: e?.message});
            showToast(e?.message || t.General_Error(), 'danger');
            this.patch({loading: {...this.ui.getData().loading, [bookingId]: false}});
        }
    };

    /** Запрашивает подтверждение действия, затем отправляет отмену брони. */
    private readonly handleCancel = async (bookingId: number) => {
        if (this.ui.getData().loading[bookingId]) return;
        const target = this.ui.getData().bookingList.find(b => b.id === bookingId);
        const impact = actionImpact('expert', target?.status);
        const ok = await this.props.confirmControls.confirm(`${t.Booking_CancelConfirm()} ${impact}`);
        if (!ok) return;
        this.patch({loading: {...this.ui.getData().loading, [bookingId]: true}});
        D('booking.cancel', {bookingId, source: 'expert'});
        try {
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            await sendPost(appUrl('/expert/~cancelBooking'), {CSRF_TOKEN: csrf, booking_id: bookingId});
            this.updateStatus(bookingId, 'cancelled');
            this.patch({loading: {...this.ui.getData().loading, [bookingId]: false}});
        } catch (e: any) {
            D('booking.error', {action: 'cancel', bookingId, error: e?.message});
            showToast(e?.message || t.General_Error(), 'danger');
            this.patch({loading: {...this.ui.getData().loading, [bookingId]: false}});
        }
    };

    /** Отрисовывает заголовок, список и диалог подтверждения действий. */
    render() {
        const {slots, title, confirmControls} = this.props;
        const {loading} = this.useCarburetor(this.ui);
        const bookingList = this.bookings();
        const cards: React.ReactNode[] = [];
        for (const booking of bookingList) {
            cards.push(<ExpertBookingCard key={booking.id} booking={booking} slot={slots[booking.bookable_id]}
                busy={!!loading[booking.id]} onConfirm={this.handleConfirm} onCancel={this.handleCancel} />);
        }
        return (
            <>
                <PageHeader title={title} icon={<CalendarCheck size={22} aria-hidden="true" />} />
                <div className="expert-bookings-grid">
                    {bookingList.length === 0 && <p className="booking-list-empty">{t.Booking_NoBookings()}</p>}
                    {cards}
                </div>
                <ConfirmModal
            state={confirmControls.confirmState}
            onConfirm={confirmControls.handleConfirm}
            onCancel={confirmControls.handleCancel}
        />

            </>
        );
    }
}

const ExpertBookingsIslandInner: React.FC<ExpertBookingsProps> = (props) => {
    const confirmControls = useConfirm();
    return <ExpertBookingsView {...props} confirmControls={confirmControls} />;
};

/** Показывает входящие брони в контексте предпросмотра пользователя. */
export const ExpertBookingsIsland: React.FC<ExpertBookingsProps> = (props) => (
    <IrabiPreviewProvider>
        <ExpertBookingsIslandInner {...props} />
    </IrabiPreviewProvider>
);
