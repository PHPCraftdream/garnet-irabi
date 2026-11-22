import * as React from 'react';
import {appUrl} from '@common/Utils/Url/appUrl';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {NewsEvent} from './newsTypes';
import {PersonLink} from './PersonLink';
import {NewsSlotLink} from './NewsSlotLink';

export function EventMessage({event, onBookSlot}: {event: NewsEvent; onBookSlot: (slotId: number) => void}) {
    const p = event.payload;
    switch (event.event_type) {
        case 'new_slot': {
            const slotId = Number(p.slot_id) || 0;
            return <><PersonLink id={p.expert_id} name={p.name} isExpert />{t.News_NewSlot_Action()}<NewsSlotLink slotId={slotId} onBookSlot={onBookSlot} />{t.News_NewSlot_Suffix()}</>;
        }
        case 'slot_booked':
            return <><PersonLink id={p.user_id} name={p.name} />{t.News_SlotBooked_Action()}<a href={appUrl('/expert/~slots')} className="news-event-link">{t.News_SlotBooked_Link()}</a></>;
        case 'booking_confirmed':
            return <><PersonLink id={p.expert_id} name={p.name} isExpert />{t.News_BookingConfirmed_Action()}<a href={appUrl('/bookings')} className="news-event-link">{t.News_BookingConfirmed_Link()}</a>{t.News_BookingConfirmed_Suffix()}</>;
        case 'booking_rejected':
            return <><PersonLink id={p.expert_id} name={p.name} isExpert />{t.News_BookingRejected_Action()}<a href={appUrl('/bookings')} className="news-event-link">{t.News_BookingRejected_Link()}</a>{t.News_BookingRejected_Suffix()}</>;
        case 'booking_cancelled':
            // Одно событие, две стороны: ученик снял бронь — узнаёт
            // преподаватель; преподаватель отменил занятие — узнаёт ученик.
            // Отличаются они тем, кто назван в полезной нагрузке.
            return p.user_id
                ? <><PersonLink id={p.user_id} name={p.name} />{t.News_BookingCancelledByUser_Action()}<a href={appUrl('/expert/~slots')} className="news-event-link">{t.News_BookingCancelledByUser_Link()}</a>{t.News_BookingCancelledByUser_Suffix()}</>
                : <><PersonLink id={p.expert_id} name={p.name} isExpert />{t.News_BookingCancelled_Action()}<a href={appUrl('/bookings')} className="news-event-link">{t.News_BookingCancelled_Link()}</a>{t.News_BookingCancelled_Suffix()}</>;
        case 'booking_rescheduled':
            // Тот же расклад «кто есть в payload», что у booking_cancelled —
            // перенести может любая сторона, и текст называет её.
            return p.user_id
                ? <><PersonLink id={p.user_id} name={p.name} />{t.News_BookingRescheduledByUser_Action()}<a href={appUrl('/expert/~slots')} className="news-event-link">{t.News_BookingRescheduledByUser_Link()}</a>{t.News_BookingRescheduledByUser_Suffix()}</>
                : <><PersonLink id={p.expert_id} name={p.name} isExpert />{t.News_BookingRescheduled_Action()}<a href={appUrl('/bookings')} className="news-event-link">{t.News_BookingRescheduled_Link()}</a>{t.News_BookingRescheduled_Suffix()}</>;
        case 'comment_approved':
            return <>{t.News_CommentApproved_Prefix()}<PersonLink id={p.expert_id} name={p.name} isExpert />{t.News_CommentApproved_Suffix()}<a href={appUrl(`/expert/id~${p.expert_id}`)} className="news-event-link">{t.News_CommentApproved_Link()}</a></>;
        case 'support_reply':
            return <>{t.News_SupportReply_Prefix()}<a href={appUrl('/support')} className="news-event-link">«{p.subject}»</a></>;
        case 'new_message':
            return <>{t.News_NewMessage_Prefix()}<a href={appUrl('/im/')} className="news-event-link">{t.News_NewMessage_Link()}</a>{t.News_NewMessage_From()}<PersonLink id={p.sender_id} name={p.name} /></>;
        default:
            return <>{event.event_type}</>;
    }
}
