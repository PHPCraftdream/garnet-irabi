<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\I18n\En {
    /**
     * Подписи: Email.
     *
     * Часть разложенного файла данных (был один на 1251 строк).
     * Комментарии над ключами — история формулировок: почему сказано
     * именно так, и какой дефект это исправляло. Они переезжают вместе
     * со своими ключами и без них не имеют смысла.
     */
    class EnEmail {
        public static array $data = [
            // Email notifications
            'Email_BookingCreated_Subject' => 'New booking on %s',
            'Email_BookingCreated_Title' => 'You have a new booking',
            'Email_BookingCreated_Body' => 'User %s booked your session.',
            'Email_BookingConfirmed_Subject' => 'Booking confirmed on %s',
            'Email_BookingConfirmed_Title' => 'Your booking is confirmed',
            'Email_BookingConfirmed_Body' => 'Your booking has been confirmed by the expert.',
            'Email_BookingRejected_Subject' => 'Booking rejected on %s',
            'Email_BookingRejected_Title' => 'Booking rejected',
            'Email_BookingRejected_Body' => 'Unfortunately, your booking has been rejected by the expert.',
            'Email_BookingCancelled_Subject' => 'Booking cancelled on %s',
            'Email_BookingCancelled_Title' => 'Booking cancelled',
            'Email_BookingCancelled_Body' => 'Booking cancelled (%s).',
            'Email_BookingRescheduled_Subject' => 'Lesson moved — %s',
            'Email_BookingRescheduled_Title' => 'The lesson has been moved',
            'Email_Row_RescheduledFrom' => 'Was',
            'Email_Row_RescheduledTo' => 'Now',
            'Email_Row_RescheduledBy' => 'Moved by',
            'Email_Reschedule_NoMoney' => 'The money stayed with this lesson: nothing charged, nothing refunded, no penalty withheld.',
            // Lesson reminders. The subject says how far ahead it is: a
            // recipient gets two of them, and the inbox must show which.
            'Email_Reminder_Subject_1d' => 'Lesson tomorrow — %s',
            'Email_Reminder_Subject_2h' => 'Lesson in two hours — %s',
            'Email_Reminder_Title_1d' => 'Reminder: your lesson is tomorrow',
            'Email_Reminder_Title_2h' => 'Reminder: your lesson starts in two hours',
            'Email_Reminder_Body_Student' => 'Please remember your lesson. If your plans changed, cancel the booking in advance so the expert can offer the time to someone else.',
            'Email_Reminder_Body_Expert' => 'A reminder about your lesson. The people who booked it are expecting you at the scheduled time.',
            'Email_Row_Students' => 'Booked by',
            'Email_Cta_OpenSlot' => 'Open the lesson',

            'Email_NewMessage_Subject' => 'New message from %s',
            'Email_NewMessage_Title' => 'New message from %s',
            'Email_NewMessage_Title_Plain' => 'New message',
            'Email_NewMessage_Body' => 'You have a new personal message.',
            'Email_SupportNewTicket_Subject' => 'New ticket #%d',
            'Email_SupportNewTicket_Title' => 'New support ticket',
            'Email_SupportNewTicket_Body' => 'User %s created a ticket: %s',
            'Email_SupportReply_Subject' => 'Reply to ticket #%d',
            'Email_SupportReply_Title' => 'Support reply',
            'Email_SupportReply_Body' => 'A reply has been received for ticket: %s',
            'Email_ExpertApproved_Subject' => 'Your expert profile is approved',
            'Email_ExpertApproved_Title' => 'Congratulations — your profile is approved',
            'Email_ExpertApproved_Body' => 'Your slots are now visible to users and available for booking.',
            'Email_ExpertRejected_Subject' => 'Your expert profile has been revoked',
            'Email_ExpertRejected_Title' => 'Slot publication has been suspended',
            'Email_ExpertRejected_Body' => 'Your slots are no longer visible to users. Please contact support for details.',
            'Email_Cta_OpenExpertPanel' => 'Open expert panel',
            'Email_Cta_ContactSupport' => 'Contact support',
            'Email_SupportUserReply_Subject' => 'Reply in ticket #%d',
            'Email_SupportUserReply_Title' => 'User reply in ticket',
            'Email_SupportUserReply_Body' => 'User %s replied in ticket: %s',

            // Email row labels
            'Email_Row_User' => 'User',
            'Email_Row_Expert' => 'Expert',
            'Email_Row_DateTime' => 'Date and time',
            'Email_Row_Duration' => 'Duration',
            'Email_Row_Reason' => 'Reason',
            'Email_Row_GroupLesson' => 'Format',
            'Email_GroupLesson_Value' => 'Group, seats: %s',
            'Email_Row_CancelledBy' => 'Cancelled by',
            'Email_Row_From' => 'From',
            'Email_Row_Message' => 'Message',
            'Email_Row_Subject' => 'Subject',
            'Email_Row_TicketId' => 'Ticket ID',
            'Email_Row_Timezone' => 'Times shown in timezone',

            // Email CTA buttons
            'Email_Cta_OpenBooking' => 'Open booking',
            'Email_Cta_FindAnotherSlot' => 'Find another slot',
            'Email_Cta_OpenChat' => 'Open chat',
            'Email_Cta_OpenTicket' => 'Open ticket',

            // Email footer / friendly closing
            'Email_Footer_Note' => 'This is an automated notification, no reply is required.',
            'Email_Footer_Contact' => 'For any questions, contact:',

            // Stub data for the test-send dropdown
            'Email_Stub_ExpertName' => 'Test expert',
            'Email_Stub_UserName' => 'Test user',
            'Email_Stub_Reason' => 'Test reason (template demonstration)',
            'Email_Stub_MessagePreview' => 'This is a test message to preview the template.',
            'Email_Stub_TicketSubject' => 'Test ticket',
            'Email_Stub_CancelledBy' => 'Test expert',
        ];
    }
}
