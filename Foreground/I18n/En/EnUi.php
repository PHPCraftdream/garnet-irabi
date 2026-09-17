<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\I18n\En {
    /**
     * Подписи: Ui.
     *
     * Часть разложенного файла данных (был один на 1251 строк).
     * Комментарии над ключами — история формулировок: почему сказано
     * именно так, и какой дефект это исправляло. Они переезжают вместе
     * со своими ключами и без них не имеют смысла.
     */
    class EnUi {
        public static array $data = [
            'Reg_AccountType' => 'Account type',
            'Reg_AccountTypeExpert' => 'Expert',
            'Reg_AccountTypeUser' => 'User',

            'Menu_Teaching' => 'Teaching',
            'Menu_Bookings' => 'Bookings',

            'User_Individual' => 'Individual Session',
            'User_Group' => 'Group Session',

            'Finance_Filter_From' => 'From',
            'Finance_Filter_To' => 'To',
            'Finance_Filter_Type' => 'Type',
            'Finance_Filter_Note' => 'Note',
            'Finance_Filter_NoMatches' => 'No matches',

            'User_Status_Disabled' => 'Disabled',
            'User_Status_Approved' => 'Approved',
            'User_Loading' => 'Loading...',
            'User_LoadError' => 'Load error',
            'User_Balance' => 'Balance',
            'User_RegTime' => 'Registration',
            'User_LastOnline' => 'Online',
            'User_Anonymous' => 'User',
            'User_Disabled' => 'User #%s disabled',

            'General_Yes' => 'Yes',
            'General_No' => 'No',
            'General_Error' => 'Error',

            'Im_FileTooLarge' => 'File is too large. Limit is 25 MB per message.',
            'Im_NetworkError' => 'Cannot connect to the server',

            'Lightbox_Download' => 'Download',
            'Lightbox_Close' => 'Close',

            'Menu_Balance' => 'Balance',
            'Menu_Study' => 'Learning',
            'Menu_BrowseSlots' => 'Browse Slots',
            'Menu_ManageSlots' => 'Manage Slots',

            'Dashboard_Balance' => 'Balance',

            // Support
            'Menu_Support' => 'Support',
            'Unit_DayShort' => 'd',
            'Unit_HourShort' => 'h',
            'Unit_MinuteShort' => 'min',
            'MyReviews_Title' => 'My reviews',
            'Menu_Messages' => 'Messages',

            // Dashboard
            'Dash_Welcome' => 'Hi, %s!',
            'Dash_Role_User' => 'User',
            'Dash_Role_Expert' => 'Expert',
            'Dash_Role_Moderator' => 'Moderator',
            'Dash_Role_Owner' => 'Owner',
            'Dash_Upcoming' => 'My Upcoming Sessions',
            'Dash_StartLearning' => 'Start Learning',
            'Dash_Recommendations' => 'Recommendations',
            'Dash_ViewAll' => 'View All',
            'Feed_NoUpcoming' => 'No upcoming sessions',
            'Dash_ExpertSlots' => 'My Upcoming Slots',
            'Dash_PendingBookings' => 'Pending Confirmation',
            'Dash_Stats' => 'Statistics',
            'Dash_UsersThisMonth' => 'Users This Month',
            'Dash_EarningsThisMonth' => 'Earnings This Month',
            'Dash_OpenTickets' => 'Open Tickets',
            'Dash_PendingApprovals' => 'Experts Pending Approval',
            'Dash_TotalUsers' => 'Total Users',
            'Dash_BookingsThisMonth' => 'Bookings This Month',
            'Dash_UnreadSupport' => 'Unread Support Tickets',
            'Dash_UnreadMessages' => 'Unread Messages',
            'Dash_Booked' => 'booked',

            // Study Dashboard
            'Menu_StudyDashboard' => 'Overview',

            // User cancellations
            'User_Cancel_Title' => 'Cancel a confirmed booking',
            'User_Cancel_ReasonLabel' => 'Cancellation Reason',
            'User_Cancel_ReasonPlaceholder' => 'Enter cancellation reason...',
            'User_Cancel_ReasonRequired' => 'Please provide a reason',
            'User_Cancel_Submit' => 'Cancel Booking',
            'User_Cancel_Success' => 'Booking cancelled, balance refunded',
            'User_Withdraw_Card' => 'Withdraw request',
            'User_Withdraw_Title' => 'Withdraw an unconfirmed request',
            'User_Withdraw_ReasonLabel' => 'Reason for withdrawing',
            'User_Withdraw_ReasonPlaceholder' => 'Enter your reason...',
            'User_Withdraw_Submit' => 'Withdraw request',
            'User_Withdraw_Success' => 'Request withdrawn, balance refunded',
            'User_Cancel_Card' => 'Cancel booking',
            'User_Cancellations' => 'Cancelled after confirmation',
            'User_Declines' => 'Withdrawn before confirmation',
            'QuickChat_Title' => 'Quick Chat',
            'QuickChat_NoMessages' => 'No messages yet',
            'QuickChat_OpenProfile' => 'Open Profile',
            'QuickChat_AllMessages' => 'All Messages',

            // Generic actions
            'Action_Edit' => 'Edit',
            'Action_Delete' => 'Delete',
            'Action_Cancel' => 'Cancel',
            'Action_Close' => 'Close',
            'Action_Remove' => 'Remove',
            'Action_Add' => 'Add',
            'Filter_NoResults' => 'Nothing found',

            // User preview modal (foreground, generic)
            'Preview_UserTitle' => 'Profile',
            'Preview_Loading' => 'Loading...',
            'Preview_OpenProfile' => 'Open profile',
            'Preview_SendMessage' => 'Send message',
            'Preview_Specialization' => 'Specialization',
            'Preview_Bio' => 'About',
            'Preview_Rating' => 'Rating',
            'Preview_Conducted' => 'Conducted',
            'Preview_TotalBookings' => 'Upcoming',
            'Preview_Cancellations' => 'Cancellations',
            'Preview_CompletedBookings' => 'Completed',
            'Preview_RoleExpert' => 'Expert',
            'Preview_RoleUser' => 'User',

            // Pagination
            'Pagination_Prev' => 'Prev',
            'Pagination_Next' => 'Next',
            'Pagination_Of' => 'of',
            'Pagination_Items' => 'items',
            'Im_GoToDialogs' => 'Go to dialogs',

            'Profile_MyProfile' => 'My profile',
            'NotifPrefs_Title' => 'Email notifications',
            'NotifPrefs_Messages' => 'Personal messages',
            'NotifPrefs_Support' => 'Support',
            'NotifPrefs_Bookings' => 'Bookings',
            'NotifFreq_Each' => 'Every event',
            'NotifFreq_Hourly' => 'Once an hour',
            'NotifFreq_Daily' => 'Once a day',
            'NotifFreq_Off' => 'Off',
            'NotifPrefs_Saved' => 'Preferences saved',

            // AdminGrid i18n
            'Grid_Search' => 'Search...',
            'Grid_PrevPage' => 'Previous page',
            'Grid_NextPage' => 'Next page',
            'Grid_Items' => 'items',

            // Attachments: what may be attached, and why a given file was not.
            // The refusal arrives before sending, so it names the file.
            'Attach_Hint' => 'Up to %s files, %s MB each: images, PDF, TXT, LOG',
            'Attach_TooLarge' => '%s: larger than %s MB — not attached',
            'Attach_Empty' => '%s: the file is empty — not attached',
            'Attach_ExtNotAllowed' => '%s: files of this kind cannot be attached — not attached',
            'Attach_TooMany' => 'At most %s files can be attached — not attached: %s',

            // Accessibility (A11y)
            'A11y_CloseModal' => 'Close dialog',
            'A11y_RemoveAttachment' => 'Remove attachment',
            'A11y_AttachFiles' => 'Attach files',
            'A11y_PreviousImage' => 'Previous image',
            'A11y_NextImage' => 'Next image',
            'A11y_ImagePreview' => 'Image preview',
            'A11y_WriteMessage' => 'Write a message',
            'A11y_WriteComment' => 'Write a comment',
            'A11y_PriceMin' => 'Minimum price',
            'A11y_PriceMax' => 'Maximum price',

            'User_SupportTickets' => 'Support Tickets',
            'User_NoBookings' => 'No bookings',
            'User_ExpertCancellations' => 'Cancellations (expert)',
            'User_ExpertDeclines' => 'Declined (expert)',
            'User_UserCancellations' => 'Cancellations (user)',
            'User_UserDeclines' => 'Withdrawals (user)',
            'User_TicketSubject' => 'Subject',
            'User_TicketStatus' => 'Status',
            'User_TicketUpdated' => 'Updated',
            'User_LedgerParty' => 'Counterparty',
            'Settings_CancellationPenaltyPercent' => 'Cancellation penalty percent',
            'Settings_CancellationPenaltyHelp' => 'Share of the slot cost (0–100%) charged to the user when they cancel a confirmed booking. Used as the default for new slots; experts can override per slot.',
            'Registration_Disabled_Title' => 'Registration is temporarily closed',
            'Registration_Disabled' => 'New account creation is currently disabled. Contact an administrator.',
            'Footer_Contact' => 'Contact us:',

            'External_Title' => 'You are leaving %s',
            'External_Description' => 'This link points to an external site. We are not responsible for its content or security.',
            'External_Host' => 'Destination site',
            'External_FullUrl' => 'Full URL',
            'External_Continue' => 'Continue',
            'External_Cancel' => 'Cancel',
            'External_InvalidUrl' => 'Invalid URL',

            // A login link from an email is not a registration, so its failure
            // screen gets its own title: whoever follows it already has an
            // account, and "Registration unavailable" only confuses them.
            'MagicLink_Error_Title' => 'This login link is no longer valid',
            'MagicLink_Error_Guidance' => 'Request a new login code on the login page — the old link is no longer needed.',
            'MagicLink_Error_ContactSupport' => 'If the code never arrives, contact us:',
        ];
    }
}
