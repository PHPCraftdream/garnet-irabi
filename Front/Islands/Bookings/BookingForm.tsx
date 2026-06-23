import * as React from 'react';
import {useState} from 'react';
import {D} from '@common/Debug/D';
import {useSending} from '@common/hooks/useSending';
import SendButton from '@common/Components/SendButton';
import {sendPost} from '@common/Api/sendPost';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/DateUtils';
import {EntityLink, userLinks} from '../../Common/EntityLinks';
import {IrabiPreviewProvider} from '../../Common/IrabiPreviewProvider';
import {goTo} from '@common/Dom/Nav/GoTo';
import {appUrl} from '@common/Utils/appUrl';

interface SlotInfo {
    id: number;
    start_at: number;
    duration_min: number;
    cost: number;
    is_online: number;
    location?: string;
    expert_id: number;
}

interface ExpertInfo {
    display_name: string;
    specialization?: string;
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


const BookingFormIslandInner: React.FC<BookingFormProps> = ({slot, expert, csrf, isModerator = false}) => {
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
                        {!slot.is_online && slot.location && (
                            <p><strong>{t.Slot_Location()}:</strong> {slot.location}</p>
                        )}
                    </div>

                    {expert && (
                        <div className="mb-3 p-3 bg-surface-hover rounded">
                            <h5>{t.Slot_Expert()}</h5>
                            <p className="mb-0">
                                <EntityLink name={expert.display_name} {...userLinks(slot.expert_id, true)} isModerator={isModerator} />
                                {expert.specialization && (
                                    <>
                                        <br /><small className="text-muted">{expert.specialization}</small>
                                    </>
                                )}
                            </p>
                        </div>
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
