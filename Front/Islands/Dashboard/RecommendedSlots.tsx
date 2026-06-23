import * as React from 'react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/DateUtils';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {appUrl} from '@common/Utils/appUrl';
import {useSlotBooking} from '../SlotsCalendar/useSlotBooking';

interface SlotTeaser {
    id: number;
    start_at: number;
    duration_min: number;
    cost: number;
    expert_id: number;
    expert_name: string;
    label: string;
}

interface RecommendedSlotsProps {
    slots: SlotTeaser[];
}

export const RecommendedSlots: React.FC<RecommendedSlotsProps> = ({slots}) => {
    // Shared booking-modal flow — open the slot in a modal instead of
    // hard-navigating to a separate booking page. Reload on success so the
    // dashboard (upcoming bookings, balance) reflects the new booking.
    const {openBooking, bookingModal} = useSlotBooking({onBooked: () => window.location.reload()});

    if (slots.length === 0) return null;

    return (
        <div data-test-id="recommended-slots">
            <div className="section-header-row">
                <h2 className="section-heading mb-0">{t.Dash_Recommendations()}</h2>
                <a href={appUrl('/slots')} className="view-all-link">{t.Dash_ViewAll()}</a>
            </div>
            <div className="space-y-2">
                {slots.map(slot => (
                    <div key={slot.id} className="booking-row">
                        <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-on-surface">{slot.label}</div>
                            <div className="text-sm text-muted">
                                {slot.expert_id > 0 ? (
                                    <UserLink id={slot.expert_id} name={slot.expert_name} isExpert className="text-accent hover:underline" onClick={e => e.stopPropagation()} />
                                ) : slot.expert_name} &middot; {formatTs(slot.start_at, {weekday: true})}
                            </div>
                            <div className="text-sm text-muted">
                                {slot.duration_min} {t.Slot_Duration_Min()}
                            </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-sm font-medium text-secondary whitespace-nowrap">{slot.cost} &#8381;</span>
                            <button
                                type="button"
                                onClick={() => openBooking(slot.id)}
                                className="btn btn-sm btn-primary whitespace-nowrap"
                                data-test-id="book-btn"
                            >
                                {t.Slot_Book()}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            {bookingModal}
        </div>
    );
};
