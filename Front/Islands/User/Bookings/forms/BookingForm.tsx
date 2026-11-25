import * as React from 'react';
import {AntiHookComponent, Carburetor} from '@react-carburetor/core';
import {D} from '@common/Support/Debug/D';
import {useSending} from '@common/hooks/data/useSending';
import SendButton from '@common/Components/Controls/SendButton';
import {sendPost} from '@common/Api/Send/sendPost';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {EntityLink} from '../../../../Common/people/links/EntityLink';
import {userLinks} from '../../../../Common/people/links/userLinks';
import {IrabiPreviewProvider} from '../../../../Common/people/preview/IrabiPreviewProvider';
import {slotPlaceLabel} from '../../../../Common/booking/formatting/slotPlaceLabel';
import {slotPlaceValue} from '../../../../Common/booking/formatting/slotPlaceValue';
import {goTo} from '@common/Dom/Nav/GoTo';
import {appUrl} from '@common/Utils/Url/appUrl';

const slotExpert = t.Slot_Expert;

interface SlotInfo {
    id: number;
    start_at: number;
    duration_min: number;
    cost: number;
    is_online: number;
    location?: string;
    platform?: string;
    expert_id: number;
}

interface ExpertInfo {
    display_name: string;
}

interface BookingFormProps {
    slot: SlotInfo;
    expert?: ExpertInfo;
    csrf: string;
    isModerator?: boolean;
}

interface BookingResponse {
    success?: boolean;
    redirect?: string;
    error?: string;
}


/** Кто ведёт занятие — имя со ссылкой и, если есть, специализация. */
const ExpertBlock: React.FC<{
    expert: {display_name: string};
    expertId: number;
    isModerator: boolean;
}> = ({expert, expertId, isModerator}) => (
    <div className="booking-form-expert">
        <h5>{slotExpert()}</h5>
        <p className="booking-form-expert-name">
            <EntityLink name={expert.display_name} {...userLinks(expertId, true)} isModerator={isModerator} />
        </p>
    </div>
);

class BookingFormState extends Carburetor<{error: string | null}> {
    /** Инициализирует состояние ошибки формы бронирования. */
    constructor() { super({error: null}); }
}

class BookingFormView extends AntiHookComponent<
    BookingFormProps & {sending: boolean; withSending: ReturnType<typeof useSending>['withSending']}
> {
    private readonly ui = new BookingFormState();

    /** Запускает отправку формы через общий индикатор отправки. */
    private readonly submitBooking = () => {
        void this.props.withSending(this.book);
    };

    /** Создаёт бронь на сервере и показывает ошибку или выполняет переход. */
    private readonly book = async () => {
        const {slot} = this.props;
        this.ui.setData({error: null});
        D('booking.submit', {slotId: slot.id, cost: slot.cost, expertId: slot.expert_id});

        try {
            const result = await sendPost(
                appUrl(`/bookings/id~${slot.id}/~book`),
                {},
            ) as BookingResponse;

            if (result.success) {
                D('booking.success', {slotId: slot.id});
                goTo(result.redirect || appUrl('/bookings'));
            } else {
                D('booking.error', {slotId: slot.id, error: result.error});
                this.ui.setData({error: result.error || 'Unknown error'});
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            D('booking.error', {slotId: slot.id, error: msg});
            this.ui.setData({error: msg});
        }
    };

    /** Отменяет стандартную отправку формы и запускает бронирование. */
    private readonly handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        this.submitBooking();
    };

    /** Показывает сведения о слоте и преподавателе. */
    private renderDetails() {
        const {slot, expert, isModerator = false} = this.props;
        return (
            <>
                <div className="booking-form-details">
                    <p><strong>{t.Slot_DateTime()}:</strong> {formatTs(slot.start_at)}</p>
                    <p><strong>{t.Slot_Duration()}:</strong> {slot.duration_min ?? 60} {t.Slot_Duration_Min()}</p>
                    <p><strong>{t.Slot_Cost()}:</strong> {slot.cost} &#8381;</p>
                    <p><strong>{t.Slot_Type()}:</strong> {slot.is_online ? t.Slot_Online() : t.Slot_Offline()}</p>
                    {slotPlaceValue(slot) && (
                        <p><strong>{slotPlaceLabel(slot)}:</strong> {slotPlaceValue(slot)}</p>
                    )}
                </div>

                {expert && (
                    <ExpertBlock
                        expert={expert}
                        expertId={slot.expert_id}
                        isModerator={isModerator}
                    />
                )}
            </>
        );
    }

    /** Отрисовывает форму с описанием занятия и кнопкой бронирования. */
    render() {
        const {sending} = this.props;
        const {error} = this.useCarburetor(this.ui);
        return (
        <div className="booking-form-container">
            <div className="booking-form-card">
                <div className="booking-form-body">
                    <h2 className="booking-form-title">{t.Slot_BookSlot()}</h2>

                    {this.renderDetails()}

                    {error && (
                        <div className="booking-form-error" data-test-id="book-error" role="alert">
                            {error}
                        </div>
                    )}
                    <form id="bookForm" onSubmit={this.handleSubmit}>
                        <SendButton
                            onClick={this.submitBooking}
                            sending={sending}
                            label={sending ? t.Booking_Submitting() : t.Slot_Book()}
                            testId="book-btn"
                        />
                    </form>
                </div>
            </div>
        </div>
        );
    }
}

const BookingFormIslandInner: React.FC<BookingFormProps> = (props) => {
    const {sending, withSending} = useSending();
        return <BookingFormView
            {...props}
            sending={sending}
            withSending={withSending}
        />;
};

/** Оборачивает форму бронирования контекстом предпросмотра участников. */
export const BookingFormIsland: React.FC<BookingFormProps> = (props) => (
    <IrabiPreviewProvider>
        <BookingFormIslandInner {...props} />
    </IrabiPreviewProvider>
);
