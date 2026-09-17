import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {appUrl} from '@common/Utils/Url/appUrl';
import {useSlotBooking} from '../../SlotsCalendar/Booking/useSlotBooking';

interface SlotTeaser {
    id: number;
    start_at: number;
    duration_min: number;
    cost: number;
    expert_id: number;
    expert_name: string;
    label: string;
}

const SlotTeaserRow: React.FC<{slot: SlotTeaser; onBook: (id: number) => void}> = ({slot, onBook}) => (
    <div className="booking-row">
        <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-on-surface">{slot.label}</div>
            <div className="text-sm text-muted">
                {slot.expert_id > 0
                    ? (
                        <UserLink
                            id={slot.expert_id}
                            name={slot.expert_name}
                            isExpert
                            className="text-accent hover:underline"
                            onClick={e => e.stopPropagation()}
                        />
                    )
                    : slot.expert_name}
                {' '}&middot; {formatTs(slot.start_at, {weekday: true})}
            </div>
            <div className="text-sm text-muted">{slot.duration_min} {t.Slot_Duration_Min()}</div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-sm font-medium text-secondary whitespace-nowrap">{slot.cost} &#8381;</span>
            <button
                type="button"
                onClick={() => onBook(slot.id)}
                className="btn btn-sm btn-primary whitespace-nowrap"
                data-test-id="book-btn"
            >
                {t.Slot_Book()}
            </button>
        </div>
    </div>
);

/** Подборка занятий на главной. */
export const RecommendedSlots: React.FC<{slots: SlotTeaser[]}> = ({slots}) => {
    // Общий поток бронирования: занятие открывается окном, а не уводит на
    // отдельную страницу. После успеха страница перезагружается, чтобы
    // ближайшие занятия и баланс показали новую бронь.
    const {openBooking, bookingModal} = useSlotBooking({onBooked: () => window.location.reload()});

    if (slots.length === 0) return null;

    return (
        <div data-test-id="recommended-slots">
            <div className="section-header-row">
                <h2 className="section-heading mb-0">{t.Dash_Recommendations()}</h2>
                <a href={appUrl('/slots')} className="view-all-link">{t.Dash_ViewAll()}</a>
            </div>
            <div className="space-y-2">
                {slots.map(slot => <SlotTeaserRow key={slot.id} slot={slot} onBook={openBooking} />)}
            </div>
            {bookingModal}
        </div>
    );
};
