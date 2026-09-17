<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\I18n\En {
    /**
     * Подписи: Slot.
     *
     * Часть разложенного файла данных (был один на 1251 строк).
     * Комментарии над ключами — история формулировок: почему сказано
     * именно так, и какой дефект это исправляло. Они переезжают вместе
     * со своими ключами и без них не имеют смысла.
     */
    class EnSlot {
        public static array $data = [
            'Slots_Title' => 'Available Slots',
            'Teaching_Slots_Title' => 'My Slots',
            'Teaching_Bookings_Title' => 'Incoming Bookings',

            'Slot_Create' => 'Create Slot',
            'Slot_Date' => 'Date',
            'Slot_Time' => 'Time',
            'Slot_Cost' => 'Cost',
            'Slot_PenaltyPercent' => 'Cancellation penalty %',
            'Slot_PenaltyHelp' => 'If a user cancels a confirmed booking — this percent stays with the expert',
            'Slot_Online' => 'Online',
            'Slot_Location' => 'Location',
            'Slot_Platform' => 'Platform',
            'Slot_LocationPlaceholderOnline' => 'Meeting link (Zoom/Meet/...)',
            'Slot_LocationPlaceholderOffline' => 'Address',
            'Slot_LocationHint' => 'Optional, but without it the user will not receive a link or address',
            'Slot_Book' => 'Book',
            'Slot_Status_Free' => 'Free',
            'Slot_Status_Booked' => 'Booked',
            'Slot_Status_Completed' => 'Completed',
            'Slot_Status_Expired' => 'Did not take place',
            'Slot_Status_Cancelled' => 'Cancelled',

            'Expert_PendingApproval' => 'Your profile is under review. Your slots are hidden from users and excluded from news until an admin approves your profile. After approval, news will appear automatically.',

            'Slot_Duration' => 'Duration',
            'Slot_Duration_Min' => 'min',

            'Slot_MySlots' => 'My Slots',
            'Slot_NoSlots' => 'No slots created yet',
            'Slot_Status' => 'Status',

            'Cal_Sun' => 'Sun',
            'Cal_Mon' => 'Mon',
            'Cal_Tue' => 'Tue',
            'Cal_Wed' => 'Wed',
            'Cal_Thu' => 'Thu',
            'Cal_Fri' => 'Fri',
            'Cal_Sat' => 'Sat',

            'Slot_Label' => 'Slot',

            'Slot_DateTime' => 'Date & Time',
            'Slot_Type' => 'Type',
            'Slot_Offline' => 'Offline',
            'Slot_NoAvailable' => 'No available slots',
            'Slot_Reset' => 'Reset',
            'Slot_BookSlot' => 'Book Slot',
            'Slot_AvailableSlots' => 'Available Slots',
            'Slot_Expert' => 'Expert',
            'Slot_About' => 'About',

            'Slot_MaxUsers' => 'Max Users',

            // merged from Common
            'cal_shabbat' => 'Shabbat',
            'cal_erev_shabbat' => 'Erev Shabbat',
            'cal_yom_tov' => 'Yom Tov',
            'cal_yom_tov_named' => 'Yom Tov (%s)',
            'cal_erev_yom_tov' => 'Erev Yom Tov',
            'cal_fast' => 'Fast',
            'cal_fast_named' => 'Fast (%s)',
            'cal_erev_fast' => 'Erev Fast',
            'cal_rosh_chodesh' => 'Rosh Chodesh',
            'cal_erev_rosh_chodesh' => 'Erev Rosh Chodesh',

            'Slot_Edit' => 'Edit',
            'Slot_Cancel' => 'Cancel',
            'Slot_Delete' => 'Delete',
            'Slot_Complete' => 'Complete',
            'Slot_Save' => 'Save',
            'Slot_EditTitle' => 'Edit Slot',
            'Slot_CancelConfirm' => 'Are you sure you want to cancel this slot?',
            'Slot_DeleteConfirm' => 'Are you sure you want to delete this slot?',
            'Study_UpcomingBookings' => 'Upcoming Bookings',
            'Study_NoBookings' => 'No upcoming bookings',
            'Study_TotalBookings' => 'Total Bookings',
            'Study_CompletedBookings' => 'Completed Bookings',
            'Study_ActiveBookings' => 'In Progress',

            // Slots Calendar
            'Teaching_Declines' => 'Declines',
            'Teaching_Cancellations' => 'Cancellations',
            'Slots_Calendar' => 'Schedule',
            'Slots_PrevWeek' => 'Previous',
            'Slots_NextWeek' => 'Next',
            'Slots_Today' => 'Today',
            'Slots_Morning' => 'Morning',
            'Slots_Day' => 'Day',
            'Slots_Evening' => 'Evening',
            'Slots_AllExperts' => 'All Experts',
            'Slots_Individual' => 'Individual',
            'Slots_Group' => 'Group',
            'Slots_Online' => 'Online',
            'Slots_Offline' => 'In Person',
            'Slots_PriceRange' => 'Price',
            'Slots_NoSlots' => 'No sessions',

            'Slot_Format' => 'Format',
            'Slot_Seats' => 'Seats',
            'Slot_GroupBadge' => 'Group, seats: %s',
            'Slot_SeatsLeft' => '%s of %s seats left',
            'Slot_SeatsTaken' => '%s of %s seats taken',

            'Slot_Rescheduled' => 'Slot has been rescheduled. Refreshing...',
            'Slot_PlaceUpdated' => 'Meeting place updated; everyone booked has been notified',
            'Slot_Saved' => 'Changes saved',
            'Slot_ReschedulePastError' => 'Cannot reschedule slot to a past time',
            'Slots_NoMatch' => 'No slots match the current filters',
            'Slots_FilterAll' => 'All',
            'Slots_FilterFree' => 'Free',
            'Slots_FilterMine' => 'Mine',
            'Slots_FilterPending' => 'Pending',
            'Slots_FilterConfirmed' => 'Confirmed',
            'Slots_FilterCancelled' => 'Cancelled',
            'Slots_FilterPast' => 'Past',
            'Expert_Cancellations' => 'Cancelled by them',
            'Expert_Declines' => 'Declined by them',
            'Expert_Conducted' => 'Conducted lessons',
            'Expert_Missed' => 'Left unanswered',
            'Expert_MissedHint' => 'Requests the teacher never answered before the lesson was due. The lesson did not happen and the student was refunded in full.',
            'Slot_OwnSlot' => 'Your slot',
            'Expert_Upcoming' => 'Upcoming',
            'Expert_Stats' => 'Statistics',

            // User preview + Quick chat
            'Slot_User' => 'User',

            'Slot_OverlapError' => 'Slot overlaps with an existing slot',

            // Slot refusals. These used to reach the browser as hardcoded
            // English regardless of the interface language.
            'Slot_Created' => 'Slot created',
            'Slot_Error_DateTimeRequired' => 'Enter a date and a time',
            'Slot_Error_RangeRequired' => 'Enter the start and the end of the period',
            'Slot_Error_InvalidCost' => 'That cost is not valid',
            'Slot_Error_InvalidDateTime' => 'That date or time is not valid',
            'Slot_Error_PastSlot' => 'A slot cannot start in the past',
            'Slot_Error_NoSlots' => 'No slots were selected',
            'Slot_Error_AccessDenied' => 'This slot is not yours',
            'Slot_Error_OnlyFreeEditable' => 'Only a free slot can be edited',
            'Slot_Error_BookedOnlyLocation' => 'Not saved: people have already booked this slot, so only the meeting place can change. Time, cost, penalty and seats have to stay as they are',
            'Slot_EditPlaceOnly' => 'Change the meeting place',
            'Slot_EditLockedNotice' => 'Someone has already booked this session. Only the meeting place can change — the other fields are locked, because they are the terms the person agreed to.',
            'Slot_Error_PastNotEditable' => 'A slot that has already passed cannot be changed',
            'Slot_Error_CostLockedByBookings' => 'While the slot has bookings, its cost and penalty cannot change',
            'Slot_Error_PastReschedule' => 'A slot cannot be moved into the past',
            'Slot_Error_SlotTaken' => 'Someone has just booked this slot — refresh the page',
            'Slot_Error_OnlyFreeDeletable' => 'Only a free slot can be deleted',
            'Slot_Error_PastNotDeletable' => 'A slot that has already passed cannot be deleted',
            'Slot_Error_DeleteLockedByBookings' => 'The slot has active bookings — cancel them first',
            'Slot_Error_MaxUsersBelowBooked' => 'There cannot be fewer seats than people already booked (%s)',
            'Slots_OwnHiddenNotice' => 'Your own sessions are not listed here — you cannot book yourself. They live under "My slots".',

            'Slot_Moved' => 'Slot moved successfully',
            'Slot_DragHint' => 'Drag free slots to move them to another day',
            'Slot_CannotDropPast' => 'Cannot move a slot to a past date',

            // Teaching Pending Bookings widget
            'Teaching_PendingBookingsTitle' => 'Pending Approval',
            'Teaching_NoPendingBookings' => 'No bookings awaiting approval',
            'Teaching_RejectBooking' => 'Reject',
            'Teaching_ConfirmedBookingsTitle' => 'Confirmed bookings',
            'Teaching_NoConfirmedBookings' => 'No confirmed bookings',

            // Slot status filter (expert calendar)
            'Slot_Filter_Pending' => 'Pending',

            // Slot detail modal
            'Slot_Details' => 'Session Details',
            'Slot_PricePaid' => 'Price',
            'Slot_CancelReason' => 'Cancellation Reason',
            'Slot_WriteExpert' => 'Message Expert',
            'Slot_CancelBooking' => 'Cancel Booking',
            'Slot_DateLabel' => 'Date & Time',

            // Slot pluralization
            'Slot_Plural_1' => 'slot',
            'Slot_Plural_2' => 'slots',
            'Slot_Plural_5' => 'slots',

            // Expert profile pagination
            'Expert_ShowMoreSlots' => 'Show more',
            'Expert_AllSlotsShown' => 'All slots shown',
            'Slot_BookError_Self' => 'You cannot book your own slot',
            'Slot_BookError_NotUser' => 'Only users can book slots',
            'Slot_BookError_Unavailable' => 'This slot is already taken or unavailable',
            'Slot_BookError_Past' => 'This time has already passed',
            'Slot_BookError_Busy' => 'The wallet is busy with another operation — try again in a moment',
            'Slot_BookError_AlreadyBooked' => 'You\'re already booked for this session',

            // SlotsCalendar
            'Slots_PageHint' => 'Pick a convenient slot from an expert this week or next',
        ];
    }
}
