import * as React from 'react';
import {appUrl} from '@common/Utils/Url/appUrl';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {NewsEvent} from './newsTypes';
import {PersonLink} from './PersonLink';
import {NewsSlotLink} from './NewsSlotLink';

const newsBookingCancelledByUserAction = t.News_BookingCancelledByUser_Action;
const newsBookingCancelledByUserLink = t.News_BookingCancelledByUser_Link;
const newsBookingCancelledByUserSuffix = t.News_BookingCancelledByUser_Suffix;
const newsBookingCancelledAction = t.News_BookingCancelled_Action;
const newsBookingCancelledLink = t.News_BookingCancelled_Link;
const newsBookingCancelledSuffix = t.News_BookingCancelled_Suffix;
const newsBookingConfirmedAction = t.News_BookingConfirmed_Action;
const newsBookingConfirmedLink = t.News_BookingConfirmed_Link;
const newsBookingConfirmedSuffix = t.News_BookingConfirmed_Suffix;
const newsBookingRejectedAction = t.News_BookingRejected_Action;
const newsBookingRejectedLink = t.News_BookingRejected_Link;
const newsBookingRejectedSuffix = t.News_BookingRejected_Suffix;
const newsBookingRescheduledByUserAction = t.News_BookingRescheduledByUser_Action;
const newsBookingRescheduledByUserLink = t.News_BookingRescheduledByUser_Link;
const newsBookingRescheduledByUserSuffix = t.News_BookingRescheduledByUser_Suffix;
const newsBookingRescheduledAction = t.News_BookingRescheduled_Action;
const newsBookingRescheduledLink = t.News_BookingRescheduled_Link;
const newsBookingRescheduledSuffix = t.News_BookingRescheduled_Suffix;
const newsCommentApprovedLink = t.News_CommentApproved_Link;
const newsCommentApprovedPrefix = t.News_CommentApproved_Prefix;
const newsCommentApprovedSuffix = t.News_CommentApproved_Suffix;
const newsNewMessageFrom = t.News_NewMessage_From;
const newsNewMessageLink = t.News_NewMessage_Link;
const newsNewMessagePrefix = t.News_NewMessage_Prefix;
const newsNewSlotAction = t.News_NewSlot_Action;
const newsNewSlotSuffix = t.News_NewSlot_Suffix;
const newsSlotBookedAction = t.News_SlotBooked_Action;
const newsSlotBookedLink = t.News_SlotBooked_Link;
const newsSupportReplyPrefix = t.News_SupportReply_Prefix;

/** Рисует текст события ленты с нужными ссылками и действиями. */
export function EventMessage({event, onBookSlot}: {event: NewsEvent; onBookSlot: (slotId: number) => void}) {
    const p = event.payload;
    switch (event.event_type) {
        case 'new_slot': {
            const slotId = Number(p.slot_id) || 0;
            return (
                <>
                    <PersonLink id={p.expert_id} name={p.name} isExpert />
                    {newsNewSlotAction()}
                    <NewsSlotLink slotId={slotId} onBookSlot={onBookSlot} />
                    {newsNewSlotSuffix()}
                </>
            );
        }
        case 'slot_booked':
            return (
                <>
                    <PersonLink id={p.user_id} name={p.name} />
                    {newsSlotBookedAction()}
                    <a href={appUrl('/expert/~slots')} className="news-event-link">
                        {newsSlotBookedLink()}
                    </a>
                </>
            );
        case 'booking_confirmed':
            return (
                <>
                    <PersonLink id={p.expert_id} name={p.name} isExpert />
                    {newsBookingConfirmedAction()}
                    <a href={appUrl('/bookings')} className="news-event-link">
                        {newsBookingConfirmedLink()}
                    </a>
                    {newsBookingConfirmedSuffix()}
                </>
            );
        case 'booking_rejected':
            return (
                <>
                    <PersonLink id={p.expert_id} name={p.name} isExpert />
                    {newsBookingRejectedAction()}
                    <a href={appUrl('/bookings')} className="news-event-link">
                        {newsBookingRejectedLink()}
                    </a>
                    {newsBookingRejectedSuffix()}
                </>
            );
        case 'booking_cancelled':
            // Одно событие, две стороны: ученик снял бронь — узнаёт
            // преподаватель; преподаватель отменил занятие — узнаёт ученик.
            // Отличаются они тем, кто назван в полезной нагрузке.
            return p.user_id ? (
                <>
                    <PersonLink id={p.user_id} name={p.name} />
                    {newsBookingCancelledByUserAction()}
                    <a href={appUrl('/expert/~slots')} className="news-event-link">
                        {newsBookingCancelledByUserLink()}
                    </a>
                    {newsBookingCancelledByUserSuffix()}
                </>
            ) : (
                <>
                    <PersonLink id={p.expert_id} name={p.name} isExpert />
                    {newsBookingCancelledAction()}
                    <a href={appUrl('/bookings')} className="news-event-link">
                        {newsBookingCancelledLink()}
                    </a>
                    {newsBookingCancelledSuffix()}
                </>
            );
        case 'booking_rescheduled':
            // Тот же расклад «кто есть в payload», что у booking_cancelled —
            // перенести может любая сторона, и текст называет её.
            return p.user_id ? (
                <>
                    <PersonLink id={p.user_id} name={p.name} />
                    {newsBookingRescheduledByUserAction()}
                    <a href={appUrl('/expert/~slots')} className="news-event-link">
                        {newsBookingRescheduledByUserLink()}
                    </a>
                    {newsBookingRescheduledByUserSuffix()}
                </>
            ) : (
                <>
                    <PersonLink id={p.expert_id} name={p.name} isExpert />
                    {newsBookingRescheduledAction()}
                    <a href={appUrl('/bookings')} className="news-event-link">
                        {newsBookingRescheduledLink()}
                    </a>
                    {newsBookingRescheduledSuffix()}
                </>
            );
        case 'comment_approved':
            return (
                <>
                    {newsCommentApprovedPrefix()}
                    <PersonLink id={p.expert_id} name={p.name} isExpert />
                    {newsCommentApprovedSuffix()}
                    <a href={appUrl(`/expert/id~${p.expert_id}`)} className="news-event-link">
                        {newsCommentApprovedLink()}
                    </a>
                </>
            );
        case 'support_reply':
            return (
                <>
                    {newsSupportReplyPrefix()}
                    <a href={appUrl('/support')} className="news-event-link">
                        «{p.subject}»
                    </a>
                </>
            );
        case 'new_message':
            return (
                <>
                    {newsNewMessagePrefix()}
                    <a href={appUrl('/im/')} className="news-event-link">
                        {newsNewMessageLink()}
                    </a>
                    {newsNewMessageFrom()}
                    <PersonLink id={p.sender_id} name={p.name} />
                </>
            );
        default:
            return <>{event.event_type}</>;
    }
}
