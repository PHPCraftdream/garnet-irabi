import * as React from 'react';
import {useState} from 'react';
import {D} from '@common/Support/Debug/D';
import {useSending} from '@common/hooks/data/useSending';
import SendButton from '@common/Components/Controls/SendButton';
import {sendPost} from '@common/Api/Send/sendPost';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {EntityLink, userLinks} from '../../Common/people/EntityLinks';
import {IrabiPreviewProvider} from '../../Common/people/IrabiPreviewProvider';
import {slotPlaceLabel, slotPlaceValue} from '../../Common/booking/slotFormat';
import {goTo} from '@common/Dom/Nav/GoTo';
import {appUrl} from '@common/Utils/Url/appUrl';

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
    <div className="mb-3 p-3 bg-surface-hover rounded">
        <h5>{t.Slot_Expert()}</h5>
        <p className="mb-0">
            <EntityLink name={expert.display_name} {...userLinks(expertId, true)} isModerator={isModerator} />
        </p>
    </div>
);

const BookingFormIslandInner: React.FC<BookingFormProps> = ({slot, expert, csrf: _csrf, isModerator = false}) => {
    const [error, setError] = useState<string | null>(null);
    const {sending, withSending} = useSending();

    const submitBooking = () => {
        withSending(async () => {
            setError(null);
            D('booking.submit', {slotId: slot.id, cost: slot.cost, expertId: slot.expert_id});

            try {
                const result = await sendPost(appUrl(`/bookings/id~${slot.id}/~book`), {}) as BookingResponse;

                if (result.success) {
                    D('booking.success', {slotId: slot.id});
                    goTo(result.redirect || appUrl('/bookings'));
                } else {
                    D('booking.error', {slotId: slot.id, error: result.error});
                    setError(result.error || 'Unknown error');
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                D('booking.error', {slotId: slot.id, error: msg});
                setError(msg);
            }
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        submitBooking();
    };

    return (
        <div className="max-w-lg mx-auto">
            <div className="card">
                <div className="card-body">
                    <h2 className="card-title">{t.Slot_BookSlot()}</h2>

                    <div className="mb-4 space-y-2">
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

                    {error && (
                        <div className="alert alert-danger mb-3" data-test-id="book-error" role="alert">
                            {error}
                        </div>
                    )}
                    <form id="bookForm" onSubmit={handleSubmit}>
                        <SendButton
                            onClick={submitBooking}
                            sending={sending}
                            label={sending ? t.Booking_Submitting() : t.Slot_Book()}
                            testId="book-btn"
                        />
                    </form>
                </div>
            </div>
        </div>
    );
};

export const BookingFormIsland: React.FC<BookingFormProps> = (props) => (
    <IrabiPreviewProvider>
        <BookingFormIslandInner {...props} />
    </IrabiPreviewProvider>
);
