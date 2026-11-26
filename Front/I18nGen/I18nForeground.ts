// noinspection DuplicatedCode
import {I18nDataRU} from './I18nDataRU';
import {I18nDataEN} from './I18nDataEN';
import {I18nBase} from '@common/Utils/I18nBase';

/** Translation lookup function signature. */
type t = (args?: (string|number)[]) => string;

/** Provides typed access to this bundle's translations. */
class I18n extends I18nBase {
    /** Translation lookup for `Admin_Users`. */
    Admin_Users: t = (a = []) => this.t('Admin_Users', a);
    /** Translation lookup for `Admin_Tab_All`. */
    Admin_Tab_All: t = (a = []) => this.t('Admin_Tab_All', a);
    /** Translation lookup for `Admin_Tab_Experts`. */
    Admin_Tab_Experts: t = (a = []) => this.t('Admin_Tab_Experts', a);
    /** Translation lookup for `Admin_Tab_Users`. */
    Admin_Tab_Users: t = (a = []) => this.t('Admin_Tab_Users', a);
    /** Translation lookup for `Admin_Tab_Moderators`. */
    Admin_Tab_Moderators: t = (a = []) => this.t('Admin_Tab_Moderators', a);
    /** Translation lookup for `Admin_Tab_Owners`. */
    Admin_Tab_Owners: t = (a = []) => this.t('Admin_Tab_Owners', a);
    /** Translation lookup for `Admin_Tab_Admins`. */
    Admin_Tab_Admins: t = (a = []) => this.t('Admin_Tab_Admins', a);
    /** Translation lookup for `Admin_NoUsers`. */
    Admin_NoUsers: t = (a = []) => this.t('Admin_NoUsers', a);
    /** Translation lookup for `Admin_Activity`. */
    Admin_Activity: t = (a = []) => this.t('Admin_Activity', a);
    /** Translation lookup for `Admin_Approve`. */
    Admin_Approve: t = (a = []) => this.t('Admin_Approve', a);
    /** Translation lookup for `Admin_Disable`. */
    Admin_Disable: t = (a = []) => this.t('Admin_Disable', a);
    /** Translation lookup for `Admin_Enable`. */
    Admin_Enable: t = (a = []) => this.t('Admin_Enable', a);
    /** Translation lookup for `Admin_Grant`. */
    Admin_Grant: t = (a = []) => this.t('Admin_Grant', a);
    /** Translation lookup for `Admin_Revoke`. */
    Admin_Revoke: t = (a = []) => this.t('Admin_Revoke', a);
    /** Translation lookup for `Admin_Flag_Approve`. */
    Admin_Flag_Approve: t = (a = []) => this.t('Admin_Flag_Approve', a);
    /** Translation lookup for `Admin_Flag_RevokeApproval`. */
    Admin_Flag_RevokeApproval: t = (a = []) => this.t('Admin_Flag_RevokeApproval', a);
    /** Translation lookup for `Admin_Flag_Disable`. */
    Admin_Flag_Disable: t = (a = []) => this.t('Admin_Flag_Disable', a);
    /** Translation lookup for `Admin_Flag_Enable`. */
    Admin_Flag_Enable: t = (a = []) => this.t('Admin_Flag_Enable', a);
    /** Translation lookup for `Admin_Flag_GrantModerator`. */
    Admin_Flag_GrantModerator: t = (a = []) => this.t('Admin_Flag_GrantModerator', a);
    /** Translation lookup for `Admin_Flag_RevokeModerator`. */
    Admin_Flag_RevokeModerator: t = (a = []) => this.t('Admin_Flag_RevokeModerator', a);
    /** Translation lookup for `Admin_Flag_GrantOwner`. */
    Admin_Flag_GrantOwner: t = (a = []) => this.t('Admin_Flag_GrantOwner', a);
    /** Translation lookup for `Admin_Flag_RevokeOwner`. */
    Admin_Flag_RevokeOwner: t = (a = []) => this.t('Admin_Flag_RevokeOwner', a);
    /** Translation lookup for `Admin_Flag_GrantAdmin`. */
    Admin_Flag_GrantAdmin: t = (a = []) => this.t('Admin_Flag_GrantAdmin', a);
    /** Translation lookup for `Admin_Flag_RevokeAdmin`. */
    Admin_Flag_RevokeAdmin: t = (a = []) => this.t('Admin_Flag_RevokeAdmin', a);
    /** Translation lookup for `Admin_Flag_RemoveAdminFirst`. */
    Admin_Flag_RemoveAdminFirst: t = (a = []) => this.t('Admin_Flag_RemoveAdminFirst', a);
    /** Translation lookup for `Admin_Flag_OwnerHasModeratorRights`. */
    Admin_Flag_OwnerHasModeratorRights: t = (a = []) => this.t('Admin_Flag_OwnerHasModeratorRights', a);
    /** Translation lookup for `Admin_Flag_TargetOutranksYou`. */
    Admin_Flag_TargetOutranksYou: t = (a = []) => this.t('Admin_Flag_TargetOutranksYou', a);
    /** Translation lookup for `Admin_Flag_GrantExpert`. */
    Admin_Flag_GrantExpert: t = (a = []) => this.t('Admin_Flag_GrantExpert', a);
    /** Translation lookup for `Admin_Flag_RevokeExpert`. */
    Admin_Flag_RevokeExpert: t = (a = []) => this.t('Admin_Flag_RevokeExpert', a);
    /** Translation lookup for `Admin_Role_Owner`. */
    Admin_Role_Owner: t = (a = []) => this.t('Admin_Role_Owner', a);
    /** Translation lookup for `Admin_Role_Moderator`. */
    Admin_Role_Moderator: t = (a = []) => this.t('Admin_Role_Moderator', a);
    /** Translation lookup for `Admin_Role_Admin`. */
    Admin_Role_Admin: t = (a = []) => this.t('Admin_Role_Admin', a);
    /** Translation lookup for `Admin_Logs`. */
    Admin_Logs: t = (a = []) => this.t('Admin_Logs', a);
    /** Translation lookup for `Admin_Log_Actor`. */
    Admin_Log_Actor: t = (a = []) => this.t('Admin_Log_Actor', a);
    /** Translation lookup for `Admin_Log_Target`. */
    Admin_Log_Target: t = (a = []) => this.t('Admin_Log_Target', a);
    /** Translation lookup for `Admin_Log_Action`. */
    Admin_Log_Action: t = (a = []) => this.t('Admin_Log_Action', a);
    /** Translation lookup for `Admin_Log_OldValue`. */
    Admin_Log_OldValue: t = (a = []) => this.t('Admin_Log_OldValue', a);
    /** Translation lookup for `Admin_Log_NewValue`. */
    Admin_Log_NewValue: t = (a = []) => this.t('Admin_Log_NewValue', a);
    /** Translation lookup for `Admin_Log_CreatedAt`. */
    Admin_Log_CreatedAt: t = (a = []) => this.t('Admin_Log_CreatedAt', a);
    /** Translation lookup for `Admin_Log_Empty`. */
    Admin_Log_Empty: t = (a = []) => this.t('Admin_Log_Empty', a);
    /** Translation lookup for `Admin_MailLog`. */
    Admin_MailLog: t = (a = []) => this.t('Admin_MailLog', a);
    /** Translation lookup for `Admin_MailLog_Date`. */
    Admin_MailLog_Date: t = (a = []) => this.t('Admin_MailLog_Date', a);
    /** Translation lookup for `Admin_MailLog_Recipient`. */
    Admin_MailLog_Recipient: t = (a = []) => this.t('Admin_MailLog_Recipient', a);
    /** Translation lookup for `Admin_MailLog_Type`. */
    Admin_MailLog_Type: t = (a = []) => this.t('Admin_MailLog_Type', a);
    /** Translation lookup for `Admin_MailLog_Subject`. */
    Admin_MailLog_Subject: t = (a = []) => this.t('Admin_MailLog_Subject', a);
    /** Translation lookup for `Admin_MailLog_Status`. */
    Admin_MailLog_Status: t = (a = []) => this.t('Admin_MailLog_Status', a);
    /** Translation lookup for `Admin_MailLog_Error`. */
    Admin_MailLog_Error: t = (a = []) => this.t('Admin_MailLog_Error', a);
    /** Translation lookup for `Admin_MailLog_Empty`. */
    Admin_MailLog_Empty: t = (a = []) => this.t('Admin_MailLog_Empty', a);
    /** Translation lookup for `Admin_MailLog_Filter_All`. */
    Admin_MailLog_Filter_All: t = (a = []) => this.t('Admin_MailLog_Filter_All', a);
    /** Translation lookup for `Admin_MailLog_Filter_Recipient`. */
    Admin_MailLog_Filter_Recipient: t = (a = []) => this.t('Admin_MailLog_Filter_Recipient', a);
    /** Translation lookup for `Admin_MailLog_Filter_Status`. */
    Admin_MailLog_Filter_Status: t = (a = []) => this.t('Admin_MailLog_Filter_Status', a);
    /** Translation lookup for `Admin_MailLog_Filter_Subject`. */
    Admin_MailLog_Filter_Subject: t = (a = []) => this.t('Admin_MailLog_Filter_Subject', a);
    /** Translation lookup for `Admin_MailLog_Filter_Type`. */
    Admin_MailLog_Filter_Type: t = (a = []) => this.t('Admin_MailLog_Filter_Type', a);
    /** Translation lookup for `Admin_MailLog_Filter_NoAccount`. */
    Admin_MailLog_Filter_NoAccount: t = (a = []) => this.t('Admin_MailLog_Filter_NoAccount', a);
    /** Translation lookup for `Admin_MailLog_Filter_SearchUser`. */
    Admin_MailLog_Filter_SearchUser: t = (a = []) => this.t('Admin_MailLog_Filter_SearchUser', a);
    /** Translation lookup for `Admin_MailLog_Filter_NoMatches`. */
    Admin_MailLog_Filter_NoMatches: t = (a = []) => this.t('Admin_MailLog_Filter_NoMatches', a);
    /** Translation lookup for `Admin_MailLog_Body`. */
    Admin_MailLog_Body: t = (a = []) => this.t('Admin_MailLog_Body', a);
    /** Translation lookup for `Admin_EmailQueue`. */
    Admin_EmailQueue: t = (a = []) => this.t('Admin_EmailQueue', a);
    /** Translation lookup for `Admin_EmailQueue_Title`. */
    Admin_EmailQueue_Title: t = (a = []) => this.t('Admin_EmailQueue_Title', a);
    /** Translation lookup for `Admin_EmailQueue_Attempts`. */
    Admin_EmailQueue_Attempts: t = (a = []) => this.t('Admin_EmailQueue_Attempts', a);
    /** Translation lookup for `Admin_EmailQueue_MaxAttempts`. */
    Admin_EmailQueue_MaxAttempts: t = (a = []) => this.t('Admin_EmailQueue_MaxAttempts', a);
    /** Translation lookup for `Admin_EmailQueue_NextAttempt`. */
    Admin_EmailQueue_NextAttempt: t = (a = []) => this.t('Admin_EmailQueue_NextAttempt', a);
    /** Translation lookup for `Admin_EmailQueue_DeadLetterBanner`. */
    Admin_EmailQueue_DeadLetterBanner: t = (a = []) => this.t('Admin_EmailQueue_DeadLetterBanner', a);
    /** Translation lookup for `Admin_EmailQueue_Empty`. */
    Admin_EmailQueue_Empty: t = (a = []) => this.t('Admin_EmailQueue_Empty', a);
    /** Translation lookup for `Admin_EmailQueue_Retry`. */
    Admin_EmailQueue_Retry: t = (a = []) => this.t('Admin_EmailQueue_Retry', a);
    /** Translation lookup for `Admin_EmailQueue_RetryDone`. */
    Admin_EmailQueue_RetryDone: t = (a = []) => this.t('Admin_EmailQueue_RetryDone', a);
    /** Translation lookup for `Admin_EmailQueue_RetryFail`. */
    Admin_EmailQueue_RetryFail: t = (a = []) => this.t('Admin_EmailQueue_RetryFail', a);
    /** Translation lookup for `Admin_RequestLog`. */
    Admin_RequestLog: t = (a = []) => this.t('Admin_RequestLog', a);
    /** Translation lookup for `Admin_Bookings`. */
    Admin_Bookings: t = (a = []) => this.t('Admin_Bookings', a);
    /** Translation lookup for `Admin_Finance`. */
    Admin_Finance: t = (a = []) => this.t('Admin_Finance', a);
    /** Translation lookup for `Admin_Balances`. */
    Admin_Balances: t = (a = []) => this.t('Admin_Balances', a);
    /** Translation lookup for `Admin_FinanceTab_Finance`. */
    Admin_FinanceTab_Finance: t = (a = []) => this.t('Admin_FinanceTab_Finance', a);
    /** Translation lookup for `Admin_FinanceTab_Balances`. */
    Admin_FinanceTab_Balances: t = (a = []) => this.t('Admin_FinanceTab_Balances', a);
    /** Translation lookup for `Admin_NoBookings`. */
    Admin_NoBookings: t = (a = []) => this.t('Admin_NoBookings', a);
    /** Translation lookup for `Admin_NoLedger`. */
    Admin_NoLedger: t = (a = []) => this.t('Admin_NoLedger', a);
    /** Translation lookup for `Admin_NoBalances`. */
    Admin_NoBalances: t = (a = []) => this.t('Admin_NoBalances', a);
    /** Translation lookup for `Admin_Booking_User`. */
    Admin_Booking_User: t = (a = []) => this.t('Admin_Booking_User', a);
    /** Translation lookup for `Admin_Booking_Slot`. */
    Admin_Booking_Slot: t = (a = []) => this.t('Admin_Booking_Slot', a);
    /** Translation lookup for `Admin_Booking_Status`. */
    Admin_Booking_Status: t = (a = []) => this.t('Admin_Booking_Status', a);
    /** Translation lookup for `Admin_Booking_Created`. */
    Admin_Booking_Created: t = (a = []) => this.t('Admin_Booking_Created', a);
    /** Translation lookup for `Admin_Balance_Account`. */
    Admin_Balance_Account: t = (a = []) => this.t('Admin_Balance_Account', a);
    /** Translation lookup for `Admin_Balance_Balance`. */
    Admin_Balance_Balance: t = (a = []) => this.t('Admin_Balance_Balance', a);
    /** Translation lookup for `Admin_Balance_Updated`. */
    Admin_Balance_Updated: t = (a = []) => this.t('Admin_Balance_Updated', a);
    /** Translation lookup for `Admin_Balance_Adjust`. */
    Admin_Balance_Adjust: t = (a = []) => this.t('Admin_Balance_Adjust', a);
    /** Translation lookup for `Admin_Balance_AdjustTitle`. */
    Admin_Balance_AdjustTitle: t = (a = []) => this.t('Admin_Balance_AdjustTitle', a);
    /** Translation lookup for `Admin_Balance_AdjustAmount`. */
    Admin_Balance_AdjustAmount: t = (a = []) => this.t('Admin_Balance_AdjustAmount', a);
    /** Translation lookup for `Admin_Balance_AdjustDirection`. */
    Admin_Balance_AdjustDirection: t = (a = []) => this.t('Admin_Balance_AdjustDirection', a);
    /** Translation lookup for `Admin_Balance_AdjustCredit`. */
    Admin_Balance_AdjustCredit: t = (a = []) => this.t('Admin_Balance_AdjustCredit', a);
    /** Translation lookup for `Admin_Balance_AdjustDebit`. */
    Admin_Balance_AdjustDebit: t = (a = []) => this.t('Admin_Balance_AdjustDebit', a);
    /** Translation lookup for `Admin_Balance_AdjustNote`. */
    Admin_Balance_AdjustNote: t = (a = []) => this.t('Admin_Balance_AdjustNote', a);
    /** Translation lookup for `Admin_Balance_AdjustNoteHint`. */
    Admin_Balance_AdjustNoteHint: t = (a = []) => this.t('Admin_Balance_AdjustNoteHint', a);
    /** Translation lookup for `Admin_Balance_AdjustSave`. */
    Admin_Balance_AdjustSave: t = (a = []) => this.t('Admin_Balance_AdjustSave', a);
    /** Translation lookup for `Admin_Balance_AdjustCancel`. */
    Admin_Balance_AdjustCancel: t = (a = []) => this.t('Admin_Balance_AdjustCancel', a);
    /** Translation lookup for `Admin_Balance_AdjustSuccess`. */
    Admin_Balance_AdjustSuccess: t = (a = []) => this.t('Admin_Balance_AdjustSuccess', a);
    /** Translation lookup for `Admin_Balance_AdjustNoteRequired`. */
    Admin_Balance_AdjustNoteRequired: t = (a = []) => this.t('Admin_Balance_AdjustNoteRequired', a);
    /** Translation lookup for `Admin_Balance_AdjustAmountRequired`. */
    Admin_Balance_AdjustAmountRequired: t = (a = []) => this.t('Admin_Balance_AdjustAmountRequired', a);
    /** Translation lookup for `Admin_Balance_AdjustCurrentBalance`. */
    Admin_Balance_AdjustCurrentBalance: t = (a = []) => this.t('Admin_Balance_AdjustCurrentBalance', a);
    /** Translation lookup for `Admin_Ledger_Date`. */
    Admin_Ledger_Date: t = (a = []) => this.t('Admin_Ledger_Date', a);
    /** Translation lookup for `Admin_Ledger_Type`. */
    Admin_Ledger_Type: t = (a = []) => this.t('Admin_Ledger_Type', a);
    /** Translation lookup for `Admin_Ledger_Direction`. */
    Admin_Ledger_Direction: t = (a = []) => this.t('Admin_Ledger_Direction', a);
    /** Translation lookup for `Admin_Ledger_Amount`. */
    Admin_Ledger_Amount: t = (a = []) => this.t('Admin_Ledger_Amount', a);
    /** Translation lookup for `Admin_Ledger_Note`. */
    Admin_Ledger_Note: t = (a = []) => this.t('Admin_Ledger_Note', a);
    /** Translation lookup for `Admin_Ledger_From`. */
    Admin_Ledger_From: t = (a = []) => this.t('Admin_Ledger_From', a);
    /** Translation lookup for `Admin_Ledger_To`. */
    Admin_Ledger_To: t = (a = []) => this.t('Admin_Ledger_To', a);
    /** Translation lookup for `Admin_Ledger_Credit`. */
    Admin_Ledger_Credit: t = (a = []) => this.t('Admin_Ledger_Credit', a);
    /** Translation lookup for `Admin_Ledger_Debit`. */
    Admin_Ledger_Debit: t = (a = []) => this.t('Admin_Ledger_Debit', a);
    /** Translation lookup for `Admin_Filter_Expert`. */
    Admin_Filter_Expert: t = (a = []) => this.t('Admin_Filter_Expert', a);
    /** Translation lookup for `Admin_Filter_User`. */
    Admin_Filter_User: t = (a = []) => this.t('Admin_Filter_User', a);
    /** Translation lookup for `Admin_Filter_DateFrom`. */
    Admin_Filter_DateFrom: t = (a = []) => this.t('Admin_Filter_DateFrom', a);
    /** Translation lookup for `Admin_Filter_DateTo`. */
    Admin_Filter_DateTo: t = (a = []) => this.t('Admin_Filter_DateTo', a);
    /** Translation lookup for `Admin_Filter_All`. */
    Admin_Filter_All: t = (a = []) => this.t('Admin_Filter_All', a);
    /** Translation lookup for `Admin_Filter_ResetAll`. */
    Admin_Filter_ResetAll: t = (a = []) => this.t('Admin_Filter_ResetAll', a);
    /** Translation lookup for `Admin_Filter_SearchUser`. */
    Admin_Filter_SearchUser: t = (a = []) => this.t('Admin_Filter_SearchUser', a);
    /** Translation lookup for `Admin_Filter_Assignee`. */
    Admin_Filter_Assignee: t = (a = []) => this.t('Admin_Filter_Assignee', a);
    /** Translation lookup for `Admin_Filter_DateBy`. */
    Admin_Filter_DateBy: t = (a = []) => this.t('Admin_Filter_DateBy', a);
    /** Translation lookup for `Admin_Filter_DateCreated`. */
    Admin_Filter_DateCreated: t = (a = []) => this.t('Admin_Filter_DateCreated', a);
    /** Translation lookup for `Admin_Filter_DateUpdated`. */
    Admin_Filter_DateUpdated: t = (a = []) => this.t('Admin_Filter_DateUpdated', a);
    /** Translation lookup for `Admin_Filter_SearchExpert`. */
    Admin_Filter_SearchExpert: t = (a = []) => this.t('Admin_Filter_SearchExpert', a);
    /** Translation lookup for `Admin_Filter_SearchID`. */
    Admin_Filter_SearchID: t = (a = []) => this.t('Admin_Filter_SearchID', a);
    /** Translation lookup for `Admin_Filter_Status`. */
    Admin_Filter_Status: t = (a = []) => this.t('Admin_Filter_Status', a);
    /** Translation lookup for `Admin_Filter_Reason`. */
    Admin_Filter_Reason: t = (a = []) => this.t('Admin_Filter_Reason', a);
    /** Translation lookup for `Admin_Filter_SelectExpert`. */
    Admin_Filter_SelectExpert: t = (a = []) => this.t('Admin_Filter_SelectExpert', a);
    /** Translation lookup for `Admin_Filter_SelectUser`. */
    Admin_Filter_SelectUser: t = (a = []) => this.t('Admin_Filter_SelectUser', a);
    /** Translation lookup for `Admin_Support`. */
    Admin_Support: t = (a = []) => this.t('Admin_Support', a);
    /** Translation lookup for `Admin_Comments`. */
    Admin_Comments: t = (a = []) => this.t('Admin_Comments', a);
    /** Translation lookup for `Admin_CommentsTitle`. */
    Admin_CommentsTitle: t = (a = []) => this.t('Admin_CommentsTitle', a);
    /** Translation lookup for `Admin_Dashboard`. */
    Admin_Dashboard: t = (a = []) => this.t('Admin_Dashboard', a);
    /** Translation lookup for `Admin_OpenTickets`. */
    Admin_OpenTickets: t = (a = []) => this.t('Admin_OpenTickets', a);
    /** Translation lookup for `Admin_PendingApprovals`. */
    Admin_PendingApprovals: t = (a = []) => this.t('Admin_PendingApprovals', a);
    /** Translation lookup for `Admin_PlatformStats`. */
    Admin_PlatformStats: t = (a = []) => this.t('Admin_PlatformStats', a);
    /** Translation lookup for `Admin_RecentActivity`. */
    Admin_RecentActivity: t = (a = []) => this.t('Admin_RecentActivity', a);
    /** Translation lookup for `Admin_TotalExperts`. */
    Admin_TotalExperts: t = (a = []) => this.t('Admin_TotalExperts', a);
    /** Translation lookup for `Admin_MonthlyRevenue`. */
    Admin_MonthlyRevenue: t = (a = []) => this.t('Admin_MonthlyRevenue', a);
    /** Translation lookup for `Admin_NoActivity`. */
    Admin_NoActivity: t = (a = []) => this.t('Admin_NoActivity', a);
    /** Translation lookup for `Admin_Cancellations`. */
    Admin_Cancellations: t = (a = []) => this.t('Admin_Cancellations', a);
    /** Translation lookup for `Admin_CancellationsTab_Expert`. */
    Admin_CancellationsTab_Expert: t = (a = []) => this.t('Admin_CancellationsTab_Expert', a);
    /** Translation lookup for `Admin_CancellationsTab_User`. */
    Admin_CancellationsTab_User: t = (a = []) => this.t('Admin_CancellationsTab_User', a);
    /** Translation lookup for `Admin_CancellationsTab`. */
    Admin_CancellationsTab: t = (a = []) => this.t('Admin_CancellationsTab', a);
    /** Translation lookup for `Admin_NoCancellations`. */
    Admin_NoCancellations: t = (a = []) => this.t('Admin_NoCancellations', a);
    /** Translation lookup for `Admin_Cancel_Expert`. */
    Admin_Cancel_Expert: t = (a = []) => this.t('Admin_Cancel_Expert', a);
    /** Translation lookup for `Admin_Cancel_User`. */
    Admin_Cancel_User: t = (a = []) => this.t('Admin_Cancel_User', a);
    /** Translation lookup for `Admin_Cancel_SlotTime`. */
    Admin_Cancel_SlotTime: t = (a = []) => this.t('Admin_Cancel_SlotTime', a);
    /** Translation lookup for `Admin_Cancel_Reason`. */
    Admin_Cancel_Reason: t = (a = []) => this.t('Admin_Cancel_Reason', a);
    /** Translation lookup for `Admin_Cancel_Date`. */
    Admin_Cancel_Date: t = (a = []) => this.t('Admin_Cancel_Date', a);
    /** Translation lookup for `Admin_Slots`. */
    Admin_Slots: t = (a = []) => this.t('Admin_Slots', a);
    /** Translation lookup for `Admin_Bookings_Tab_Slots`. */
    Admin_Bookings_Tab_Slots: t = (a = []) => this.t('Admin_Bookings_Tab_Slots', a);
    /** Translation lookup for `Admin_Bookings_Tab_Bookings`. */
    Admin_Bookings_Tab_Bookings: t = (a = []) => this.t('Admin_Bookings_Tab_Bookings', a);
    /** Translation lookup for `Admin_Bookings_Tab_ExpertCancellations`. */
    Admin_Bookings_Tab_ExpertCancellations: t = (a = []) => this.t('Admin_Bookings_Tab_ExpertCancellations', a);
    /** Translation lookup for `Admin_Bookings_Tab_UserCancellations`. */
    Admin_Bookings_Tab_UserCancellations: t = (a = []) => this.t('Admin_Bookings_Tab_UserCancellations', a);
    /** Translation lookup for `Admin_Slot_Expert`. */
    Admin_Slot_Expert: t = (a = []) => this.t('Admin_Slot_Expert', a);
    /** Translation lookup for `Admin_Slot_Time`. */
    Admin_Slot_Time: t = (a = []) => this.t('Admin_Slot_Time', a);
    /** Translation lookup for `Admin_Slot_Duration`. */
    Admin_Slot_Duration: t = (a = []) => this.t('Admin_Slot_Duration', a);
    /** Translation lookup for `Admin_Slot_Cost`. */
    Admin_Slot_Cost: t = (a = []) => this.t('Admin_Slot_Cost', a);
    /** Translation lookup for `Admin_Slot_Location`. */
    Admin_Slot_Location: t = (a = []) => this.t('Admin_Slot_Location', a);
    /** Translation lookup for `Admin_Slot_MaxUsers`. */
    Admin_Slot_MaxUsers: t = (a = []) => this.t('Admin_Slot_MaxUsers', a);
    /** Translation lookup for `Admin_Slot_Online`. */
    Admin_Slot_Online: t = (a = []) => this.t('Admin_Slot_Online', a);
    /** Translation lookup for `Admin_NoSlots`. */
    Admin_NoSlots: t = (a = []) => this.t('Admin_NoSlots', a);
    /** Translation lookup for `Admin_NoUserCancellations`. */
    Admin_NoUserCancellations: t = (a = []) => this.t('Admin_NoUserCancellations', a);
    /** Translation lookup for `Admin_WriteToUser`. */
    Admin_WriteToUser: t = (a = []) => this.t('Admin_WriteToUser', a);
    /** Translation lookup for `Admin_RemovePhoto`. */
    Admin_RemovePhoto: t = (a = []) => this.t('Admin_RemovePhoto', a);
    /** Translation lookup for `Admin_RemovePhotoConfirm`. */
    Admin_RemovePhotoConfirm: t = (a = []) => this.t('Admin_RemovePhotoConfirm', a);
    /** Translation lookup for `Admin_RemovePhotoDone`. */
    Admin_RemovePhotoDone: t = (a = []) => this.t('Admin_RemovePhotoDone', a);
    /** Translation lookup for `Admin_ClearUser`. */
    Admin_ClearUser: t = (a = []) => this.t('Admin_ClearUser', a);
    /** Translation lookup for `Admin_ClearUserTitle`. */
    Admin_ClearUserTitle: t = (a = []) => this.t('Admin_ClearUserTitle', a);
    /** Translation lookup for `Admin_ClearUserModalTitle`. */
    Admin_ClearUserModalTitle: t = (a = []) => this.t('Admin_ClearUserModalTitle', a);
    /** Translation lookup for `Admin_ClearUserModalBody`. */
    Admin_ClearUserModalBody: t = (a = []) => this.t('Admin_ClearUserModalBody', a);
    /** Translation lookup for `Admin_ClearUserTypeEmail`. */
    Admin_ClearUserTypeEmail: t = (a = []) => this.t('Admin_ClearUserTypeEmail', a);
    /** Translation lookup for `Admin_ClearUserTypeEmailHint`. */
    Admin_ClearUserTypeEmailHint: t = (a = []) => this.t('Admin_ClearUserTypeEmailHint', a);
    /** Translation lookup for `Admin_ClearUserMismatch`. */
    Admin_ClearUserMismatch: t = (a = []) => this.t('Admin_ClearUserMismatch', a);
    /** Translation lookup for `Admin_ClearUserDone`. */
    Admin_ClearUserDone: t = (a = []) => this.t('Admin_ClearUserDone', a);
    /** Translation lookup for `Admin_PublicProfile`. */
    Admin_PublicProfile: t = (a = []) => this.t('Admin_PublicProfile', a);
    /** Translation lookup for `Admin_History`. */
    Admin_History: t = (a = []) => this.t('Admin_History', a);
    /** Translation lookup for `Admin_History_Empty`. */
    Admin_History_Empty: t = (a = []) => this.t('Admin_History_Empty', a);
    /** Translation lookup for `Admin_History_When`. */
    Admin_History_When: t = (a = []) => this.t('Admin_History_When', a);
    /** Translation lookup for `Admin_History_Actor`. */
    Admin_History_Actor: t = (a = []) => this.t('Admin_History_Actor', a);
    /** Translation lookup for `Admin_History_Action`. */
    Admin_History_Action: t = (a = []) => this.t('Admin_History_Action', a);
    /** Translation lookup for `Admin_History_Changes`. */
    Admin_History_Changes: t = (a = []) => this.t('Admin_History_Changes', a);
    /** Translation lookup for `Admin_MessageSubject`. */
    Admin_MessageSubject: t = (a = []) => this.t('Admin_MessageSubject', a);
    /** Translation lookup for `Admin_MessageBody`. */
    Admin_MessageBody: t = (a = []) => this.t('Admin_MessageBody', a);
    /** Translation lookup for `Admin_MessageSent`. */
    Admin_MessageSent: t = (a = []) => this.t('Admin_MessageSent', a);
    /** Translation lookup for `Admin_SystemSettings`. */
    Admin_SystemSettings: t = (a = []) => this.t('Admin_SystemSettings', a);
    /** Translation lookup for `Admin_SystemSettings_Description`. */
    Admin_SystemSettings_Description: t = (a = []) => this.t('Admin_SystemSettings_Description', a);
    /** Translation lookup for `Admin_RegistrationSettings`. */
    Admin_RegistrationSettings: t = (a = []) => this.t('Admin_RegistrationSettings', a);
    /** Translation lookup for `Admin_RegistrationEnabled`. */
    Admin_RegistrationEnabled: t = (a = []) => this.t('Admin_RegistrationEnabled', a);
    /** Translation lookup for `Admin_RegistrationEnabled_Hint`. */
    Admin_RegistrationEnabled_Hint: t = (a = []) => this.t('Admin_RegistrationEnabled_Hint', a);
    /** Translation lookup for `Admin_SMTPSettings`. */
    Admin_SMTPSettings: t = (a = []) => this.t('Admin_SMTPSettings', a);
    /** Translation lookup for `Admin_SMTPSettings_Hint`. */
    Admin_SMTPSettings_Hint: t = (a = []) => this.t('Admin_SMTPSettings_Hint', a);
    /** Translation lookup for `Admin_SMTPEnabled`. */
    Admin_SMTPEnabled: t = (a = []) => this.t('Admin_SMTPEnabled', a);
    /** Translation lookup for `Admin_SMTPEnabled_Hint`. */
    Admin_SMTPEnabled_Hint: t = (a = []) => this.t('Admin_SMTPEnabled_Hint', a);
    /** Translation lookup for `Admin_SMTPVerifyPeer`. */
    Admin_SMTPVerifyPeer: t = (a = []) => this.t('Admin_SMTPVerifyPeer', a);
    /** Translation lookup for `Admin_SMTPScheme`. */
    Admin_SMTPScheme: t = (a = []) => this.t('Admin_SMTPScheme', a);
    /** Translation lookup for `Admin_SMTPHost`. */
    Admin_SMTPHost: t = (a = []) => this.t('Admin_SMTPHost', a);
    /** Translation lookup for `Admin_SMTPPort`. */
    Admin_SMTPPort: t = (a = []) => this.t('Admin_SMTPPort', a);
    /** Translation lookup for `Admin_SMTPUser`. */
    Admin_SMTPUser: t = (a = []) => this.t('Admin_SMTPUser', a);
    /** Translation lookup for `Admin_SMTPPassword`. */
    Admin_SMTPPassword: t = (a = []) => this.t('Admin_SMTPPassword', a);
    /** Translation lookup for `Admin_SMTPFrom`. */
    Admin_SMTPFrom: t = (a = []) => this.t('Admin_SMTPFrom', a);
    /** Translation lookup for `Admin_SaveSettings`. */
    Admin_SaveSettings: t = (a = []) => this.t('Admin_SaveSettings', a);
    /** Translation lookup for `Admin_SaveSettings_Saving`. */
    Admin_SaveSettings_Saving: t = (a = []) => this.t('Admin_SaveSettings_Saving', a);
    /** Translation lookup for `Admin_SaveSettings_Success`. */
    Admin_SaveSettings_Success: t = (a = []) => this.t('Admin_SaveSettings_Success', a);
    /** Translation lookup for `Admin_SystemSettings_AccessDenied`. */
    Admin_SystemSettings_AccessDenied: t = (a = []) => this.t('Admin_SystemSettings_AccessDenied', a);
    /** Translation lookup for `Admin_SystemSettings_InvalidPort`. */
    Admin_SystemSettings_InvalidPort: t = (a = []) => this.t('Admin_SystemSettings_InvalidPort', a);
    /** Translation lookup for `Admin_SystemSettings_MissingSmtpField`. */
    Admin_SystemSettings_MissingSmtpField: t = (a = []) => this.t('Admin_SystemSettings_MissingSmtpField', a);
    /** Translation lookup for `Admin_SystemSettings_TestEmail_Title`. */
    Admin_SystemSettings_TestEmail_Title: t = (a = []) => this.t('Admin_SystemSettings_TestEmail_Title', a);
    /** Translation lookup for `Admin_SystemSettings_TestEmail_Hint`. */
    Admin_SystemSettings_TestEmail_Hint: t = (a = []) => this.t('Admin_SystemSettings_TestEmail_Hint', a);
    /** Translation lookup for `Admin_SystemSettings_TestEmail_Address`. */
    Admin_SystemSettings_TestEmail_Address: t = (a = []) => this.t('Admin_SystemSettings_TestEmail_Address', a);
    /** Translation lookup for `Admin_SystemSettings_TestEmail_Placeholder`. */
    Admin_SystemSettings_TestEmail_Placeholder: t = (a = []) => this.t('Admin_SystemSettings_TestEmail_Placeholder', a);
    /** Translation lookup for `Admin_SystemSettings_TestEmail_Send`. */
    Admin_SystemSettings_TestEmail_Send: t = (a = []) => this.t('Admin_SystemSettings_TestEmail_Send', a);
    /** Translation lookup for `Admin_SystemSettings_TestEmail_Sending`. */
    Admin_SystemSettings_TestEmail_Sending: t = (a = []) => this.t('Admin_SystemSettings_TestEmail_Sending', a);
    /** Translation lookup for `Admin_SystemSettings_TestEmail_Success`. */
    Admin_SystemSettings_TestEmail_Success: t = (a = []) => this.t('Admin_SystemSettings_TestEmail_Success', a);
    /** Translation lookup for `Admin_SystemSettings_TestEmail_InvalidAddress`. */
    Admin_SystemSettings_TestEmail_InvalidAddress: t = (a = []) =>
        this.t('Admin_SystemSettings_TestEmail_InvalidAddress', a);
    /** Translation lookup for `Admin_SystemSettings_TestEmail_SendFailed`. */
    Admin_SystemSettings_TestEmail_SendFailed: t = (a = []) => this.t('Admin_SystemSettings_TestEmail_SendFailed', a);
    /** Translation lookup for `Admin_SystemSettings_TestEmail_Subject`. */
    Admin_SystemSettings_TestEmail_Subject: t = (a = []) => this.t('Admin_SystemSettings_TestEmail_Subject', a);
    /** Translation lookup for `Admin_SystemSettings_TestEmail_Body`. */
    Admin_SystemSettings_TestEmail_Body: t = (a = []) => this.t('Admin_SystemSettings_TestEmail_Body', a);
    /** Translation lookup for `Admin_SystemSettings_TestEmail_Type`. */
    Admin_SystemSettings_TestEmail_Type: t = (a = []) => this.t('Admin_SystemSettings_TestEmail_Type', a);
    /** Translation lookup for `Admin_SystemSettings_TestEmail_Type_Generic`. */
    Admin_SystemSettings_TestEmail_Type_Generic: t = (a = []) =>
        this.t('Admin_SystemSettings_TestEmail_Type_Generic', a);
    /** Translation lookup for `Admin_SystemSettings_TestEmail_TestPrefix`. */
    Admin_SystemSettings_TestEmail_TestPrefix: t = (a = []) => this.t('Admin_SystemSettings_TestEmail_TestPrefix', a);
    /** Translation lookup for `Admin_CancellationPenalty_Tab`. */
    Admin_CancellationPenalty_Tab: t = (a = []) => this.t('Admin_CancellationPenalty_Tab', a);
    /** Translation lookup for `Admin_CancellationPenalty_Title`. */
    Admin_CancellationPenalty_Title: t = (a = []) => this.t('Admin_CancellationPenalty_Title', a);
    /** Translation lookup for `Admin_CancellationPenalty_Invalid`. */
    Admin_CancellationPenalty_Invalid: t = (a = []) => this.t('Admin_CancellationPenalty_Invalid', a);
    /** Translation lookup for `Admin_SupportContacts_Tab`. */
    Admin_SupportContacts_Tab: t = (a = []) => this.t('Admin_SupportContacts_Tab', a);
    /** Translation lookup for `Admin_SupportContacts_Title`. */
    Admin_SupportContacts_Title: t = (a = []) => this.t('Admin_SupportContacts_Title', a);
    /** Translation lookup for `Admin_SupportContacts_Hint`. */
    Admin_SupportContacts_Hint: t = (a = []) => this.t('Admin_SupportContacts_Hint', a);
    /** Translation lookup for `Admin_SupportContact_Email`. */
    Admin_SupportContact_Email: t = (a = []) => this.t('Admin_SupportContact_Email', a);
    /** Translation lookup for `Admin_SupportContact_Phone`. */
    Admin_SupportContact_Phone: t = (a = []) => this.t('Admin_SupportContact_Phone', a);
    /** Translation lookup for `Admin_SupportContact_Telegram`. */
    Admin_SupportContact_Telegram: t = (a = []) => this.t('Admin_SupportContact_Telegram', a);
    /** Translation lookup for `Admin_SystemSettings_History_Tab`. */
    Admin_SystemSettings_History_Tab: t = (a = []) => this.t('Admin_SystemSettings_History_Tab', a);
    /** Translation lookup for `Admin_SystemSettings_History_Title`. */
    Admin_SystemSettings_History_Title: t = (a = []) => this.t('Admin_SystemSettings_History_Title', a);
    /** Translation lookup for `Admin_SystemSettings_History_Hint`. */
    Admin_SystemSettings_History_Hint: t = (a = []) => this.t('Admin_SystemSettings_History_Hint', a);
    /** Translation lookup for `Admin_SystemSettings_History_Empty`. */
    Admin_SystemSettings_History_Empty: t = (a = []) => this.t('Admin_SystemSettings_History_Empty', a);
    /** Translation lookup for `Admin_SystemSettings_History_Loading`. */
    Admin_SystemSettings_History_Loading: t = (a = []) => this.t('Admin_SystemSettings_History_Loading', a);
    /** Translation lookup for `Admin_SystemSettings_History_Refresh`. */
    Admin_SystemSettings_History_Refresh: t = (a = []) => this.t('Admin_SystemSettings_History_Refresh', a);
    /** Translation lookup for `Admin_SystemSettings_History_When`. */
    Admin_SystemSettings_History_When: t = (a = []) => this.t('Admin_SystemSettings_History_When', a);
    /** Translation lookup for `Admin_SystemSettings_History_Actor`. */
    Admin_SystemSettings_History_Actor: t = (a = []) => this.t('Admin_SystemSettings_History_Actor', a);
    /** Translation lookup for `Admin_SystemSettings_History_Changes`. */
    Admin_SystemSettings_History_Changes: t = (a = []) => this.t('Admin_SystemSettings_History_Changes', a);
    /** Translation lookup for `Admin_SystemSettings_History_FieldsChanged`. */
    Admin_SystemSettings_History_FieldsChanged: t = (a = []) => this.t('Admin_SystemSettings_History_FieldsChanged', a);
    /** Translation lookup for `Admin_SystemSettings_History_Field`. */
    Admin_SystemSettings_History_Field: t = (a = []) => this.t('Admin_SystemSettings_History_Field', a);
    /** Translation lookup for `Admin_Tokens`. */
    Admin_Tokens: t = (a = []) => this.t('Admin_Tokens', a);
    /** Translation lookup for `Admin_Tokens_Title`. */
    Admin_Tokens_Title: t = (a = []) => this.t('Admin_Tokens_Title', a);
    /** Translation lookup for `Admin_Tokens_Empty`. */
    Admin_Tokens_Empty: t = (a = []) => this.t('Admin_Tokens_Empty', a);
    /** Translation lookup for `Admin_Tokens_Label`. */
    Admin_Tokens_Label: t = (a = []) => this.t('Admin_Tokens_Label', a);
    /** Translation lookup for `Admin_Tokens_Link`. */
    Admin_Tokens_Link: t = (a = []) => this.t('Admin_Tokens_Link', a);
    /** Translation lookup for `Admin_Tokens_ShowLink`. */
    Admin_Tokens_ShowLink: t = (a = []) => this.t('Admin_Tokens_ShowLink', a);
    /** Translation lookup for `Admin_Tokens_Uses`. */
    Admin_Tokens_Uses: t = (a = []) => this.t('Admin_Tokens_Uses', a);
    /** Translation lookup for `Admin_Tokens_Status`. */
    Admin_Tokens_Status: t = (a = []) => this.t('Admin_Tokens_Status', a);
    /** Translation lookup for `Admin_Tokens_CreatedAt`. */
    Admin_Tokens_CreatedAt: t = (a = []) => this.t('Admin_Tokens_CreatedAt', a);
    /** Translation lookup for `Admin_Tokens_CreatedBy`. */
    Admin_Tokens_CreatedBy: t = (a = []) => this.t('Admin_Tokens_CreatedBy', a);
    /** Translation lookup for `Admin_Tokens_ExpiresAt`. */
    Admin_Tokens_ExpiresAt: t = (a = []) => this.t('Admin_Tokens_ExpiresAt', a);
    /** Translation lookup for `Admin_Tokens_Actions`. */
    Admin_Tokens_Actions: t = (a = []) => this.t('Admin_Tokens_Actions', a);
    /** Translation lookup for `Admin_Tokens_Create`. */
    Admin_Tokens_Create: t = (a = []) => this.t('Admin_Tokens_Create', a);
    /** Translation lookup for `Admin_Tokens_CreateTitle`. */
    Admin_Tokens_CreateTitle: t = (a = []) => this.t('Admin_Tokens_CreateTitle', a);
    /** Translation lookup for `Admin_Tokens_LabelPlaceholder`. */
    Admin_Tokens_LabelPlaceholder: t = (a = []) => this.t('Admin_Tokens_LabelPlaceholder', a);
    /** Translation lookup for `Admin_Tokens_MaxUses`. */
    Admin_Tokens_MaxUses: t = (a = []) => this.t('Admin_Tokens_MaxUses', a);
    /** Translation lookup for `Admin_Tokens_AccountType`. */
    Admin_Tokens_AccountType: t = (a = []) => this.t('Admin_Tokens_AccountType', a);
    /** Translation lookup for `Admin_Tokens_AccountTypeUser`. */
    Admin_Tokens_AccountTypeUser: t = (a = []) => this.t('Admin_Tokens_AccountTypeUser', a);
    /** Translation lookup for `Admin_Tokens_AccountTypeExpert`. */
    Admin_Tokens_AccountTypeExpert: t = (a = []) => this.t('Admin_Tokens_AccountTypeExpert', a);
    /** Translation lookup for `Admin_Tokens_TTL`. */
    Admin_Tokens_TTL: t = (a = []) => this.t('Admin_Tokens_TTL', a);
    /** Translation lookup for `Admin_Tokens_TTL_None`. */
    Admin_Tokens_TTL_None: t = (a = []) => this.t('Admin_Tokens_TTL_None', a);
    /** Translation lookup for `Admin_Tokens_TTL_1h`. */
    Admin_Tokens_TTL_1h: t = (a = []) => this.t('Admin_Tokens_TTL_1h', a);
    /** Translation lookup for `Admin_Tokens_TTL_1d`. */
    Admin_Tokens_TTL_1d: t = (a = []) => this.t('Admin_Tokens_TTL_1d', a);
    /** Translation lookup for `Admin_Tokens_TTL_1w`. */
    Admin_Tokens_TTL_1w: t = (a = []) => this.t('Admin_Tokens_TTL_1w', a);
    /** Translation lookup for `Admin_Tokens_TTL_30d`. */
    Admin_Tokens_TTL_30d: t = (a = []) => this.t('Admin_Tokens_TTL_30d', a);
    /** Translation lookup for `Admin_Tokens_Copied`. */
    Admin_Tokens_Copied: t = (a = []) => this.t('Admin_Tokens_Copied', a);
    /** Translation lookup for `Admin_Tokens_Disable`. */
    Admin_Tokens_Disable: t = (a = []) => this.t('Admin_Tokens_Disable', a);
    /** Translation lookup for `Admin_Tokens_Enable`. */
    Admin_Tokens_Enable: t = (a = []) => this.t('Admin_Tokens_Enable', a);
    /** Translation lookup for `Admin_Tokens_DisableConfirm`. */
    Admin_Tokens_DisableConfirm: t = (a = []) => this.t('Admin_Tokens_DisableConfirm', a);
    /** Translation lookup for `Admin_Tokens_DeleteConfirm`. */
    Admin_Tokens_DeleteConfirm: t = (a = []) => this.t('Admin_Tokens_DeleteConfirm', a);
    /** Translation lookup for `Admin_Tokens_Registrations`. */
    Admin_Tokens_Registrations: t = (a = []) => this.t('Admin_Tokens_Registrations', a);
    /** Translation lookup for `Admin_Tokens_RegEmpty`. */
    Admin_Tokens_RegEmpty: t = (a = []) => this.t('Admin_Tokens_RegEmpty', a);
    /** Translation lookup for `Admin_Tokens_RegAccount`. */
    Admin_Tokens_RegAccount: t = (a = []) => this.t('Admin_Tokens_RegAccount', a);
    /** Translation lookup for `Admin_Tokens_RegDate`. */
    Admin_Tokens_RegDate: t = (a = []) => this.t('Admin_Tokens_RegDate', a);
    /** Translation lookup for `Admin_Tokens_RegIp`. */
    Admin_Tokens_RegIp: t = (a = []) => this.t('Admin_Tokens_RegIp', a);
    /** Translation lookup for `Admin_Tokens_RegUa`. */
    Admin_Tokens_RegUa: t = (a = []) => this.t('Admin_Tokens_RegUa', a);
    /** Translation lookup for `Admin_Tokens_Status_Active`. */
    Admin_Tokens_Status_Active: t = (a = []) => this.t('Admin_Tokens_Status_Active', a);
    /** Translation lookup for `Admin_Tokens_Status_Disabled`. */
    Admin_Tokens_Status_Disabled: t = (a = []) => this.t('Admin_Tokens_Status_Disabled', a);
    /** Translation lookup for `Admin_Tokens_Status_Expired`. */
    Admin_Tokens_Status_Expired: t = (a = []) => this.t('Admin_Tokens_Status_Expired', a);
    /** Translation lookup for `Admin_Tokens_Status_Exhausted`. */
    Admin_Tokens_Status_Exhausted: t = (a = []) => this.t('Admin_Tokens_Status_Exhausted', a);
    /** Translation lookup for `Admin_Tokens_NoExpiry`. */
    Admin_Tokens_NoExpiry: t = (a = []) => this.t('Admin_Tokens_NoExpiry', a);
    /** Translation lookup for `Admin_Tokens_FilterAll`. */
    Admin_Tokens_FilterAll: t = (a = []) => this.t('Admin_Tokens_FilterAll', a);
    /** Translation lookup for `Admin_Tokens_FilterActive`. */
    Admin_Tokens_FilterActive: t = (a = []) => this.t('Admin_Tokens_FilterActive', a);
    /** Translation lookup for `Admin_Tokens_FilterDisabled`. */
    Admin_Tokens_FilterDisabled: t = (a = []) => this.t('Admin_Tokens_FilterDisabled', a);
    /** Translation lookup for `Admin_Tokens_FilterExpired`. */
    Admin_Tokens_FilterExpired: t = (a = []) => this.t('Admin_Tokens_FilterExpired', a);
    /** Translation lookup for `Admin_Tokens_FilterExhausted`. */
    Admin_Tokens_FilterExhausted: t = (a = []) => this.t('Admin_Tokens_FilterExhausted', a);
    /** Translation lookup for `Admin_Tokens_CopyLink`. */
    Admin_Tokens_CopyLink: t = (a = []) => this.t('Admin_Tokens_CopyLink', a);
    /** Translation lookup for `Admin_Tokens_OpenLink`. */
    Admin_Tokens_OpenLink: t = (a = []) => this.t('Admin_Tokens_OpenLink', a);
    /** Translation lookup for `Admin_Tokens_EditTitle`. */
    Admin_Tokens_EditTitle: t = (a = []) => this.t('Admin_Tokens_EditTitle', a);
    /** Translation lookup for `Admin_Tokens_EditExpiresHint`. */
    Admin_Tokens_EditExpiresHint: t = (a = []) => this.t('Admin_Tokens_EditExpiresHint', a);
    /** Translation lookup for `Admin_Tokens_EditUsedInfo`. */
    Admin_Tokens_EditUsedInfo: t = (a = []) => this.t('Admin_Tokens_EditUsedInfo', a);
    /** Translation lookup for `Admin_Pages`. */
    Admin_Pages: t = (a = []) => this.t('Admin_Pages', a);
    /** Translation lookup for `Admin_Pages_Title`. */
    Admin_Pages_Title: t = (a = []) => this.t('Admin_Pages_Title', a);
    /** Translation lookup for `Admin_Pages_Empty`. */
    Admin_Pages_Empty: t = (a = []) => this.t('Admin_Pages_Empty', a);
    /** Translation lookup for `Admin_Pages_Create`. */
    Admin_Pages_Create: t = (a = []) => this.t('Admin_Pages_Create', a);
    /** Translation lookup for `Admin_Pages_CreateOpen`. */
    Admin_Pages_CreateOpen: t = (a = []) => this.t('Admin_Pages_CreateOpen', a);
    /** Translation lookup for `Admin_Pages_CreateTitle`. */
    Admin_Pages_CreateTitle: t = (a = []) => this.t('Admin_Pages_CreateTitle', a);
    /** Translation lookup for `Admin_Pages_Slug`. */
    Admin_Pages_Slug: t = (a = []) => this.t('Admin_Pages_Slug', a);
    /** Translation lookup for `Admin_Pages_SlugHint`. */
    Admin_Pages_SlugHint: t = (a = []) => this.t('Admin_Pages_SlugHint', a);
    /** Translation lookup for `Admin_Pages_PageTitle`. */
    Admin_Pages_PageTitle: t = (a = []) => this.t('Admin_Pages_PageTitle', a);
    /** Translation lookup for `Admin_Pages_MetaDescription`. */
    Admin_Pages_MetaDescription: t = (a = []) => this.t('Admin_Pages_MetaDescription', a);
    /** Translation lookup for `Admin_Pages_Published`. */
    Admin_Pages_Published: t = (a = []) => this.t('Admin_Pages_Published', a);
    /** Translation lookup for `Admin_Pages_Draft`. */
    Admin_Pages_Draft: t = (a = []) => this.t('Admin_Pages_Draft', a);
    /** Translation lookup for `Admin_Pages_Publish`. */
    Admin_Pages_Publish: t = (a = []) => this.t('Admin_Pages_Publish', a);
    /** Translation lookup for `Admin_Pages_Unpublish`. */
    Admin_Pages_Unpublish: t = (a = []) => this.t('Admin_Pages_Unpublish', a);
    /** Translation lookup for `Admin_Pages_DeleteConfirm`. */
    Admin_Pages_DeleteConfirm: t = (a = []) => this.t('Admin_Pages_DeleteConfirm', a);
    /** Translation lookup for `Admin_Pages_Blocks`. */
    Admin_Pages_Blocks: t = (a = []) => this.t('Admin_Pages_Blocks', a);
    /** Translation lookup for `Admin_Pages_AddBlock`. */
    Admin_Pages_AddBlock: t = (a = []) => this.t('Admin_Pages_AddBlock', a);
    /** Translation lookup for `Admin_Pages_BlockType_Heading`. */
    Admin_Pages_BlockType_Heading: t = (a = []) => this.t('Admin_Pages_BlockType_Heading', a);
    /** Translation lookup for `Admin_Pages_BlockType_Text`. */
    Admin_Pages_BlockType_Text: t = (a = []) => this.t('Admin_Pages_BlockType_Text', a);
    /** Translation lookup for `Admin_Pages_BlockType_Image`. */
    Admin_Pages_BlockType_Image: t = (a = []) => this.t('Admin_Pages_BlockType_Image', a);
    /** Translation lookup for `Admin_Pages_BlockType_Gallery`. */
    Admin_Pages_BlockType_Gallery: t = (a = []) => this.t('Admin_Pages_BlockType_Gallery', a);
    /** Translation lookup for `Admin_Pages_ImageAlt`. */
    Admin_Pages_ImageAlt: t = (a = []) => this.t('Admin_Pages_ImageAlt', a);
    /** Translation lookup for `Admin_Pages_ImageLightbox`. */
    Admin_Pages_ImageLightbox: t = (a = []) => this.t('Admin_Pages_ImageLightbox', a);
    /** Translation lookup for `Admin_Pages_GalleryRows`. */
    Admin_Pages_GalleryRows: t = (a = []) => this.t('Admin_Pages_GalleryRows', a);
    /** Translation lookup for `Admin_Pages_UploadImage`. */
    Admin_Pages_UploadImage: t = (a = []) => this.t('Admin_Pages_UploadImage', a);
    /** Translation lookup for `Admin_Pages_RemoveImage`. */
    Admin_Pages_RemoveImage: t = (a = []) => this.t('Admin_Pages_RemoveImage', a);
    /** Translation lookup for `Admin_Pages_BlockHidden`. */
    Admin_Pages_BlockHidden: t = (a = []) => this.t('Admin_Pages_BlockHidden', a);
    /** Translation lookup for `Admin_Pages_BlockVisible`. */
    Admin_Pages_BlockVisible: t = (a = []) => this.t('Admin_Pages_BlockVisible', a);
    /** Translation lookup for `Admin_Pages_DeleteBlockConfirm`. */
    Admin_Pages_DeleteBlockConfirm: t = (a = []) => this.t('Admin_Pages_DeleteBlockConfirm', a);
    /** Translation lookup for `Admin_Pages_Variables`. */
    Admin_Pages_Variables: t = (a = []) => this.t('Admin_Pages_Variables', a);
    /** Translation lookup for `Admin_Pages_MoveUp`. */
    Admin_Pages_MoveUp: t = (a = []) => this.t('Admin_Pages_MoveUp', a);
    /** Translation lookup for `Admin_Pages_MoveDown`. */
    Admin_Pages_MoveDown: t = (a = []) => this.t('Admin_Pages_MoveDown', a);
    /** Translation lookup for `Admin_Pages_MaxWidth`. */
    Admin_Pages_MaxWidth: t = (a = []) => this.t('Admin_Pages_MaxWidth', a);
    /** Translation lookup for `Admin_Pages_Visibility`. */
    Admin_Pages_Visibility: t = (a = []) => this.t('Admin_Pages_Visibility', a);
    /** Translation lookup for `Admin_Pages_Visibility_All`. */
    Admin_Pages_Visibility_All: t = (a = []) => this.t('Admin_Pages_Visibility_All', a);
    /** Translation lookup for `Admin_Pages_Visibility_Guest`. */
    Admin_Pages_Visibility_Guest: t = (a = []) => this.t('Admin_Pages_Visibility_Guest', a);
    /** Translation lookup for `Admin_Pages_Visibility_Auth`. */
    Admin_Pages_Visibility_Auth: t = (a = []) => this.t('Admin_Pages_Visibility_Auth', a);
    /** Translation lookup for `Admin_Pages_Visibility_Moderator`. */
    Admin_Pages_Visibility_Moderator: t = (a = []) => this.t('Admin_Pages_Visibility_Moderator', a);
    /** Translation lookup for `Admin_Pages_BlockVisibility`. */
    Admin_Pages_BlockVisibility: t = (a = []) => this.t('Admin_Pages_BlockVisibility', a);
    /** Translation lookup for `Admin_Pages_OpenPage`. */
    Admin_Pages_OpenPage: t = (a = []) => this.t('Admin_Pages_OpenPage', a);
    /** Translation lookup for `Admin_Pages_SavePage`. */
    Admin_Pages_SavePage: t = (a = []) => this.t('Admin_Pages_SavePage', a);
    /** Translation lookup for `Admin_Pages_EditPage`. */
    Admin_Pages_EditPage: t = (a = []) => this.t('Admin_Pages_EditPage', a);
    /** Translation lookup for `Admin_Snippets`. */
    Admin_Snippets: t = (a = []) => this.t('Admin_Snippets', a);
    /** Translation lookup for `Admin_Snippets_Empty`. */
    Admin_Snippets_Empty: t = (a = []) => this.t('Admin_Snippets_Empty', a);
    /** Translation lookup for `Admin_Snippets_Create`. */
    Admin_Snippets_Create: t = (a = []) => this.t('Admin_Snippets_Create', a);
    /** Translation lookup for `Admin_Snippets_CreateOpen`. */
    Admin_Snippets_CreateOpen: t = (a = []) => this.t('Admin_Snippets_CreateOpen', a);
    /** Translation lookup for `Admin_Snippets_CreateTitle`. */
    Admin_Snippets_CreateTitle: t = (a = []) => this.t('Admin_Snippets_CreateTitle', a);
    /** Translation lookup for `Admin_Snippets_Name`. */
    Admin_Snippets_Name: t = (a = []) => this.t('Admin_Snippets_Name', a);
    /** Translation lookup for `Admin_Snippets_Slug`. */
    Admin_Snippets_Slug: t = (a = []) => this.t('Admin_Snippets_Slug', a);
    /** Translation lookup for `Admin_Snippets_Type`. */
    Admin_Snippets_Type: t = (a = []) => this.t('Admin_Snippets_Type', a);
    /** Translation lookup for `Admin_Snippets_Type_Header`. */
    Admin_Snippets_Type_Header: t = (a = []) => this.t('Admin_Snippets_Type_Header', a);
    /** Translation lookup for `Admin_Snippets_Type_Footer`. */
    Admin_Snippets_Type_Footer: t = (a = []) => this.t('Admin_Snippets_Type_Footer', a);
    /** Translation lookup for `Admin_Snippets_Type_Variable`. */
    Admin_Snippets_Type_Variable: t = (a = []) => this.t('Admin_Snippets_Type_Variable', a);
    /** Translation lookup for `Admin_Snippets_Type_Block`. */
    Admin_Snippets_Type_Block: t = (a = []) => this.t('Admin_Snippets_Type_Block', a);
    /** Translation lookup for `Admin_Snippets_Active`. */
    Admin_Snippets_Active: t = (a = []) => this.t('Admin_Snippets_Active', a);
    /** Translation lookup for `Admin_Snippets_Inactive`. */
    Admin_Snippets_Inactive: t = (a = []) => this.t('Admin_Snippets_Inactive', a);
    /** Translation lookup for `Admin_Snippets_DeleteConfirm`. */
    Admin_Snippets_DeleteConfirm: t = (a = []) => this.t('Admin_Snippets_DeleteConfirm', a);
    /** Translation lookup for `Admin_Snippets_UsageHint`. */
    Admin_Snippets_UsageHint: t = (a = []) => this.t('Admin_Snippets_UsageHint', a);
    /** Translation lookup for `Admin_Snippets_EditTitle`. */
    Admin_Snippets_EditTitle: t = (a = []) => this.t('Admin_Snippets_EditTitle', a);
    /** Translation lookup for `Admin_Pages_HeaderSnippet`. */
    Admin_Pages_HeaderSnippet: t = (a = []) => this.t('Admin_Pages_HeaderSnippet', a);
    /** Translation lookup for `Admin_Pages_FooterSnippet`. */
    Admin_Pages_FooterSnippet: t = (a = []) => this.t('Admin_Pages_FooterSnippet', a);
    /** Translation lookup for `Admin_Pages_NoSnippet`. */
    Admin_Pages_NoSnippet: t = (a = []) => this.t('Admin_Pages_NoSnippet', a);
    /** Translation lookup for `Admin_Snippets_FilterAll`. */
    Admin_Snippets_FilterAll: t = (a = []) => this.t('Admin_Snippets_FilterAll', a);
    /** Translation lookup for `Admin_Snippets_Logo`. */
    Admin_Snippets_Logo: t = (a = []) => this.t('Admin_Snippets_Logo', a);
    /** Translation lookup for `Admin_Snippets_LogoAlt`. */
    Admin_Snippets_LogoAlt: t = (a = []) => this.t('Admin_Snippets_LogoAlt', a);
    /** Translation lookup for `Admin_Snippets_LogoLink`. */
    Admin_Snippets_LogoLink: t = (a = []) => this.t('Admin_Snippets_LogoLink', a);
    /** Translation lookup for `Admin_Snippets_LogoHeight`. */
    Admin_Snippets_LogoHeight: t = (a = []) => this.t('Admin_Snippets_LogoHeight', a);
    /** Translation lookup for `Admin_Snippets_MenuItems`. */
    Admin_Snippets_MenuItems: t = (a = []) => this.t('Admin_Snippets_MenuItems', a);
    /** Translation lookup for `Admin_Snippets_AddItem`. */
    Admin_Snippets_AddItem: t = (a = []) => this.t('Admin_Snippets_AddItem', a);
    /** Translation lookup for `Admin_Snippets_ItemType_Link`. */
    Admin_Snippets_ItemType_Link: t = (a = []) => this.t('Admin_Snippets_ItemType_Link', a);
    /** Translation lookup for `Admin_Snippets_ItemType_Page`. */
    Admin_Snippets_ItemType_Page: t = (a = []) => this.t('Admin_Snippets_ItemType_Page', a);
    /** Translation lookup for `Admin_Snippets_ItemType_Divider`. */
    Admin_Snippets_ItemType_Divider: t = (a = []) => this.t('Admin_Snippets_ItemType_Divider', a);
    /** Translation lookup for `Admin_Snippets_ItemLabel`. */
    Admin_Snippets_ItemLabel: t = (a = []) => this.t('Admin_Snippets_ItemLabel', a);
    /** Translation lookup for `Admin_Snippets_ItemUrl`. */
    Admin_Snippets_ItemUrl: t = (a = []) => this.t('Admin_Snippets_ItemUrl', a);
    /** Translation lookup for `Admin_Snippets_ItemExternal`. */
    Admin_Snippets_ItemExternal: t = (a = []) => this.t('Admin_Snippets_ItemExternal', a);
    /** Translation lookup for `Admin_Snippets_Layout`. */
    Admin_Snippets_Layout: t = (a = []) => this.t('Admin_Snippets_Layout', a);
    /** Translation lookup for `Admin_Snippets_Layout_Left`. */
    Admin_Snippets_Layout_Left: t = (a = []) => this.t('Admin_Snippets_Layout_Left', a);
    /** Translation lookup for `Admin_Snippets_Layout_Center`. */
    Admin_Snippets_Layout_Center: t = (a = []) => this.t('Admin_Snippets_Layout_Center', a);
    /** Translation lookup for `Admin_Snippets_Layout_Minimal`. */
    Admin_Snippets_Layout_Minimal: t = (a = []) => this.t('Admin_Snippets_Layout_Minimal', a);
    /** Translation lookup for `Admin_Snippets_Sticky`. */
    Admin_Snippets_Sticky: t = (a = []) => this.t('Admin_Snippets_Sticky', a);
    /** Translation lookup for `Admin_Snippets_Columns`. */
    Admin_Snippets_Columns: t = (a = []) => this.t('Admin_Snippets_Columns', a);
    /** Translation lookup for `Admin_Snippets_AddColumn`. */
    Admin_Snippets_AddColumn: t = (a = []) => this.t('Admin_Snippets_AddColumn', a);
    /** Translation lookup for `Admin_Snippets_ColumnTitle`. */
    Admin_Snippets_ColumnTitle: t = (a = []) => this.t('Admin_Snippets_ColumnTitle', a);
    /** Translation lookup for `Admin_Snippets_Copyright`. */
    Admin_Snippets_Copyright: t = (a = []) => this.t('Admin_Snippets_Copyright', a);
    /** Translation lookup for `Admin_Snippets_Layout_Columns`. */
    Admin_Snippets_Layout_Columns: t = (a = []) => this.t('Admin_Snippets_Layout_Columns', a);
    /** Translation lookup for `Admin_Snippets_Layout_Simple`. */
    Admin_Snippets_Layout_Simple: t = (a = []) => this.t('Admin_Snippets_Layout_Simple', a);
    /** Translation lookup for `Admin_Snippets_RemoveColumn`. */
    Admin_Snippets_RemoveColumn: t = (a = []) => this.t('Admin_Snippets_RemoveColumn', a);
    /** Translation lookup for `Admin_Snippets_SelectPage`. */
    Admin_Snippets_SelectPage: t = (a = []) => this.t('Admin_Snippets_SelectPage', a);
    /** Translation lookup for `Bookings_Title`. */
    Bookings_Title: t = (a = []) => this.t('Bookings_Title', a);
    /** Translation lookup for `Booking_PlatformUnset`. */
    Booking_PlatformUnset: t = (a = []) => this.t('Booking_PlatformUnset', a);
    /** Translation lookup for `Booking_CancelledByYou`. */
    Booking_CancelledByYou: t = (a = []) => this.t('Booking_CancelledByYou', a);
    /** Translation lookup for `Booking_WithdrawnByYou`. */
    Booking_WithdrawnByYou: t = (a = []) => this.t('Booking_WithdrawnByYou', a);
    /** Translation lookup for `Booking_WithdrawnByStudent`. */
    Booking_WithdrawnByStudent: t = (a = []) => this.t('Booking_WithdrawnByStudent', a);
    /** Translation lookup for `Booking_CancelledLessonByExpert`. */
    Booking_CancelledLessonByExpert: t = (a = []) => this.t('Booking_CancelledLessonByExpert', a);
    /** Translation lookup for `Booking_CancelledLessonByYouAsExpert`. */
    Booking_CancelledLessonByYouAsExpert: t = (a = []) => this.t('Booking_CancelledLessonByYouAsExpert', a);
    /** Translation lookup for `Booking_CancelledByStudent`. */
    Booking_CancelledByStudent: t = (a = []) => this.t('Booking_CancelledByStudent', a);
    /** Translation lookup for `Booking_CancelledByExpert`. */
    Booking_CancelledByExpert: t = (a = []) => this.t('Booking_CancelledByExpert', a);
    /** Translation lookup for `Booking_CancelledByYouAsExpert`. */
    Booking_CancelledByYouAsExpert: t = (a = []) => this.t('Booking_CancelledByYouAsExpert', a);
    /** Translation lookup for `Booking_CancelledByModerator`. */
    Booking_CancelledByModerator: t = (a = []) => this.t('Booking_CancelledByModerator', a);
    /** Translation lookup for `Booking_CancelledBySystem`. */
    Booking_CancelledBySystem: t = (a = []) => this.t('Booking_CancelledBySystem', a);
    /** Translation lookup for `Booking_CancelReason`. */
    Booking_CancelReason: t = (a = []) => this.t('Booking_CancelReason', a);
    /** Translation lookup for `Batch_Title`. */
    Batch_Title: t = (a = []) => this.t('Batch_Title', a);
    /** Translation lookup for `Batch_StartDate`. */
    Batch_StartDate: t = (a = []) => this.t('Batch_StartDate', a);
    /** Translation lookup for `Batch_EndDate`. */
    Batch_EndDate: t = (a = []) => this.t('Batch_EndDate', a);
    /** Translation lookup for `Batch_Count`. */
    Batch_Count: t = (a = []) => this.t('Batch_Count', a);
    /** Translation lookup for `Batch_PerWeek`. */
    Batch_PerWeek: t = (a = []) => this.t('Batch_PerWeek', a);
    /** Translation lookup for `Batch_Preview`. */
    Batch_Preview: t = (a = []) => this.t('Batch_Preview', a);
    /** Translation lookup for `Batch_CreateAll`. */
    Batch_CreateAll: t = (a = []) => this.t('Batch_CreateAll', a);
    /** Translation lookup for `Batch_Available`. */
    Batch_Available: t = (a = []) => this.t('Batch_Available', a);
    /** Translation lookup for `Batch_Restricted`. */
    Batch_Restricted: t = (a = []) => this.t('Batch_Restricted', a);
    /** Translation lookup for `Batch_Proposed`. */
    Batch_Proposed: t = (a = []) => this.t('Batch_Proposed', a);
    /** Translation lookup for `Batch_ProposedDates`. */
    Batch_ProposedDates: t = (a = []) => this.t('Batch_ProposedDates', a);
    /** Translation lookup for `Batch_ConfirmCreate`. */
    Batch_ConfirmCreate: t = (a = []) => this.t('Batch_ConfirmCreate', a);
    /** Translation lookup for `Batch_Created`. */
    Batch_Created: t = (a = []) => this.t('Batch_Created', a);
    /** Translation lookup for `Batch_AvailableDays`. */
    Batch_AvailableDays: t = (a = []) => this.t('Batch_AvailableDays', a);
    /** Translation lookup for `Batch_RestrictedDays`. */
    Batch_RestrictedDays: t = (a = []) => this.t('Batch_RestrictedDays', a);
    /** Translation lookup for `Batch_Cancel`. */
    Batch_Cancel: t = (a = []) => this.t('Batch_Cancel', a);
    /** Translation lookup for `Batch_CreateBtn`. */
    Batch_CreateBtn: t = (a = []) => this.t('Batch_CreateBtn', a);
    /** Translation lookup for `Batch_Overlap`. */
    Batch_Overlap: t = (a = []) => this.t('Batch_Overlap', a);
    /** Translation lookup for `Batch_ProposedOverlap`. */
    Batch_ProposedOverlap: t = (a = []) => this.t('Batch_ProposedOverlap', a);
    /** Translation lookup for `Batch_DateOutOfRange`. */
    Batch_DateOutOfRange: t = (a = []) => this.t('Batch_DateOutOfRange', a);
    /** Translation lookup for `Batch_PastDate`. */
    Batch_PastDate: t = (a = []) => this.t('Batch_PastDate', a);
    /** Translation lookup for `Batch_HebrewDate`. */
    Batch_HebrewDate: t = (a = []) => this.t('Batch_HebrewDate', a);
    /** Translation lookup for `Booking_NoBookings`. */
    Booking_NoBookings: t = (a = []) => this.t('Booking_NoBookings', a);
    /** Translation lookup for `Booking_Slot`. */
    Booking_Slot: t = (a = []) => this.t('Booking_Slot', a);
    /** Translation lookup for `Booking_NA`. */
    Booking_NA: t = (a = []) => this.t('Booking_NA', a);
    /** Translation lookup for `Booking_Created`. */
    Booking_Created: t = (a = []) => this.t('Booking_Created', a);
    /** Translation lookup for `Booking_UserNoBookings`. */
    Booking_UserNoBookings: t = (a = []) => this.t('Booking_UserNoBookings', a);
    /** Translation lookup for `Booking_Status_Pending`. */
    Booking_Status_Pending: t = (a = []) => this.t('Booking_Status_Pending', a);
    /** Translation lookup for `Booking_Status_Confirmed`. */
    Booking_Status_Confirmed: t = (a = []) => this.t('Booking_Status_Confirmed', a);
    /** Translation lookup for `Booking_Status_Cancelled`. */
    Booking_Status_Cancelled: t = (a = []) => this.t('Booking_Status_Cancelled', a);
    /** Translation lookup for `Booking_Status_Withdrawn`. */
    Booking_Status_Withdrawn: t = (a = []) => this.t('Booking_Status_Withdrawn', a);
    /** Translation lookup for `Booking_Status_Declined`. */
    Booking_Status_Declined: t = (a = []) => this.t('Booking_Status_Declined', a);
    /** Translation lookup for `Booking_Status_Missed`. */
    Booking_Status_Missed: t = (a = []) => this.t('Booking_Status_Missed', a);
    /** Translation lookup for `Booking_Status_Completed`. */
    Booking_Status_Completed: t = (a = []) => this.t('Booking_Status_Completed', a);
    /** Translation lookup for `Booking_Cancel`. */
    Booking_Cancel: t = (a = []) => this.t('Booking_Cancel', a);
    /** Translation lookup for `Bookings_FilterAll`. */
    Bookings_FilterAll: t = (a = []) => this.t('Bookings_FilterAll', a);
    /** Translation lookup for `Bookings_FilterPending`. */
    Bookings_FilterPending: t = (a = []) => this.t('Bookings_FilterPending', a);
    /** Translation lookup for `Bookings_FilterConfirmed`. */
    Bookings_FilterConfirmed: t = (a = []) => this.t('Bookings_FilterConfirmed', a);
    /** Translation lookup for `Bookings_FilterCancelled`. */
    Bookings_FilterCancelled: t = (a = []) => this.t('Bookings_FilterCancelled', a);
    /** Translation lookup for `Bookings_FilterCompleted`. */
    Bookings_FilterCompleted: t = (a = []) => this.t('Bookings_FilterCompleted', a);
    /** Translation lookup for `Bookings_ShowPast`. */
    Bookings_ShowPast: t = (a = []) => this.t('Bookings_ShowPast', a);
    /** Translation lookup for `Bookings_HidePast`. */
    Bookings_HidePast: t = (a = []) => this.t('Bookings_HidePast', a);
    /** Translation lookup for `Booking_Chat_Confirmed`. */
    Booking_Chat_Confirmed: t = (a = []) => this.t('Booking_Chat_Confirmed', a);
    /** Translation lookup for `Booking_Chat_Declined`. */
    Booking_Chat_Declined: t = (a = []) => this.t('Booking_Chat_Declined', a);
    /** Translation lookup for `Booking_Chat_MissedResponse`. */
    Booking_Chat_MissedResponse: t = (a = []) => this.t('Booking_Chat_MissedResponse', a);
    /** Translation lookup for `Booking_Chat_Cancelled`. */
    Booking_Chat_Cancelled: t = (a = []) => this.t('Booking_Chat_Cancelled', a);
    /** Translation lookup for `Booking_Chat_LocationChanged`. */
    Booking_Chat_LocationChanged: t = (a = []) => this.t('Booking_Chat_LocationChanged', a);
    /** Translation lookup for `Booking_Chat_Rescheduled`. */
    Booking_Chat_Rescheduled: t = (a = []) => this.t('Booking_Chat_Rescheduled', a);
    /** Translation lookup for `Booking_CannotCancelStarted`. */
    Booking_CannotCancelStarted: t = (a = []) => this.t('Booking_CannotCancelStarted', a);
    /** Translation lookup for `Booking_Confirm`. */
    Booking_Confirm: t = (a = []) => this.t('Booking_Confirm', a);
    /** Translation lookup for `Booking_CancelConfirm`. */
    Booking_CancelConfirm: t = (a = []) => this.t('Booking_CancelConfirm', a);
    /** Translation lookup for `Booking_UserName`. */
    Booking_UserName: t = (a = []) => this.t('Booking_UserName', a);
    /** Translation lookup for `Booking_OtherSlots`. */
    Booking_OtherSlots: t = (a = []) => this.t('Booking_OtherSlots', a);
    /** Translation lookup for `Booking_Total`. */
    Booking_Total: t = (a = []) => this.t('Booking_Total', a);
    /** Translation lookup for `Booking_Balance`. */
    Booking_Balance: t = (a = []) => this.t('Booking_Balance', a);
    /** Translation lookup for `Booking_Items`. */
    Booking_Items: t = (a = []) => this.t('Booking_Items', a);
    /** Translation lookup for `Cancel_BookedSlot`. */
    Cancel_BookedSlot: t = (a = []) => this.t('Cancel_BookedSlot', a);
    /** Translation lookup for `Cancel_BookedSlotTitle`. */
    Cancel_BookedSlotTitle: t = (a = []) => this.t('Cancel_BookedSlotTitle', a);
    /** Translation lookup for `Cancel_ReasonLabel`. */
    Cancel_ReasonLabel: t = (a = []) => this.t('Cancel_ReasonLabel', a);
    /** Translation lookup for `Cancel_ReasonPlaceholder`. */
    Cancel_ReasonPlaceholder: t = (a = []) => this.t('Cancel_ReasonPlaceholder', a);
    /** Translation lookup for `Cancel_ReasonRequired`. */
    Cancel_ReasonRequired: t = (a = []) => this.t('Cancel_ReasonRequired', a);
    /** Translation lookup for `Cancel_Submit`. */
    Cancel_Submit: t = (a = []) => this.t('Cancel_Submit', a);
    /** Translation lookup for `Cancel_Success`. */
    Cancel_Success: t = (a = []) => this.t('Cancel_Success', a);
    /** Translation lookup for `Reschedule_Action`. */
    Reschedule_Action: t = (a = []) => this.t('Reschedule_Action', a);
    /** Translation lookup for `Reschedule_Title`. */
    Reschedule_Title: t = (a = []) => this.t('Reschedule_Title', a);
    /** Translation lookup for `Reschedule_PickSlot`. */
    Reschedule_PickSlot: t = (a = []) => this.t('Reschedule_PickSlot', a);
    /** Translation lookup for `Reschedule_Free`. */
    Reschedule_Free: t = (a = []) => this.t('Reschedule_Free', a);
    /** Translation lookup for `Reschedule_NeedsReconfirm`. */
    Reschedule_NeedsReconfirm: t = (a = []) => this.t('Reschedule_NeedsReconfirm', a);
    /** Translation lookup for `Reschedule_NoSlots`. */
    Reschedule_NoSlots: t = (a = []) => this.t('Reschedule_NoSlots', a);
    /** Translation lookup for `Reschedule_Submit`. */
    Reschedule_Submit: t = (a = []) => this.t('Reschedule_Submit', a);
    /** Translation lookup for `Reschedule_Success`. */
    Reschedule_Success: t = (a = []) => this.t('Reschedule_Success', a);
    /** Translation lookup for `Reschedule_Err_NotFound`. */
    Reschedule_Err_NotFound: t = (a = []) => this.t('Reschedule_Err_NotFound', a);
    /** Translation lookup for `Reschedule_Err_Access`. */
    Reschedule_Err_Access: t = (a = []) => this.t('Reschedule_Err_Access', a);
    /** Translation lookup for `Reschedule_Err_Status`. */
    Reschedule_Err_Status: t = (a = []) => this.t('Reschedule_Err_Status', a);
    /** Translation lookup for `Reschedule_Err_SourceStarted`. */
    Reschedule_Err_SourceStarted: t = (a = []) => this.t('Reschedule_Err_SourceStarted', a);
    /** Translation lookup for `Reschedule_Err_TargetMissing`. */
    Reschedule_Err_TargetMissing: t = (a = []) => this.t('Reschedule_Err_TargetMissing', a);
    /** Translation lookup for `Reschedule_Err_TargetPast`. */
    Reschedule_Err_TargetPast: t = (a = []) => this.t('Reschedule_Err_TargetPast', a);
    /** Translation lookup for `Reschedule_Err_TargetOtherExpert`. */
    Reschedule_Err_TargetOtherExpert: t = (a = []) => this.t('Reschedule_Err_TargetOtherExpert', a);
    /** Translation lookup for `Reschedule_Err_TargetOtherCost`. */
    Reschedule_Err_TargetOtherCost: t = (a = []) => this.t('Reschedule_Err_TargetOtherCost', a);
    /** Translation lookup for `Reschedule_Err_TargetSame`. */
    Reschedule_Err_TargetSame: t = (a = []) => this.t('Reschedule_Err_TargetSame', a);
    /** Translation lookup for `Reschedule_Err_TargetFull`. */
    Reschedule_Err_TargetFull: t = (a = []) => this.t('Reschedule_Err_TargetFull', a);
    /** Translation lookup for `Reschedule_Err_AlreadyBooked`. */
    Reschedule_Err_AlreadyBooked: t = (a = []) => this.t('Reschedule_Err_AlreadyBooked', a);
    /** Translation lookup for `Reschedule_Err_Raced`. */
    Reschedule_Err_Raced: t = (a = []) => this.t('Reschedule_Err_Raced', a);
    /** Translation lookup for `Cancellations_DateFrom`. */
    Cancellations_DateFrom: t = (a = []) => this.t('Cancellations_DateFrom', a);
    /** Translation lookup for `Cancellations_DateTo`. */
    Cancellations_DateTo: t = (a = []) => this.t('Cancellations_DateTo', a);
    /** Translation lookup for `Cancellations_Search`. */
    Cancellations_Search: t = (a = []) => this.t('Cancellations_Search', a);
    /** Translation lookup for `Cancellations_Empty`. */
    Cancellations_Empty: t = (a = []) => this.t('Cancellations_Empty', a);
    /** Translation lookup for `Cancellations_ColumnDate`. */
    Cancellations_ColumnDate: t = (a = []) => this.t('Cancellations_ColumnDate', a);
    /** Translation lookup for `Cancellations_ColumnReason`. */
    Cancellations_ColumnReason: t = (a = []) => this.t('Cancellations_ColumnReason', a);
    /** Translation lookup for `Cancellations_ColumnExpert`. */
    Cancellations_ColumnExpert: t = (a = []) => this.t('Cancellations_ColumnExpert', a);
    /** Translation lookup for `Cancellations_ColumnUser`. */
    Cancellations_ColumnUser: t = (a = []) => this.t('Cancellations_ColumnUser', a);
    /** Translation lookup for `Cancellations_ColumnSlot`. */
    Cancellations_ColumnSlot: t = (a = []) => this.t('Cancellations_ColumnSlot', a);
    /** Translation lookup for `Cancellations_ColumnBooking`. */
    Cancellations_ColumnBooking: t = (a = []) => this.t('Cancellations_ColumnBooking', a);
    /** Translation lookup for `Cancellations_ResetFilters`. */
    Cancellations_ResetFilters: t = (a = []) => this.t('Cancellations_ResetFilters', a);
    /** Translation lookup for `Booking_CostHint_Withdraw`. */
    Booking_CostHint_Withdraw: t = (a = []) => this.t('Booking_CostHint_Withdraw', a);
    /** Translation lookup for `Booking_CostHint_CancelFree`. */
    Booking_CostHint_CancelFree: t = (a = []) => this.t('Booking_CostHint_CancelFree', a);
    /** Translation lookup for `Booking_CostHint_CancelPenalty`. */
    Booking_CostHint_CancelPenalty: t = (a = []) => this.t('Booking_CostHint_CancelPenalty', a);
    /** Translation lookup for `Booking_CancelTerms_AfterConfirm`. */
    Booking_CancelTerms_AfterConfirm: t = (a = []) => this.t('Booking_CancelTerms_AfterConfirm', a);
    /** Translation lookup for `Booking_CancelTerms_Unanswered`. */
    Booking_CancelTerms_Unanswered: t = (a = []) => this.t('Booking_CancelTerms_Unanswered', a);
    /** Translation lookup for `Booking_CostHint_Decline`. */
    Booking_CostHint_Decline: t = (a = []) => this.t('Booking_CostHint_Decline', a);
    /** Translation lookup for `Booking_CostHint_CancelLesson`. */
    Booking_CostHint_CancelLesson: t = (a = []) => this.t('Booking_CostHint_CancelLesson', a);
    /** Translation lookup for `Booking_RefundInfo`. */
    Booking_RefundInfo: t = (a = []) => this.t('Booking_RefundInfo', a);
    /** Translation lookup for `Booking_MessageExpert`. */
    Booking_MessageExpert: t = (a = []) => this.t('Booking_MessageExpert', a);
    /** Translation lookup for `Booking_MessageUser`. */
    Booking_MessageUser: t = (a = []) => this.t('Booking_MessageUser', a);
    /** Translation lookup for `Booking_Reject`. */
    Booking_Reject: t = (a = []) => this.t('Booking_Reject', a);
    /** Translation lookup for `Booking_User`. */
    Booking_User: t = (a = []) => this.t('Booking_User', a);
    /** Translation lookup for `Bookings_IncomingTitle`. */
    Bookings_IncomingTitle: t = (a = []) => this.t('Bookings_IncomingTitle', a);
    /** Translation lookup for `Booking_RejectReasonLabel`. */
    Booking_RejectReasonLabel: t = (a = []) => this.t('Booking_RejectReasonLabel', a);
    /** Translation lookup for `Booking_RejectReasonPlaceholder`. */
    Booking_RejectReasonPlaceholder: t = (a = []) => this.t('Booking_RejectReasonPlaceholder', a);
    /** Translation lookup for `Booking_RejectReasonRequired`. */
    Booking_RejectReasonRequired: t = (a = []) => this.t('Booking_RejectReasonRequired', a);
    /** Translation lookup for `Booking_RejectTitle`. */
    Booking_RejectTitle: t = (a = []) => this.t('Booking_RejectTitle', a);
    /** Translation lookup for `Booking_RejectSuccess`. */
    Booking_RejectSuccess: t = (a = []) => this.t('Booking_RejectSuccess', a);
    /** Translation lookup for `Booking_DeclineCard`. */
    Booking_DeclineCard: t = (a = []) => this.t('Booking_DeclineCard', a);
    /** Translation lookup for `Booking_CancelLessonCard`. */
    Booking_CancelLessonCard: t = (a = []) => this.t('Booking_CancelLessonCard', a);
    /** Translation lookup for `Booking_CancelLessonTitle`. */
    Booking_CancelLessonTitle: t = (a = []) => this.t('Booking_CancelLessonTitle', a);
    /** Translation lookup for `Booking_CancelLessonReasonLabel`. */
    Booking_CancelLessonReasonLabel: t = (a = []) => this.t('Booking_CancelLessonReasonLabel', a);
    /** Translation lookup for `Booking_CancelLessonReasonPlaceholder`. */
    Booking_CancelLessonReasonPlaceholder: t = (a = []) => this.t('Booking_CancelLessonReasonPlaceholder', a);
    /** Translation lookup for `Booking_CancelLessonSubmit`. */
    Booking_CancelLessonSubmit: t = (a = []) => this.t('Booking_CancelLessonSubmit', a);
    /** Translation lookup for `Booking_CancelLessonSuccess`. */
    Booking_CancelLessonSuccess: t = (a = []) => this.t('Booking_CancelLessonSuccess', a);
    /** Translation lookup for `Booking_ConfirmSuccess`. */
    Booking_ConfirmSuccess: t = (a = []) => this.t('Booking_ConfirmSuccess', a);
    /** Translation lookup for `Booking_GroupCount`. */
    Booking_GroupCount: t = (a = []) => this.t('Booking_GroupCount', a);
    /** Translation lookup for `Booking_PenaltyWarning`. */
    Booking_PenaltyWarning: t = (a = []) => this.t('Booking_PenaltyWarning', a);
    /** Translation lookup for `Booking_PenaltyKeptByExpert`. */
    Booking_PenaltyKeptByExpert: t = (a = []) => this.t('Booking_PenaltyKeptByExpert', a);
    /** Translation lookup for `Booking_RefundAmount`. */
    Booking_RefundAmount: t = (a = []) => this.t('Booking_RefundAmount', a);
    /** Translation lookup for `Booking_DeclineImpact`. */
    Booking_DeclineImpact: t = (a = []) => this.t('Booking_DeclineImpact', a);
    /** Translation lookup for `Booking_CancelLessonImpact`. */
    Booking_CancelLessonImpact: t = (a = []) => this.t('Booking_CancelLessonImpact', a);
    /** Translation lookup for `Booking_CancelImpact`. */
    Booking_CancelImpact: t = (a = []) => this.t('Booking_CancelImpact', a);
    /** Translation lookup for `Booking_WithdrawImpact`. */
    Booking_WithdrawImpact: t = (a = []) => this.t('Booking_WithdrawImpact', a);
    /** Translation lookup for `Booking_Submitting`. */
    Booking_Submitting: t = (a = []) => this.t('Booking_Submitting', a);
    /** Translation lookup for `Booking_InsufficientBalance`. */
    Booking_InsufficientBalance: t = (a = []) => this.t('Booking_InsufficientBalance', a);
    /** Translation lookup for `Email_BookingCreated_Subject`. */
    Email_BookingCreated_Subject: t = (a = []) => this.t('Email_BookingCreated_Subject', a);
    /** Translation lookup for `Email_BookingCreated_Title`. */
    Email_BookingCreated_Title: t = (a = []) => this.t('Email_BookingCreated_Title', a);
    /** Translation lookup for `Email_BookingCreated_Body`. */
    Email_BookingCreated_Body: t = (a = []) => this.t('Email_BookingCreated_Body', a);
    /** Translation lookup for `Email_BookingConfirmed_Subject`. */
    Email_BookingConfirmed_Subject: t = (a = []) => this.t('Email_BookingConfirmed_Subject', a);
    /** Translation lookup for `Email_BookingConfirmed_Title`. */
    Email_BookingConfirmed_Title: t = (a = []) => this.t('Email_BookingConfirmed_Title', a);
    /** Translation lookup for `Email_BookingConfirmed_Body`. */
    Email_BookingConfirmed_Body: t = (a = []) => this.t('Email_BookingConfirmed_Body', a);
    /** Translation lookup for `Email_BookingRejected_Subject`. */
    Email_BookingRejected_Subject: t = (a = []) => this.t('Email_BookingRejected_Subject', a);
    /** Translation lookup for `Email_BookingRejected_Title`. */
    Email_BookingRejected_Title: t = (a = []) => this.t('Email_BookingRejected_Title', a);
    /** Translation lookup for `Email_BookingRejected_Body`. */
    Email_BookingRejected_Body: t = (a = []) => this.t('Email_BookingRejected_Body', a);
    /** Translation lookup for `Email_BookingMissedResponse_Subject`. */
    Email_BookingMissedResponse_Subject: t = (a = []) => this.t('Email_BookingMissedResponse_Subject', a);
    /** Translation lookup for `Email_BookingMissedResponse_Title`. */
    Email_BookingMissedResponse_Title: t = (a = []) => this.t('Email_BookingMissedResponse_Title', a);
    /** Translation lookup for `Email_BookingMissedResponse_Body`. */
    Email_BookingMissedResponse_Body: t = (a = []) => this.t('Email_BookingMissedResponse_Body', a);
    /** Translation lookup for `Email_BookingCancelled_Subject`. */
    Email_BookingCancelled_Subject: t = (a = []) => this.t('Email_BookingCancelled_Subject', a);
    /** Translation lookup for `Email_BookingCancelled_Title`. */
    Email_BookingCancelled_Title: t = (a = []) => this.t('Email_BookingCancelled_Title', a);
    /** Translation lookup for `Email_BookingCancelled_Body`. */
    Email_BookingCancelled_Body: t = (a = []) => this.t('Email_BookingCancelled_Body', a);
    /** Translation lookup for `Email_BookingRescheduled_Subject`. */
    Email_BookingRescheduled_Subject: t = (a = []) => this.t('Email_BookingRescheduled_Subject', a);
    /** Translation lookup for `Email_BookingRescheduled_Title`. */
    Email_BookingRescheduled_Title: t = (a = []) => this.t('Email_BookingRescheduled_Title', a);
    /** Translation lookup for `Email_Row_RescheduledFrom`. */
    Email_Row_RescheduledFrom: t = (a = []) => this.t('Email_Row_RescheduledFrom', a);
    /** Translation lookup for `Email_Row_RescheduledTo`. */
    Email_Row_RescheduledTo: t = (a = []) => this.t('Email_Row_RescheduledTo', a);
    /** Translation lookup for `Email_Row_RescheduledBy`. */
    Email_Row_RescheduledBy: t = (a = []) => this.t('Email_Row_RescheduledBy', a);
    /** Translation lookup for `Email_Reschedule_NoMoney`. */
    Email_Reschedule_NoMoney: t = (a = []) => this.t('Email_Reschedule_NoMoney', a);
    /** Translation lookup for `Email_Reminder_Subject_1d`. */
    Email_Reminder_Subject_1d: t = (a = []) => this.t('Email_Reminder_Subject_1d', a);
    /** Translation lookup for `Email_Reminder_Subject_2h`. */
    Email_Reminder_Subject_2h: t = (a = []) => this.t('Email_Reminder_Subject_2h', a);
    /** Translation lookup for `Email_Reminder_Title_1d`. */
    Email_Reminder_Title_1d: t = (a = []) => this.t('Email_Reminder_Title_1d', a);
    /** Translation lookup for `Email_Reminder_Title_2h`. */
    Email_Reminder_Title_2h: t = (a = []) => this.t('Email_Reminder_Title_2h', a);
    /** Translation lookup for `Email_Reminder_Body_Student`. */
    Email_Reminder_Body_Student: t = (a = []) => this.t('Email_Reminder_Body_Student', a);
    /** Translation lookup for `Email_Reminder_Body_Expert`. */
    Email_Reminder_Body_Expert: t = (a = []) => this.t('Email_Reminder_Body_Expert', a);
    /** Translation lookup for `Email_Row_Students`. */
    Email_Row_Students: t = (a = []) => this.t('Email_Row_Students', a);
    /** Translation lookup for `Email_Cta_OpenSlot`. */
    Email_Cta_OpenSlot: t = (a = []) => this.t('Email_Cta_OpenSlot', a);
    /** Translation lookup for `Email_NewMessage_Subject`. */
    Email_NewMessage_Subject: t = (a = []) => this.t('Email_NewMessage_Subject', a);
    /** Translation lookup for `Email_NewMessage_Title`. */
    Email_NewMessage_Title: t = (a = []) => this.t('Email_NewMessage_Title', a);
    /** Translation lookup for `Email_NewMessage_Title_Plain`. */
    Email_NewMessage_Title_Plain: t = (a = []) => this.t('Email_NewMessage_Title_Plain', a);
    /** Translation lookup for `Email_NewMessage_Body`. */
    Email_NewMessage_Body: t = (a = []) => this.t('Email_NewMessage_Body', a);
    /** Translation lookup for `Email_SupportNewTicket_Subject`. */
    Email_SupportNewTicket_Subject: t = (a = []) => this.t('Email_SupportNewTicket_Subject', a);
    /** Translation lookup for `Email_SupportNewTicket_Title`. */
    Email_SupportNewTicket_Title: t = (a = []) => this.t('Email_SupportNewTicket_Title', a);
    /** Translation lookup for `Email_SupportNewTicket_Body`. */
    Email_SupportNewTicket_Body: t = (a = []) => this.t('Email_SupportNewTicket_Body', a);
    /** Translation lookup for `Email_SupportReply_Subject`. */
    Email_SupportReply_Subject: t = (a = []) => this.t('Email_SupportReply_Subject', a);
    /** Translation lookup for `Email_SupportReply_Title`. */
    Email_SupportReply_Title: t = (a = []) => this.t('Email_SupportReply_Title', a);
    /** Translation lookup for `Email_SupportReply_Body`. */
    Email_SupportReply_Body: t = (a = []) => this.t('Email_SupportReply_Body', a);
    /** Translation lookup for `Email_SupportUserReply_Subject`. */
    Email_SupportUserReply_Subject: t = (a = []) => this.t('Email_SupportUserReply_Subject', a);
    /** Translation lookup for `Email_SupportUserReply_Title`. */
    Email_SupportUserReply_Title: t = (a = []) => this.t('Email_SupportUserReply_Title', a);
    /** Translation lookup for `Email_SupportUserReply_Body`. */
    Email_SupportUserReply_Body: t = (a = []) => this.t('Email_SupportUserReply_Body', a);
    /** Translation lookup for `Email_ExpertApproved_Subject`. */
    Email_ExpertApproved_Subject: t = (a = []) => this.t('Email_ExpertApproved_Subject', a);
    /** Translation lookup for `Email_ExpertApproved_Title`. */
    Email_ExpertApproved_Title: t = (a = []) => this.t('Email_ExpertApproved_Title', a);
    /** Translation lookup for `Email_ExpertApproved_Body`. */
    Email_ExpertApproved_Body: t = (a = []) => this.t('Email_ExpertApproved_Body', a);
    /** Translation lookup for `Email_ExpertRejected_Subject`. */
    Email_ExpertRejected_Subject: t = (a = []) => this.t('Email_ExpertRejected_Subject', a);
    /** Translation lookup for `Email_ExpertRejected_Title`. */
    Email_ExpertRejected_Title: t = (a = []) => this.t('Email_ExpertRejected_Title', a);
    /** Translation lookup for `Email_ExpertRejected_Body`. */
    Email_ExpertRejected_Body: t = (a = []) => this.t('Email_ExpertRejected_Body', a);
    /** Translation lookup for `Email_Cta_OpenExpertPanel`. */
    Email_Cta_OpenExpertPanel: t = (a = []) => this.t('Email_Cta_OpenExpertPanel', a);
    /** Translation lookup for `Email_Cta_ContactSupport`. */
    Email_Cta_ContactSupport: t = (a = []) => this.t('Email_Cta_ContactSupport', a);
    /** Translation lookup for `Email_Row_User`. */
    Email_Row_User: t = (a = []) => this.t('Email_Row_User', a);
    /** Translation lookup for `Email_Row_Expert`. */
    Email_Row_Expert: t = (a = []) => this.t('Email_Row_Expert', a);
    /** Translation lookup for `Email_Row_DateTime`. */
    Email_Row_DateTime: t = (a = []) => this.t('Email_Row_DateTime', a);
    /** Translation lookup for `Email_Row_Duration`. */
    Email_Row_Duration: t = (a = []) => this.t('Email_Row_Duration', a);
    /** Translation lookup for `Email_Row_Reason`. */
    Email_Row_Reason: t = (a = []) => this.t('Email_Row_Reason', a);
    /** Translation lookup for `Email_Row_GroupLesson`. */
    Email_Row_GroupLesson: t = (a = []) => this.t('Email_Row_GroupLesson', a);
    /** Translation lookup for `Email_GroupLesson_Value`. */
    Email_GroupLesson_Value: t = (a = []) => this.t('Email_GroupLesson_Value', a);
    /** Translation lookup for `Email_Row_CancelledBy`. */
    Email_Row_CancelledBy: t = (a = []) => this.t('Email_Row_CancelledBy', a);
    /** Translation lookup for `Email_Row_From`. */
    Email_Row_From: t = (a = []) => this.t('Email_Row_From', a);
    /** Translation lookup for `Email_Row_Message`. */
    Email_Row_Message: t = (a = []) => this.t('Email_Row_Message', a);
    /** Translation lookup for `Email_Row_Subject`. */
    Email_Row_Subject: t = (a = []) => this.t('Email_Row_Subject', a);
    /** Translation lookup for `Email_Row_TicketId`. */
    Email_Row_TicketId: t = (a = []) => this.t('Email_Row_TicketId', a);
    /** Translation lookup for `Email_Row_Timezone`. */
    Email_Row_Timezone: t = (a = []) => this.t('Email_Row_Timezone', a);
    /** Translation lookup for `Email_Cta_OpenBooking`. */
    Email_Cta_OpenBooking: t = (a = []) => this.t('Email_Cta_OpenBooking', a);
    /** Translation lookup for `Email_Cta_FindAnotherSlot`. */
    Email_Cta_FindAnotherSlot: t = (a = []) => this.t('Email_Cta_FindAnotherSlot', a);
    /** Translation lookup for `Email_Cta_OpenChat`. */
    Email_Cta_OpenChat: t = (a = []) => this.t('Email_Cta_OpenChat', a);
    /** Translation lookup for `Email_Cta_OpenTicket`. */
    Email_Cta_OpenTicket: t = (a = []) => this.t('Email_Cta_OpenTicket', a);
    /** Translation lookup for `Email_Footer_Note`. */
    Email_Footer_Note: t = (a = []) => this.t('Email_Footer_Note', a);
    /** Translation lookup for `Email_Footer_Contact`. */
    Email_Footer_Contact: t = (a = []) => this.t('Email_Footer_Contact', a);
    /** Translation lookup for `Email_Stub_ExpertName`. */
    Email_Stub_ExpertName: t = (a = []) => this.t('Email_Stub_ExpertName', a);
    /** Translation lookup for `Email_Stub_UserName`. */
    Email_Stub_UserName: t = (a = []) => this.t('Email_Stub_UserName', a);
    /** Translation lookup for `Email_Stub_Reason`. */
    Email_Stub_Reason: t = (a = []) => this.t('Email_Stub_Reason', a);
    /** Translation lookup for `Email_Stub_MessagePreview`. */
    Email_Stub_MessagePreview: t = (a = []) => this.t('Email_Stub_MessagePreview', a);
    /** Translation lookup for `Email_Stub_TicketSubject`. */
    Email_Stub_TicketSubject: t = (a = []) => this.t('Email_Stub_TicketSubject', a);
    /** Translation lookup for `Email_Stub_CancelledBy`. */
    Email_Stub_CancelledBy: t = (a = []) => this.t('Email_Stub_CancelledBy', a);
    /** Translation lookup for `RequestLog_Date`. */
    RequestLog_Date: t = (a = []) => this.t('RequestLog_Date', a);
    /** Translation lookup for `RequestLog_NoData`. */
    RequestLog_NoData: t = (a = []) => this.t('RequestLog_NoData', a);
    /** Translation lookup for `RequestLog_Method`. */
    RequestLog_Method: t = (a = []) => this.t('RequestLog_Method', a);
    /** Translation lookup for `RequestLog_Uri`. */
    RequestLog_Uri: t = (a = []) => this.t('RequestLog_Uri', a);
    /** Translation lookup for `RequestLog_Status`. */
    RequestLog_Status: t = (a = []) => this.t('RequestLog_Status', a);
    /** Translation lookup for `RequestLog_Duration`. */
    RequestLog_Duration: t = (a = []) => this.t('RequestLog_Duration', a);
    /** Translation lookup for `RequestLog_Account`. */
    RequestLog_Account: t = (a = []) => this.t('RequestLog_Account', a);
    /** Translation lookup for `RequestLog_Ip`. */
    RequestLog_Ip: t = (a = []) => this.t('RequestLog_Ip', a);
    /** Translation lookup for `RequestLog_Time`. */
    RequestLog_Time: t = (a = []) => this.t('RequestLog_Time', a);
    /** Translation lookup for `RequestLog_Ua`. */
    RequestLog_Ua: t = (a = []) => this.t('RequestLog_Ua', a);
    /** Translation lookup for `Ledger_External`. */
    Ledger_External: t = (a = []) => this.t('Ledger_External', a);
    /** Translation lookup for `Ledger_System`. */
    Ledger_System: t = (a = []) => this.t('Ledger_System', a);
    /** Translation lookup for `Ledger_Type_TopUp`. */
    Ledger_Type_TopUp: t = (a = []) => this.t('Ledger_Type_TopUp', a);
    /** Translation lookup for `Ledger_Type_Invoice`. */
    Ledger_Type_Invoice: t = (a = []) => this.t('Ledger_Type_Invoice', a);
    /** Translation lookup for `Ledger_Type_Payment`. */
    Ledger_Type_Payment: t = (a = []) => this.t('Ledger_Type_Payment', a);
    /** Translation lookup for `Ledger_Type_Refund`. */
    Ledger_Type_Refund: t = (a = []) => this.t('Ledger_Type_Refund', a);
    /** Translation lookup for `Ledger_Note_AutoCancel`. */
    Ledger_Note_AutoCancel: t = (a = []) => this.t('Ledger_Note_AutoCancel', a);
    /** Translation lookup for `Ledger_Note_Penalty`. */
    Ledger_Note_Penalty: t = (a = []) => this.t('Ledger_Note_Penalty', a);
    /** Translation lookup for `Ledger_Note_ExpertKeepsPenalty`. */
    Ledger_Note_ExpertKeepsPenalty: t = (a = []) => this.t('Ledger_Note_ExpertKeepsPenalty', a);
    /** Translation lookup for `Ledger_Type_Manual`. */
    Ledger_Type_Manual: t = (a = []) => this.t('Ledger_Type_Manual', a);
    /** Translation lookup for `Balance_Title`. */
    Balance_Title: t = (a = []) => this.t('Balance_Title', a);
    /** Translation lookup for `Balance_TopUp`. */
    Balance_TopUp: t = (a = []) => this.t('Balance_TopUp', a);
    /** Translation lookup for `Balance_Amount`. */
    Balance_Amount: t = (a = []) => this.t('Balance_Amount', a);
    /** Translation lookup for `Balance_History`. */
    Balance_History: t = (a = []) => this.t('Balance_History', a);
    /** Translation lookup for `Balance_NoHistory`. */
    Balance_NoHistory: t = (a = []) => this.t('Balance_NoHistory', a);
    /** Translation lookup for `Balance_TopUpAmount`. */
    Balance_TopUpAmount: t = (a = []) => this.t('Balance_TopUpAmount', a);
    /** Translation lookup for `Balance_TopUpPlaceholder`. */
    Balance_TopUpPlaceholder: t = (a = []) => this.t('Balance_TopUpPlaceholder', a);
    /** Translation lookup for `Balance_TopUpNotice`. */
    Balance_TopUpNotice: t = (a = []) => this.t('Balance_TopUpNotice', a);
    /** Translation lookup for `Balance_TopUpSuccess`. */
    Balance_TopUpSuccess: t = (a = []) => this.t('Balance_TopUpSuccess', a);
    /** Translation lookup for `Balance_LedgerNote_TopUp`. */
    Balance_LedgerNote_TopUp: t = (a = []) => this.t('Balance_LedgerNote_TopUp', a);
    /** Translation lookup for `Balance_LedgerReason_Lesson`. */
    Balance_LedgerReason_Lesson: t = (a = []) => this.t('Balance_LedgerReason_Lesson', a);
    /** Translation lookup for `Balance_Current`. */
    Balance_Current: t = (a = []) => this.t('Balance_Current', a);
    /** Translation lookup for `Ledger_RefBooking`. */
    Ledger_RefBooking: t = (a = []) => this.t('Ledger_RefBooking', a);
    /** Translation lookup for `Invite_FirstStep_Title`. */
    Invite_FirstStep_Title: t = (a = []) => this.t('Invite_FirstStep_Title', a);
    /** Translation lookup for `Invite_Error_Title`. */
    Invite_Error_Title: t = (a = []) => this.t('Invite_Error_Title', a);
    /** Translation lookup for `Invite_Error_Unknown`. */
    Invite_Error_Unknown: t = (a = []) => this.t('Invite_Error_Unknown', a);
    /** Translation lookup for `Invite_Error_Expired`. */
    Invite_Error_Expired: t = (a = []) => this.t('Invite_Error_Expired', a);
    /** Translation lookup for `Invite_Error_Exhausted`. */
    Invite_Error_Exhausted: t = (a = []) => this.t('Invite_Error_Exhausted', a);
    /** Translation lookup for `Invite_Error_Disabled`. */
    Invite_Error_Disabled: t = (a = []) => this.t('Invite_Error_Disabled', a);
    /** Translation lookup for `Invite_Error_ContactSupport`. */
    Invite_Error_ContactSupport: t = (a = []) => this.t('Invite_Error_ContactSupport', a);
    /** Translation lookup for `Invite_Contact_Phone`. */
    Invite_Contact_Phone: t = (a = []) => this.t('Invite_Contact_Phone', a);
    /** Translation lookup for `Slots_Title`. */
    Slots_Title: t = (a = []) => this.t('Slots_Title', a);
    /** Translation lookup for `Teaching_Slots_Title`. */
    Teaching_Slots_Title: t = (a = []) => this.t('Teaching_Slots_Title', a);
    /** Translation lookup for `Teaching_Bookings_Title`. */
    Teaching_Bookings_Title: t = (a = []) => this.t('Teaching_Bookings_Title', a);
    /** Translation lookup for `Slot_Create`. */
    Slot_Create: t = (a = []) => this.t('Slot_Create', a);
    /** Translation lookup for `Slot_Date`. */
    Slot_Date: t = (a = []) => this.t('Slot_Date', a);
    /** Translation lookup for `Slot_Time`. */
    Slot_Time: t = (a = []) => this.t('Slot_Time', a);
    /** Translation lookup for `Slot_Cost`. */
    Slot_Cost: t = (a = []) => this.t('Slot_Cost', a);
    /** Translation lookup for `Slot_PenaltyPercent`. */
    Slot_PenaltyPercent: t = (a = []) => this.t('Slot_PenaltyPercent', a);
    /** Translation lookup for `Slot_PenaltyHelp`. */
    Slot_PenaltyHelp: t = (a = []) => this.t('Slot_PenaltyHelp', a);
    /** Translation lookup for `Slot_Online`. */
    Slot_Online: t = (a = []) => this.t('Slot_Online', a);
    /** Translation lookup for `Slot_Location`. */
    Slot_Location: t = (a = []) => this.t('Slot_Location', a);
    /** Translation lookup for `Slot_Platform`. */
    Slot_Platform: t = (a = []) => this.t('Slot_Platform', a);
    /** Translation lookup for `Slot_LocationPlaceholderOnline`. */
    Slot_LocationPlaceholderOnline: t = (a = []) => this.t('Slot_LocationPlaceholderOnline', a);
    /** Translation lookup for `Slot_LocationPlaceholderOffline`. */
    Slot_LocationPlaceholderOffline: t = (a = []) => this.t('Slot_LocationPlaceholderOffline', a);
    /** Translation lookup for `Slot_LocationHint`. */
    Slot_LocationHint: t = (a = []) => this.t('Slot_LocationHint', a);
    /** Translation lookup for `Slot_Book`. */
    Slot_Book: t = (a = []) => this.t('Slot_Book', a);
    /** Translation lookup for `Slot_Status_Free`. */
    Slot_Status_Free: t = (a = []) => this.t('Slot_Status_Free', a);
    /** Translation lookup for `Slot_Status_Booked`. */
    Slot_Status_Booked: t = (a = []) => this.t('Slot_Status_Booked', a);
    /** Translation lookup for `Slot_Status_Completed`. */
    Slot_Status_Completed: t = (a = []) => this.t('Slot_Status_Completed', a);
    /** Translation lookup for `Slot_Status_Expired`. */
    Slot_Status_Expired: t = (a = []) => this.t('Slot_Status_Expired', a);
    /** Translation lookup for `Slot_Status_Cancelled`. */
    Slot_Status_Cancelled: t = (a = []) => this.t('Slot_Status_Cancelled', a);
    /** Translation lookup for `Expert_PendingApproval`. */
    Expert_PendingApproval: t = (a = []) => this.t('Expert_PendingApproval', a);
    /** Translation lookup for `Slot_Duration`. */
    Slot_Duration: t = (a = []) => this.t('Slot_Duration', a);
    /** Translation lookup for `Slot_Duration_Min`. */
    Slot_Duration_Min: t = (a = []) => this.t('Slot_Duration_Min', a);
    /** Translation lookup for `Slot_MySlots`. */
    Slot_MySlots: t = (a = []) => this.t('Slot_MySlots', a);
    /** Translation lookup for `Slot_NoSlots`. */
    Slot_NoSlots: t = (a = []) => this.t('Slot_NoSlots', a);
    /** Translation lookup for `Slot_Status`. */
    Slot_Status: t = (a = []) => this.t('Slot_Status', a);
    /** Translation lookup for `Cal_Sun`. */
    Cal_Sun: t = (a = []) => this.t('Cal_Sun', a);
    /** Translation lookup for `Cal_Mon`. */
    Cal_Mon: t = (a = []) => this.t('Cal_Mon', a);
    /** Translation lookup for `Cal_Tue`. */
    Cal_Tue: t = (a = []) => this.t('Cal_Tue', a);
    /** Translation lookup for `Cal_Wed`. */
    Cal_Wed: t = (a = []) => this.t('Cal_Wed', a);
    /** Translation lookup for `Cal_Thu`. */
    Cal_Thu: t = (a = []) => this.t('Cal_Thu', a);
    /** Translation lookup for `Cal_Fri`. */
    Cal_Fri: t = (a = []) => this.t('Cal_Fri', a);
    /** Translation lookup for `Cal_Sat`. */
    Cal_Sat: t = (a = []) => this.t('Cal_Sat', a);
    /** Translation lookup for `Slot_Label`. */
    Slot_Label: t = (a = []) => this.t('Slot_Label', a);
    /** Translation lookup for `Slot_DateTime`. */
    Slot_DateTime: t = (a = []) => this.t('Slot_DateTime', a);
    /** Translation lookup for `Slot_Type`. */
    Slot_Type: t = (a = []) => this.t('Slot_Type', a);
    /** Translation lookup for `Slot_NoAvailable`. */
    Slot_NoAvailable: t = (a = []) => this.t('Slot_NoAvailable', a);
    /** Translation lookup for `Slot_Reset`. */
    Slot_Reset: t = (a = []) => this.t('Slot_Reset', a);
    /** Translation lookup for `Slot_BookSlot`. */
    Slot_BookSlot: t = (a = []) => this.t('Slot_BookSlot', a);
    /** Translation lookup for `Slot_AvailableSlots`. */
    Slot_AvailableSlots: t = (a = []) => this.t('Slot_AvailableSlots', a);
    /** Translation lookup for `Slot_Expert`. */
    Slot_Expert: t = (a = []) => this.t('Slot_Expert', a);
    /** Translation lookup for `Slot_About`. */
    Slot_About: t = (a = []) => this.t('Slot_About', a);
    /** Translation lookup for `Slot_MaxUsers`. */
    Slot_MaxUsers: t = (a = []) => this.t('Slot_MaxUsers', a);
    /** Translation lookup for `cal_shabbat`. */
    cal_shabbat: t = (a = []) => this.t('cal_shabbat', a);
    /** Translation lookup for `cal_erev_shabbat`. */
    cal_erev_shabbat: t = (a = []) => this.t('cal_erev_shabbat', a);
    /** Translation lookup for `cal_yom_tov`. */
    cal_yom_tov: t = (a = []) => this.t('cal_yom_tov', a);
    /** Translation lookup for `cal_yom_tov_named`. */
    cal_yom_tov_named: t = (a = []) => this.t('cal_yom_tov_named', a);
    /** Translation lookup for `cal_erev_yom_tov`. */
    cal_erev_yom_tov: t = (a = []) => this.t('cal_erev_yom_tov', a);
    /** Translation lookup for `cal_fast`. */
    cal_fast: t = (a = []) => this.t('cal_fast', a);
    /** Translation lookup for `cal_fast_named`. */
    cal_fast_named: t = (a = []) => this.t('cal_fast_named', a);
    /** Translation lookup for `cal_erev_fast`. */
    cal_erev_fast: t = (a = []) => this.t('cal_erev_fast', a);
    /** Translation lookup for `cal_rosh_chodesh`. */
    cal_rosh_chodesh: t = (a = []) => this.t('cal_rosh_chodesh', a);
    /** Translation lookup for `cal_erev_rosh_chodesh`. */
    cal_erev_rosh_chodesh: t = (a = []) => this.t('cal_erev_rosh_chodesh', a);
    /** Translation lookup for `Slot_Edit`. */
    Slot_Edit: t = (a = []) => this.t('Slot_Edit', a);
    /** Translation lookup for `Slot_Cancel`. */
    Slot_Cancel: t = (a = []) => this.t('Slot_Cancel', a);
    /** Translation lookup for `Slot_Delete`. */
    Slot_Delete: t = (a = []) => this.t('Slot_Delete', a);
    /** Translation lookup for `Slot_Complete`. */
    Slot_Complete: t = (a = []) => this.t('Slot_Complete', a);
    /** Translation lookup for `Slot_Save`. */
    Slot_Save: t = (a = []) => this.t('Slot_Save', a);
    /** Translation lookup for `Slot_EditTitle`. */
    Slot_EditTitle: t = (a = []) => this.t('Slot_EditTitle', a);
    /** Translation lookup for `Slot_CancelConfirm`. */
    Slot_CancelConfirm: t = (a = []) => this.t('Slot_CancelConfirm', a);
    /** Translation lookup for `Slot_DeleteConfirm`. */
    Slot_DeleteConfirm: t = (a = []) => this.t('Slot_DeleteConfirm', a);
    /** Translation lookup for `Study_UpcomingBookings`. */
    Study_UpcomingBookings: t = (a = []) => this.t('Study_UpcomingBookings', a);
    /** Translation lookup for `Study_NoBookings`. */
    Study_NoBookings: t = (a = []) => this.t('Study_NoBookings', a);
    /** Translation lookup for `Study_TotalBookings`. */
    Study_TotalBookings: t = (a = []) => this.t('Study_TotalBookings', a);
    /** Translation lookup for `Study_CompletedBookings`. */
    Study_CompletedBookings: t = (a = []) => this.t('Study_CompletedBookings', a);
    /** Translation lookup for `Study_ActiveBookings`. */
    Study_ActiveBookings: t = (a = []) => this.t('Study_ActiveBookings', a);
    /** Translation lookup for `Teaching_Declines`. */
    Teaching_Declines: t = (a = []) => this.t('Teaching_Declines', a);
    /** Translation lookup for `Teaching_Cancellations`. */
    Teaching_Cancellations: t = (a = []) => this.t('Teaching_Cancellations', a);
    /** Translation lookup for `Slots_Calendar`. */
    Slots_Calendar: t = (a = []) => this.t('Slots_Calendar', a);
    /** Translation lookup for `Slots_PrevWeek`. */
    Slots_PrevWeek: t = (a = []) => this.t('Slots_PrevWeek', a);
    /** Translation lookup for `Slots_NextWeek`. */
    Slots_NextWeek: t = (a = []) => this.t('Slots_NextWeek', a);
    /** Translation lookup for `Slots_Today`. */
    Slots_Today: t = (a = []) => this.t('Slots_Today', a);
    /** Translation lookup for `Slots_Morning`. */
    Slots_Morning: t = (a = []) => this.t('Slots_Morning', a);
    /** Translation lookup for `Slots_Day`. */
    Slots_Day: t = (a = []) => this.t('Slots_Day', a);
    /** Translation lookup for `Slots_Evening`. */
    Slots_Evening: t = (a = []) => this.t('Slots_Evening', a);
    /** Translation lookup for `Slots_AllExperts`. */
    Slots_AllExperts: t = (a = []) => this.t('Slots_AllExperts', a);
    /** Translation lookup for `Slots_Individual`. */
    Slots_Individual: t = (a = []) => this.t('Slots_Individual', a);
    /** Translation lookup for `Slots_Group`. */
    Slots_Group: t = (a = []) => this.t('Slots_Group', a);
    /** Translation lookup for `Slots_Online`. */
    Slots_Online: t = (a = []) => this.t('Slots_Online', a);
    /** Translation lookup for `Slots_Offline`. */
    Slots_Offline: t = (a = []) => this.t('Slots_Offline', a);
    /** Translation lookup for `Slots_PriceRange`. */
    Slots_PriceRange: t = (a = []) => this.t('Slots_PriceRange', a);
    /** Translation lookup for `Slots_NoSlots`. */
    Slots_NoSlots: t = (a = []) => this.t('Slots_NoSlots', a);
    /** Translation lookup for `Slot_Format`. */
    Slot_Format: t = (a = []) => this.t('Slot_Format', a);
    /** Translation lookup for `Slot_Seats`. */
    Slot_Seats: t = (a = []) => this.t('Slot_Seats', a);
    /** Translation lookup for `Slot_GroupBadge`. */
    Slot_GroupBadge: t = (a = []) => this.t('Slot_GroupBadge', a);
    /** Translation lookup for `Slot_SeatsLeft`. */
    Slot_SeatsLeft: t = (a = []) => this.t('Slot_SeatsLeft', a);
    /** Translation lookup for `Slot_SeatsTaken`. */
    Slot_SeatsTaken: t = (a = []) => this.t('Slot_SeatsTaken', a);
    /** Translation lookup for `Slot_Rescheduled`. */
    Slot_Rescheduled: t = (a = []) => this.t('Slot_Rescheduled', a);
    /** Translation lookup for `Slot_PlaceUpdated`. */
    Slot_PlaceUpdated: t = (a = []) => this.t('Slot_PlaceUpdated', a);
    /** Translation lookup for `Slot_Saved`. */
    Slot_Saved: t = (a = []) => this.t('Slot_Saved', a);
    /** Translation lookup for `Slot_ReschedulePastError`. */
    Slot_ReschedulePastError: t = (a = []) => this.t('Slot_ReschedulePastError', a);
    /** Translation lookup for `Slots_NoMatch`. */
    Slots_NoMatch: t = (a = []) => this.t('Slots_NoMatch', a);
    /** Translation lookup for `Slots_FilterAll`. */
    Slots_FilterAll: t = (a = []) => this.t('Slots_FilterAll', a);
    /** Translation lookup for `Slots_FilterFree`. */
    Slots_FilterFree: t = (a = []) => this.t('Slots_FilterFree', a);
    /** Translation lookup for `Slots_FilterMine`. */
    Slots_FilterMine: t = (a = []) => this.t('Slots_FilterMine', a);
    /** Translation lookup for `Slots_FilterPending`. */
    Slots_FilterPending: t = (a = []) => this.t('Slots_FilterPending', a);
    /** Translation lookup for `Slots_FilterConfirmed`. */
    Slots_FilterConfirmed: t = (a = []) => this.t('Slots_FilterConfirmed', a);
    /** Translation lookup for `Slots_FilterCancelled`. */
    Slots_FilterCancelled: t = (a = []) => this.t('Slots_FilterCancelled', a);
    /** Translation lookup for `Slots_FilterPast`. */
    Slots_FilterPast: t = (a = []) => this.t('Slots_FilterPast', a);
    /** Translation lookup for `Expert_Cancellations`. */
    Expert_Cancellations: t = (a = []) => this.t('Expert_Cancellations', a);
    /** Translation lookup for `Expert_Declines`. */
    Expert_Declines: t = (a = []) => this.t('Expert_Declines', a);
    /** Translation lookup for `Expert_Conducted`. */
    Expert_Conducted: t = (a = []) => this.t('Expert_Conducted', a);
    /** Translation lookup for `Expert_Missed`. */
    Expert_Missed: t = (a = []) => this.t('Expert_Missed', a);
    /** Translation lookup for `Expert_MissedHint`. */
    Expert_MissedHint: t = (a = []) => this.t('Expert_MissedHint', a);
    /** Translation lookup for `Slot_OwnSlot`. */
    Slot_OwnSlot: t = (a = []) => this.t('Slot_OwnSlot', a);
    /** Translation lookup for `Expert_Upcoming`. */
    Expert_Upcoming: t = (a = []) => this.t('Expert_Upcoming', a);
    /** Translation lookup for `Expert_Stats`. */
    Expert_Stats: t = (a = []) => this.t('Expert_Stats', a);
    /** Translation lookup for `Slot_User`. */
    Slot_User: t = (a = []) => this.t('Slot_User', a);
    /** Translation lookup for `Slot_OverlapError`. */
    Slot_OverlapError: t = (a = []) => this.t('Slot_OverlapError', a);
    /** Translation lookup for `Slot_Created`. */
    Slot_Created: t = (a = []) => this.t('Slot_Created', a);
    /** Translation lookup for `Slot_Error_DateTimeRequired`. */
    Slot_Error_DateTimeRequired: t = (a = []) => this.t('Slot_Error_DateTimeRequired', a);
    /** Translation lookup for `Slot_Error_RangeRequired`. */
    Slot_Error_RangeRequired: t = (a = []) => this.t('Slot_Error_RangeRequired', a);
    /** Translation lookup for `Slot_Error_InvalidCost`. */
    Slot_Error_InvalidCost: t = (a = []) => this.t('Slot_Error_InvalidCost', a);
    /** Translation lookup for `Slot_Error_InvalidDateTime`. */
    Slot_Error_InvalidDateTime: t = (a = []) => this.t('Slot_Error_InvalidDateTime', a);
    /** Translation lookup for `Slot_Error_PastSlot`. */
    Slot_Error_PastSlot: t = (a = []) => this.t('Slot_Error_PastSlot', a);
    /** Translation lookup for `Slot_Error_NoSlots`. */
    Slot_Error_NoSlots: t = (a = []) => this.t('Slot_Error_NoSlots', a);
    /** Translation lookup for `Slot_Error_AccessDenied`. */
    Slot_Error_AccessDenied: t = (a = []) => this.t('Slot_Error_AccessDenied', a);
    /** Translation lookup for `Slot_Error_OnlyFreeEditable`. */
    Slot_Error_OnlyFreeEditable: t = (a = []) => this.t('Slot_Error_OnlyFreeEditable', a);
    /** Translation lookup for `Slot_Error_BookedOnlyLocation`. */
    Slot_Error_BookedOnlyLocation: t = (a = []) => this.t('Slot_Error_BookedOnlyLocation', a);
    /** Translation lookup for `Slot_EditPlaceOnly`. */
    Slot_EditPlaceOnly: t = (a = []) => this.t('Slot_EditPlaceOnly', a);
    /** Translation lookup for `Slot_EditLockedNotice`. */
    Slot_EditLockedNotice: t = (a = []) => this.t('Slot_EditLockedNotice', a);
    /** Translation lookup for `Slot_Error_PastNotEditable`. */
    Slot_Error_PastNotEditable: t = (a = []) => this.t('Slot_Error_PastNotEditable', a);
    /** Translation lookup for `Slot_Error_CostLockedByBookings`. */
    Slot_Error_CostLockedByBookings: t = (a = []) => this.t('Slot_Error_CostLockedByBookings', a);
    /** Translation lookup for `Slot_Error_PastReschedule`. */
    Slot_Error_PastReschedule: t = (a = []) => this.t('Slot_Error_PastReschedule', a);
    /** Translation lookup for `Slot_Error_SlotTaken`. */
    Slot_Error_SlotTaken: t = (a = []) => this.t('Slot_Error_SlotTaken', a);
    /** Translation lookup for `Slot_Error_OnlyFreeDeletable`. */
    Slot_Error_OnlyFreeDeletable: t = (a = []) => this.t('Slot_Error_OnlyFreeDeletable', a);
    /** Translation lookup for `Slot_Error_PastNotDeletable`. */
    Slot_Error_PastNotDeletable: t = (a = []) => this.t('Slot_Error_PastNotDeletable', a);
    /** Translation lookup for `Slot_Error_DeleteLockedByBookings`. */
    Slot_Error_DeleteLockedByBookings: t = (a = []) => this.t('Slot_Error_DeleteLockedByBookings', a);
    /** Translation lookup for `Slot_Error_MaxUsersBelowBooked`. */
    Slot_Error_MaxUsersBelowBooked: t = (a = []) => this.t('Slot_Error_MaxUsersBelowBooked', a);
    /** Translation lookup for `Slots_OwnHiddenNotice`. */
    Slots_OwnHiddenNotice: t = (a = []) => this.t('Slots_OwnHiddenNotice', a);
    /** Translation lookup for `Slot_Moved`. */
    Slot_Moved: t = (a = []) => this.t('Slot_Moved', a);
    /** Translation lookup for `Slot_DragHint`. */
    Slot_DragHint: t = (a = []) => this.t('Slot_DragHint', a);
    /** Translation lookup for `Slot_CannotDropPast`. */
    Slot_CannotDropPast: t = (a = []) => this.t('Slot_CannotDropPast', a);
    /** Translation lookup for `Teaching_PendingBookingsTitle`. */
    Teaching_PendingBookingsTitle: t = (a = []) => this.t('Teaching_PendingBookingsTitle', a);
    /** Translation lookup for `Teaching_NoPendingBookings`. */
    Teaching_NoPendingBookings: t = (a = []) => this.t('Teaching_NoPendingBookings', a);
    /** Translation lookup for `Teaching_RejectBooking`. */
    Teaching_RejectBooking: t = (a = []) => this.t('Teaching_RejectBooking', a);
    /** Translation lookup for `Teaching_ConfirmedBookingsTitle`. */
    Teaching_ConfirmedBookingsTitle: t = (a = []) => this.t('Teaching_ConfirmedBookingsTitle', a);
    /** Translation lookup for `Teaching_NoConfirmedBookings`. */
    Teaching_NoConfirmedBookings: t = (a = []) => this.t('Teaching_NoConfirmedBookings', a);
    /** Translation lookup for `Slot_Filter_Pending`. */
    Slot_Filter_Pending: t = (a = []) => this.t('Slot_Filter_Pending', a);
    /** Translation lookup for `Slot_Details`. */
    Slot_Details: t = (a = []) => this.t('Slot_Details', a);
    /** Translation lookup for `Slot_PricePaid`. */
    Slot_PricePaid: t = (a = []) => this.t('Slot_PricePaid', a);
    /** Translation lookup for `Slot_CancelReason`. */
    Slot_CancelReason: t = (a = []) => this.t('Slot_CancelReason', a);
    /** Translation lookup for `Slot_Offline`. */
    Slot_Offline: t = (a = []) => this.t('Slot_Offline', a);
    /** Translation lookup for `Slot_WriteExpert`. */
    Slot_WriteExpert: t = (a = []) => this.t('Slot_WriteExpert', a);
    /** Translation lookup for `Slot_CancelBooking`. */
    Slot_CancelBooking: t = (a = []) => this.t('Slot_CancelBooking', a);
    /** Translation lookup for `Slot_DateLabel`. */
    Slot_DateLabel: t = (a = []) => this.t('Slot_DateLabel', a);
    /** Translation lookup for `Slot_Plural_1`. */
    Slot_Plural_1: t = (a = []) => this.t('Slot_Plural_1', a);
    /** Translation lookup for `Slot_Plural_2`. */
    Slot_Plural_2: t = (a = []) => this.t('Slot_Plural_2', a);
    /** Translation lookup for `Slot_Plural_5`. */
    Slot_Plural_5: t = (a = []) => this.t('Slot_Plural_5', a);
    /** Translation lookup for `Expert_ShowMoreSlots`. */
    Expert_ShowMoreSlots: t = (a = []) => this.t('Expert_ShowMoreSlots', a);
    /** Translation lookup for `Expert_AllSlotsShown`. */
    Expert_AllSlotsShown: t = (a = []) => this.t('Expert_AllSlotsShown', a);
    /** Translation lookup for `Slot_BookError_Self`. */
    Slot_BookError_Self: t = (a = []) => this.t('Slot_BookError_Self', a);
    /** Translation lookup for `Slot_BookError_NotUser`. */
    Slot_BookError_NotUser: t = (a = []) => this.t('Slot_BookError_NotUser', a);
    /** Translation lookup for `Slot_BookError_Unavailable`. */
    Slot_BookError_Unavailable: t = (a = []) => this.t('Slot_BookError_Unavailable', a);
    /** Translation lookup for `Slot_BookError_Past`. */
    Slot_BookError_Past: t = (a = []) => this.t('Slot_BookError_Past', a);
    /** Translation lookup for `Slot_BookError_Busy`. */
    Slot_BookError_Busy: t = (a = []) => this.t('Slot_BookError_Busy', a);
    /** Translation lookup for `Slot_BookError_AlreadyBooked`. */
    Slot_BookError_AlreadyBooked: t = (a = []) => this.t('Slot_BookError_AlreadyBooked', a);
    /** Translation lookup for `Slots_PageHint`. */
    Slots_PageHint: t = (a = []) => this.t('Slots_PageHint', a);
    /** Translation lookup for `Comment_ModerationNotice`. */
    Comment_ModerationNotice: t = (a = []) => this.t('Comment_ModerationNotice', a);
    /** Translation lookup for `Comment_SentForReview`. */
    Comment_SentForReview: t = (a = []) => this.t('Comment_SentForReview', a);
    /** Translation lookup for `Comment_StatusPending`. */
    Comment_StatusPending: t = (a = []) => this.t('Comment_StatusPending', a);
    /** Translation lookup for `Comment_StatusApproved`. */
    Comment_StatusApproved: t = (a = []) => this.t('Comment_StatusApproved', a);
    /** Translation lookup for `Comment_StatusRejected`. */
    Comment_StatusRejected: t = (a = []) => this.t('Comment_StatusRejected', a);
    /** Translation lookup for `Comment_StatusMine`. */
    Comment_StatusMine: t = (a = []) => this.t('Comment_StatusMine', a);
    /** Translation lookup for `Comment_Moderation`. */
    Comment_Moderation: t = (a = []) => this.t('Comment_Moderation', a);
    /** Translation lookup for `Comment_Approve`. */
    Comment_Approve: t = (a = []) => this.t('Comment_Approve', a);
    /** Translation lookup for `Comment_Reject`. */
    Comment_Reject: t = (a = []) => this.t('Comment_Reject', a);
    /** Translation lookup for `Comment_ApproveConfirm`. */
    Comment_ApproveConfirm: t = (a = []) => this.t('Comment_ApproveConfirm', a);
    /** Translation lookup for `Comment_RejectConfirm`. */
    Comment_RejectConfirm: t = (a = []) => this.t('Comment_RejectConfirm', a);
    /** Translation lookup for `Comment_Flag`. */
    Comment_Flag: t = (a = []) => this.t('Comment_Flag', a);
    /** Translation lookup for `Comment_StatusFlagged`. */
    Comment_StatusFlagged: t = (a = []) => this.t('Comment_StatusFlagged', a);
    /** Translation lookup for `Comment_ModeratorViewNotice`. */
    Comment_ModeratorViewNotice: t = (a = []) => this.t('Comment_ModeratorViewNotice', a);
    /** Translation lookup for `Comment_FlagConfirm`. */
    Comment_FlagConfirm: t = (a = []) => this.t('Comment_FlagConfirm', a);
    /** Translation lookup for `Comment_AuthorHidden`. */
    Comment_AuthorHidden: t = (a = []) => this.t('Comment_AuthorHidden', a);
    /** Translation lookup for `Comment_AuthorHiddenHint`. */
    Comment_AuthorHiddenHint: t = (a = []) => this.t('Comment_AuthorHiddenHint', a);
    /** Translation lookup for `Support_Title`. */
    Support_Title: t = (a = []) => this.t('Support_Title', a);
    /** Translation lookup for `Support_NewTicket`. */
    Support_NewTicket: t = (a = []) => this.t('Support_NewTicket', a);
    /** Translation lookup for `Support_Subject`. */
    Support_Subject: t = (a = []) => this.t('Support_Subject', a);
    /** Translation lookup for `Support_Message`. */
    Support_Message: t = (a = []) => this.t('Support_Message', a);
    /** Translation lookup for `Support_Send`. */
    Support_Send: t = (a = []) => this.t('Support_Send', a);
    /** Translation lookup for `Support_Reply`. */
    Support_Reply: t = (a = []) => this.t('Support_Reply', a);
    /** Translation lookup for `Support_NoTickets`. */
    Support_NoTickets: t = (a = []) => this.t('Support_NoTickets', a);
    /** Translation lookup for `Support_ClientContextTitle`. */
    Support_ClientContextTitle: t = (a = []) => this.t('Support_ClientContextTitle', a);
    /** Translation lookup for `Support_ClientContextEmpty`. */
    Support_ClientContextEmpty: t = (a = []) => this.t('Support_ClientContextEmpty', a);
    /** Translation lookup for `Support_NoMessages`. */
    Support_NoMessages: t = (a = []) => this.t('Support_NoMessages', a);
    /** Translation lookup for `Support_SelectTicket`. */
    Support_SelectTicket: t = (a = []) => this.t('Support_SelectTicket', a);
    /** Translation lookup for `Support_InternalComment`. */
    Support_InternalComment: t = (a = []) => this.t('Support_InternalComment', a);
    /** Translation lookup for `Support_Assignee`. */
    Support_Assignee: t = (a = []) => this.t('Support_Assignee', a);
    /** Translation lookup for `Support_Unassigned`. */
    Support_Unassigned: t = (a = []) => this.t('Support_Unassigned', a);
    /** Translation lookup for `Support_TicketUpdatedWhileTyping`. */
    Support_TicketUpdatedWhileTyping: t = (a = []) => this.t('Support_TicketUpdatedWhileTyping', a);
    /** Translation lookup for `Support_StaleReplySent`. */
    Support_StaleReplySent: t = (a = []) => this.t('Support_StaleReplySent', a);
    /** Translation lookup for `Support_HasAttachments`. */
    Support_HasAttachments: t = (a = []) => this.t('Support_HasAttachments', a);
    /** Translation lookup for `Support_Assign`. */
    Support_Assign: t = (a = []) => this.t('Support_Assign', a);
    /** Translation lookup for `Support_ChangeStatus`. */
    Support_ChangeStatus: t = (a = []) => this.t('Support_ChangeStatus', a);
    /** Translation lookup for `Support_AssignmentHistory`. */
    Support_AssignmentHistory: t = (a = []) => this.t('Support_AssignmentHistory', a);
    /** Translation lookup for `Support_Created`. */
    Support_Created: t = (a = []) => this.t('Support_Created', a);
    /** Translation lookup for `Support_Updated`. */
    Support_Updated: t = (a = []) => this.t('Support_Updated', a);
    /** Translation lookup for `Support_Waiting`. */
    Support_Waiting: t = (a = []) => this.t('Support_Waiting', a);
    /** Translation lookup for `Support_InternalNewer`. */
    Support_InternalNewer: t = (a = []) => this.t('Support_InternalNewer', a);
    /** Translation lookup for `Support_InternalNewerValue`. */
    Support_InternalNewerValue: t = (a = []) => this.t('Support_InternalNewerValue', a);
    /** Translation lookup for `Support_User`. */
    Support_User: t = (a = []) => this.t('Support_User', a);
    /** Translation lookup for `Support_TicketCreated`. */
    Support_TicketCreated: t = (a = []) => this.t('Support_TicketCreated', a);
    /** Translation lookup for `Support_TicketCreatedWithId`. */
    Support_TicketCreatedWithId: t = (a = []) => this.t('Support_TicketCreatedWithId', a);
    /** Translation lookup for `Support_TicketEtaHint`. */
    Support_TicketEtaHint: t = (a = []) => this.t('Support_TicketEtaHint', a);
    /** Translation lookup for `Support_BackToList`. */
    Support_BackToList: t = (a = []) => this.t('Support_BackToList', a);
    /** Translation lookup for `Support_ViewAll`. */
    Support_ViewAll: t = (a = []) => this.t('Support_ViewAll', a);
    /** Translation lookup for `Support_Widget_Title`. */
    Support_Widget_Title: t = (a = []) => this.t('Support_Widget_Title', a);
    /** Translation lookup for `Support_Status_Open`. */
    Support_Status_Open: t = (a = []) => this.t('Support_Status_Open', a);
    /** Translation lookup for `Support_Status_Investigation`. */
    Support_Status_Investigation: t = (a = []) => this.t('Support_Status_Investigation', a);
    /** Translation lookup for `Support_Status_InProgress`. */
    Support_Status_InProgress: t = (a = []) => this.t('Support_Status_InProgress', a);
    /** Translation lookup for `Support_Status_WaitingUser`. */
    Support_Status_WaitingUser: t = (a = []) => this.t('Support_Status_WaitingUser', a);
    /** Translation lookup for `Support_Status_WaitingSupport`. */
    Support_Status_WaitingSupport: t = (a = []) => this.t('Support_Status_WaitingSupport', a);
    /** Translation lookup for `Support_Status_Escalated`. */
    Support_Status_Escalated: t = (a = []) => this.t('Support_Status_Escalated', a);
    /** Translation lookup for `Support_Status_OnHold`. */
    Support_Status_OnHold: t = (a = []) => this.t('Support_Status_OnHold', a);
    /** Translation lookup for `Support_Status_Deferred`. */
    Support_Status_Deferred: t = (a = []) => this.t('Support_Status_Deferred', a);
    /** Translation lookup for `Support_Status_LowPriority`. */
    Support_Status_LowPriority: t = (a = []) => this.t('Support_Status_LowPriority', a);
    /** Translation lookup for `Support_Status_Resolved`. */
    Support_Status_Resolved: t = (a = []) => this.t('Support_Status_Resolved', a);
    /** Translation lookup for `Support_Status_Rejected`. */
    Support_Status_Rejected: t = (a = []) => this.t('Support_Status_Rejected', a);
    /** Translation lookup for `Support_Screenshot`. */
    Support_Screenshot: t = (a = []) => this.t('Support_Screenshot', a);
    /** Translation lookup for `Support_Attachments`. */
    Support_Attachments: t = (a = []) => this.t('Support_Attachments', a);
    /** Translation lookup for `Support_Context`. */
    Support_Context: t = (a = []) => this.t('Support_Context', a);
    /** Translation lookup for `Support_Context_URL`. */
    Support_Context_URL: t = (a = []) => this.t('Support_Context_URL', a);
    /** Translation lookup for `Support_Context_Browser`. */
    Support_Context_Browser: t = (a = []) => this.t('Support_Context_Browser', a);
    /** Translation lookup for `Support_Context_Viewport`. */
    Support_Context_Viewport: t = (a = []) => this.t('Support_Context_Viewport', a);
    /** Translation lookup for `Support_Context_JsErrors`. */
    Support_Context_JsErrors: t = (a = []) => this.t('Support_Context_JsErrors', a);
    /** Translation lookup for `Support_Context_NetErrors`. */
    Support_Context_NetErrors: t = (a = []) => this.t('Support_Context_NetErrors', a);
    /** Translation lookup for `Support_Context_Breadcrumb`. */
    Support_Context_Breadcrumb: t = (a = []) => this.t('Support_Context_Breadcrumb', a);
    /** Translation lookup for `Support_StatusChanged`. */
    Support_StatusChanged: t = (a = []) => this.t('Support_StatusChanged', a);
    /** Translation lookup for `Support_ClientStatus_InProgress`. */
    Support_ClientStatus_InProgress: t = (a = []) => this.t('Support_ClientStatus_InProgress', a);
    /** Translation lookup for `Support_ClientStatus_Investigation`. */
    Support_ClientStatus_Investigation: t = (a = []) => this.t('Support_ClientStatus_Investigation', a);
    /** Translation lookup for `Support_ClientStatus_WaitingUser`. */
    Support_ClientStatus_WaitingUser: t = (a = []) => this.t('Support_ClientStatus_WaitingUser', a);
    /** Translation lookup for `Support_ClientStatus_Resolved`. */
    Support_ClientStatus_Resolved: t = (a = []) => this.t('Support_ClientStatus_Resolved', a);
    /** Translation lookup for `Support_ClientStatus_Rejected`. */
    Support_ClientStatus_Rejected: t = (a = []) => this.t('Support_ClientStatus_Rejected', a);
    /** Translation lookup for `Comment_Title`. */
    Comment_Title: t = (a = []) => this.t('Comment_Title', a);
    /** Translation lookup for `Comment_Write`. */
    Comment_Write: t = (a = []) => this.t('Comment_Write', a);
    /** Translation lookup for `Comment_Send`. */
    Comment_Send: t = (a = []) => this.t('Comment_Send', a);
    /** Translation lookup for `Comment_Delete`. */
    Comment_Delete: t = (a = []) => this.t('Comment_Delete', a);
    /** Translation lookup for `Comment_DeleteConfirm`. */
    Comment_DeleteConfirm: t = (a = []) => this.t('Comment_DeleteConfirm', a);
    /** Translation lookup for `Comment_NoComments`. */
    Comment_NoComments: t = (a = []) => this.t('Comment_NoComments', a);
    /** Translation lookup for `Comment_Author`. */
    Comment_Author: t = (a = []) => this.t('Comment_Author', a);
    /** Translation lookup for `Comment_Expert`. */
    Comment_Expert: t = (a = []) => this.t('Comment_Expert', a);
    /** Translation lookup for `Comment_Body`. */
    Comment_Body: t = (a = []) => this.t('Comment_Body', a);
    /** Translation lookup for `Comment_Status`. */
    Comment_Status: t = (a = []) => this.t('Comment_Status', a);
    /** Translation lookup for `Comment_StatusVisible`. */
    Comment_StatusVisible: t = (a = []) => this.t('Comment_StatusVisible', a);
    /** Translation lookup for `Comment_StatusHidden`. */
    Comment_StatusHidden: t = (a = []) => this.t('Comment_StatusHidden', a);
    /** Translation lookup for `Comment_Actions`. */
    Comment_Actions: t = (a = []) => this.t('Comment_Actions', a);
    /** Translation lookup for `Comment_Hide`. */
    Comment_Hide: t = (a = []) => this.t('Comment_Hide', a);
    /** Translation lookup for `Comment_Unhide`. */
    Comment_Unhide: t = (a = []) => this.t('Comment_Unhide', a);
    /** Translation lookup for `Comment_HideConfirm`. */
    Comment_HideConfirm: t = (a = []) => this.t('Comment_HideConfirm', a);
    /** Translation lookup for `Comment_UnhideConfirm`. */
    Comment_UnhideConfirm: t = (a = []) => this.t('Comment_UnhideConfirm', a);
    /** Translation lookup for `Comment_Filter_HiddenOnly`. */
    Comment_Filter_HiddenOnly: t = (a = []) => this.t('Comment_Filter_HiddenOnly', a);
    /** Translation lookup for `Comment_Filter_Search`. */
    Comment_Filter_Search: t = (a = []) => this.t('Comment_Filter_Search', a);
    /** Translation lookup for `IM_Title`. */
    IM_Title: t = (a = []) => this.t('IM_Title', a);
    /** Translation lookup for `Support_Widget_ImBannerLabel`. */
    Support_Widget_ImBannerLabel: t = (a = []) => this.t('Support_Widget_ImBannerLabel', a);
    /** Translation lookup for `IM_NewMessage`. */
    IM_NewMessage: t = (a = []) => this.t('IM_NewMessage', a);
    /** Translation lookup for `IM_WriteMessage`. */
    IM_WriteMessage: t = (a = []) => this.t('IM_WriteMessage', a);
    /** Translation lookup for `IM_Send`. */
    IM_Send: t = (a = []) => this.t('IM_Send', a);
    /** Translation lookup for `IM_NoConversations`. */
    IM_NoConversations: t = (a = []) => this.t('IM_NoConversations', a);
    /** Translation lookup for `IM_NoMessages`. */
    IM_NoMessages: t = (a = []) => this.t('IM_NoMessages', a);
    /** Translation lookup for `IM_Recipient`. */
    IM_Recipient: t = (a = []) => this.t('IM_Recipient', a);
    /** Translation lookup for `IM_MessagePlaceholder`. */
    IM_MessagePlaceholder: t = (a = []) => this.t('IM_MessagePlaceholder', a);
    /** Translation lookup for `IM_Search`. */
    IM_Search: t = (a = []) => this.t('IM_Search', a);
    /** Translation lookup for `IM_NoRecipients`. */
    IM_NoRecipients: t = (a = []) => this.t('IM_NoRecipients', a);
    /** Translation lookup for `IM_YouPrefix`. */
    IM_YouPrefix: t = (a = []) => this.t('IM_YouPrefix', a);
    /** Translation lookup for `Support_AssignedTo`. */
    Support_AssignedTo: t = (a = []) => this.t('Support_AssignedTo', a);
    /** Translation lookup for `Support_Unassigned_Action`. */
    Support_Unassigned_Action: t = (a = []) => this.t('Support_Unassigned_Action', a);
    /** Translation lookup for `News_Title`. */
    News_Title: t = (a = []) => this.t('News_Title', a);
    /** Translation lookup for `News_Empty`. */
    News_Empty: t = (a = []) => this.t('News_Empty', a);
    /** Translation lookup for `News_ShowArchived`. */
    News_ShowArchived: t = (a = []) => this.t('News_ShowArchived', a);
    /** Translation lookup for `News_HideArchived`. */
    News_HideArchived: t = (a = []) => this.t('News_HideArchived', a);
    /** Translation lookup for `News_MarkAllRead`. */
    News_MarkAllRead: t = (a = []) => this.t('News_MarkAllRead', a);
    /** Translation lookup for `News_Archive`. */
    News_Archive: t = (a = []) => this.t('News_Archive', a);
    /** Translation lookup for `News_Unarchive`. */
    News_Unarchive: t = (a = []) => this.t('News_Unarchive', a);
    /** Translation lookup for `News_ArchiveError`. */
    News_ArchiveError: t = (a = []) => this.t('News_ArchiveError', a);
    /** Translation lookup for `News_UnarchiveError`. */
    News_UnarchiveError: t = (a = []) => this.t('News_UnarchiveError', a);
    /** Translation lookup for `News_SlotUnavailable`. */
    News_SlotUnavailable: t = (a = []) => this.t('News_SlotUnavailable', a);
    /** Translation lookup for `News_Unread`. */
    News_Unread: t = (a = []) => this.t('News_Unread', a);
    /** Translation lookup for `News_Archived`. */
    News_Archived: t = (a = []) => this.t('News_Archived', a);
    /** Translation lookup for `News_NewSlot_Action`. */
    News_NewSlot_Action: t = (a = []) => this.t('News_NewSlot_Action', a);
    /** Translation lookup for `News_NewSlot_Link`. */
    News_NewSlot_Link: t = (a = []) => this.t('News_NewSlot_Link', a);
    /** Translation lookup for `News_NewSlot_Suffix`. */
    News_NewSlot_Suffix: t = (a = []) => this.t('News_NewSlot_Suffix', a);
    /** Translation lookup for `News_SlotBooked_Action`. */
    News_SlotBooked_Action: t = (a = []) => this.t('News_SlotBooked_Action', a);
    /** Translation lookup for `News_SlotBooked_Link`. */
    News_SlotBooked_Link: t = (a = []) => this.t('News_SlotBooked_Link', a);
    /** Translation lookup for `News_BookingConfirmed_Action`. */
    News_BookingConfirmed_Action: t = (a = []) => this.t('News_BookingConfirmed_Action', a);
    /** Translation lookup for `News_BookingConfirmed_Link`. */
    News_BookingConfirmed_Link: t = (a = []) => this.t('News_BookingConfirmed_Link', a);
    /** Translation lookup for `News_BookingConfirmed_Suffix`. */
    News_BookingConfirmed_Suffix: t = (a = []) => this.t('News_BookingConfirmed_Suffix', a);
    /** Translation lookup for `News_CommentApproved_Prefix`. */
    News_CommentApproved_Prefix: t = (a = []) => this.t('News_CommentApproved_Prefix', a);
    /** Translation lookup for `News_CommentApproved_Suffix`. */
    News_CommentApproved_Suffix: t = (a = []) => this.t('News_CommentApproved_Suffix', a);
    /** Translation lookup for `News_CommentApproved_Link`. */
    News_CommentApproved_Link: t = (a = []) => this.t('News_CommentApproved_Link', a);
    /** Translation lookup for `News_BookingRejected_Action`. */
    News_BookingRejected_Action: t = (a = []) => this.t('News_BookingRejected_Action', a);
    /** Translation lookup for `News_BookingRejected_Link`. */
    News_BookingRejected_Link: t = (a = []) => this.t('News_BookingRejected_Link', a);
    /** Translation lookup for `News_BookingRejected_Suffix`. */
    News_BookingRejected_Suffix: t = (a = []) => this.t('News_BookingRejected_Suffix', a);
    /** Translation lookup for `News_BookingCancelled_Action`. */
    News_BookingCancelled_Action: t = (a = []) => this.t('News_BookingCancelled_Action', a);
    /** Translation lookup for `News_BookingCancelled_Link`. */
    News_BookingCancelled_Link: t = (a = []) => this.t('News_BookingCancelled_Link', a);
    /** Translation lookup for `News_BookingCancelled_Suffix`. */
    News_BookingCancelled_Suffix: t = (a = []) => this.t('News_BookingCancelled_Suffix', a);
    /** Translation lookup for `News_BookingCancelledByUser_Action`. */
    News_BookingCancelledByUser_Action: t = (a = []) => this.t('News_BookingCancelledByUser_Action', a);
    /** Translation lookup for `News_BookingCancelledByUser_Link`. */
    News_BookingCancelledByUser_Link: t = (a = []) => this.t('News_BookingCancelledByUser_Link', a);
    /** Translation lookup for `News_BookingCancelledByUser_Suffix`. */
    News_BookingCancelledByUser_Suffix: t = (a = []) => this.t('News_BookingCancelledByUser_Suffix', a);
    /** Translation lookup for `News_BookingRescheduled_Action`. */
    News_BookingRescheduled_Action: t = (a = []) => this.t('News_BookingRescheduled_Action', a);
    /** Translation lookup for `News_BookingRescheduled_Link`. */
    News_BookingRescheduled_Link: t = (a = []) => this.t('News_BookingRescheduled_Link', a);
    /** Translation lookup for `News_BookingRescheduled_Suffix`. */
    News_BookingRescheduled_Suffix: t = (a = []) => this.t('News_BookingRescheduled_Suffix', a);
    /** Translation lookup for `News_BookingRescheduledByUser_Action`. */
    News_BookingRescheduledByUser_Action: t = (a = []) => this.t('News_BookingRescheduledByUser_Action', a);
    /** Translation lookup for `News_BookingRescheduledByUser_Link`. */
    News_BookingRescheduledByUser_Link: t = (a = []) => this.t('News_BookingRescheduledByUser_Link', a);
    /** Translation lookup for `News_BookingRescheduledByUser_Suffix`. */
    News_BookingRescheduledByUser_Suffix: t = (a = []) => this.t('News_BookingRescheduledByUser_Suffix', a);
    /** Translation lookup for `News_SupportReply_Prefix`. */
    News_SupportReply_Prefix: t = (a = []) => this.t('News_SupportReply_Prefix', a);
    /** Translation lookup for `News_NewMessage_Prefix`. */
    News_NewMessage_Prefix: t = (a = []) => this.t('News_NewMessage_Prefix', a);
    /** Translation lookup for `News_NewMessage_Link`. */
    News_NewMessage_Link: t = (a = []) => this.t('News_NewMessage_Link', a);
    /** Translation lookup for `News_NewMessage_From`. */
    News_NewMessage_From: t = (a = []) => this.t('News_NewMessage_From', a);
    /** Translation lookup for `News_GroupSuffix`. */
    News_GroupSuffix: t = (a = []) => this.t('News_GroupSuffix', a);
    /** Translation lookup for `News_ArchivedHint`. */
    News_ArchivedHint: t = (a = []) => this.t('News_ArchivedHint', a);
    /** Translation lookup for `News_LessonAt`. */
    News_LessonAt: t = (a = []) => this.t('News_LessonAt', a);
    /** Translation lookup for `News_HappenedAt`. */
    News_HappenedAt: t = (a = []) => this.t('News_HappenedAt', a);
    /** Translation lookup for `Reg_AccountType`. */
    Reg_AccountType: t = (a = []) => this.t('Reg_AccountType', a);
    /** Translation lookup for `Reg_AccountTypeExpert`. */
    Reg_AccountTypeExpert: t = (a = []) => this.t('Reg_AccountTypeExpert', a);
    /** Translation lookup for `Reg_AccountTypeUser`. */
    Reg_AccountTypeUser: t = (a = []) => this.t('Reg_AccountTypeUser', a);
    /** Translation lookup for `Menu_Teaching`. */
    Menu_Teaching: t = (a = []) => this.t('Menu_Teaching', a);
    /** Translation lookup for `Menu_Bookings`. */
    Menu_Bookings: t = (a = []) => this.t('Menu_Bookings', a);
    /** Translation lookup for `User_Individual`. */
    User_Individual: t = (a = []) => this.t('User_Individual', a);
    /** Translation lookup for `User_Group`. */
    User_Group: t = (a = []) => this.t('User_Group', a);
    /** Translation lookup for `Finance_Filter_From`. */
    Finance_Filter_From: t = (a = []) => this.t('Finance_Filter_From', a);
    /** Translation lookup for `Finance_Filter_To`. */
    Finance_Filter_To: t = (a = []) => this.t('Finance_Filter_To', a);
    /** Translation lookup for `Finance_Filter_Type`. */
    Finance_Filter_Type: t = (a = []) => this.t('Finance_Filter_Type', a);
    /** Translation lookup for `Finance_Filter_Note`. */
    Finance_Filter_Note: t = (a = []) => this.t('Finance_Filter_Note', a);
    /** Translation lookup for `Finance_Filter_NoMatches`. */
    Finance_Filter_NoMatches: t = (a = []) => this.t('Finance_Filter_NoMatches', a);
    /** Translation lookup for `User_Status_Disabled`. */
    User_Status_Disabled: t = (a = []) => this.t('User_Status_Disabled', a);
    /** Translation lookup for `User_Status_Approved`. */
    User_Status_Approved: t = (a = []) => this.t('User_Status_Approved', a);
    /** Translation lookup for `User_Loading`. */
    User_Loading: t = (a = []) => this.t('User_Loading', a);
    /** Translation lookup for `User_LoadError`. */
    User_LoadError: t = (a = []) => this.t('User_LoadError', a);
    /** Translation lookup for `User_Balance`. */
    User_Balance: t = (a = []) => this.t('User_Balance', a);
    /** Translation lookup for `User_RegTime`. */
    User_RegTime: t = (a = []) => this.t('User_RegTime', a);
    /** Translation lookup for `User_LastOnline`. */
    User_LastOnline: t = (a = []) => this.t('User_LastOnline', a);
    /** Translation lookup for `User_Anonymous`. */
    User_Anonymous: t = (a = []) => this.t('User_Anonymous', a);
    /** Translation lookup for `User_Disabled`. */
    User_Disabled: t = (a = []) => this.t('User_Disabled', a);
    /** Translation lookup for `General_Yes`. */
    General_Yes: t = (a = []) => this.t('General_Yes', a);
    /** Translation lookup for `General_No`. */
    General_No: t = (a = []) => this.t('General_No', a);
    /** Translation lookup for `General_Error`. */
    General_Error: t = (a = []) => this.t('General_Error', a);
    /** Translation lookup for `Im_FileTooLarge`. */
    Im_FileTooLarge: t = (a = []) => this.t('Im_FileTooLarge', a);
    /** Translation lookup for `Im_NetworkError`. */
    Im_NetworkError: t = (a = []) => this.t('Im_NetworkError', a);
    /** Translation lookup for `Lightbox_Download`. */
    Lightbox_Download: t = (a = []) => this.t('Lightbox_Download', a);
    /** Translation lookup for `Lightbox_Close`. */
    Lightbox_Close: t = (a = []) => this.t('Lightbox_Close', a);
    /** Translation lookup for `Menu_Balance`. */
    Menu_Balance: t = (a = []) => this.t('Menu_Balance', a);
    /** Translation lookup for `Menu_Study`. */
    Menu_Study: t = (a = []) => this.t('Menu_Study', a);
    /** Translation lookup for `Menu_BrowseSlots`. */
    Menu_BrowseSlots: t = (a = []) => this.t('Menu_BrowseSlots', a);
    /** Translation lookup for `Menu_ManageSlots`. */
    Menu_ManageSlots: t = (a = []) => this.t('Menu_ManageSlots', a);
    /** Translation lookup for `Dashboard_Balance`. */
    Dashboard_Balance: t = (a = []) => this.t('Dashboard_Balance', a);
    /** Translation lookup for `Menu_Support`. */
    Menu_Support: t = (a = []) => this.t('Menu_Support', a);
    /** Translation lookup for `Unit_DayShort`. */
    Unit_DayShort: t = (a = []) => this.t('Unit_DayShort', a);
    /** Translation lookup for `Unit_HourShort`. */
    Unit_HourShort: t = (a = []) => this.t('Unit_HourShort', a);
    /** Translation lookup for `Unit_MinuteShort`. */
    Unit_MinuteShort: t = (a = []) => this.t('Unit_MinuteShort', a);
    /** Translation lookup for `MyReviews_Title`. */
    MyReviews_Title: t = (a = []) => this.t('MyReviews_Title', a);
    /** Translation lookup for `Menu_Messages`. */
    Menu_Messages: t = (a = []) => this.t('Menu_Messages', a);
    /** Translation lookup for `Dash_Welcome`. */
    Dash_Welcome: t = (a = []) => this.t('Dash_Welcome', a);
    /** Translation lookup for `Dash_Role_User`. */
    Dash_Role_User: t = (a = []) => this.t('Dash_Role_User', a);
    /** Translation lookup for `Dash_Role_Expert`. */
    Dash_Role_Expert: t = (a = []) => this.t('Dash_Role_Expert', a);
    /** Translation lookup for `Dash_Role_Moderator`. */
    Dash_Role_Moderator: t = (a = []) => this.t('Dash_Role_Moderator', a);
    /** Translation lookup for `Dash_Role_Owner`. */
    Dash_Role_Owner: t = (a = []) => this.t('Dash_Role_Owner', a);
    /** Translation lookup for `Dash_Upcoming`. */
    Dash_Upcoming: t = (a = []) => this.t('Dash_Upcoming', a);
    /** Translation lookup for `Dash_StartLearning`. */
    Dash_StartLearning: t = (a = []) => this.t('Dash_StartLearning', a);
    /** Translation lookup for `Dash_Recommendations`. */
    Dash_Recommendations: t = (a = []) => this.t('Dash_Recommendations', a);
    /** Translation lookup for `Dash_ViewAll`. */
    Dash_ViewAll: t = (a = []) => this.t('Dash_ViewAll', a);
    /** Translation lookup for `Feed_NoUpcoming`. */
    Feed_NoUpcoming: t = (a = []) => this.t('Feed_NoUpcoming', a);
    /** Translation lookup for `Dash_ExpertSlots`. */
    Dash_ExpertSlots: t = (a = []) => this.t('Dash_ExpertSlots', a);
    /** Translation lookup for `Dash_PendingBookings`. */
    Dash_PendingBookings: t = (a = []) => this.t('Dash_PendingBookings', a);
    /** Translation lookup for `Dash_Stats`. */
    Dash_Stats: t = (a = []) => this.t('Dash_Stats', a);
    /** Translation lookup for `Dash_UsersThisMonth`. */
    Dash_UsersThisMonth: t = (a = []) => this.t('Dash_UsersThisMonth', a);
    /** Translation lookup for `Dash_EarningsThisMonth`. */
    Dash_EarningsThisMonth: t = (a = []) => this.t('Dash_EarningsThisMonth', a);
    /** Translation lookup for `Dash_OpenTickets`. */
    Dash_OpenTickets: t = (a = []) => this.t('Dash_OpenTickets', a);
    /** Translation lookup for `Dash_PendingApprovals`. */
    Dash_PendingApprovals: t = (a = []) => this.t('Dash_PendingApprovals', a);
    /** Translation lookup for `Dash_TotalUsers`. */
    Dash_TotalUsers: t = (a = []) => this.t('Dash_TotalUsers', a);
    /** Translation lookup for `Dash_BookingsThisMonth`. */
    Dash_BookingsThisMonth: t = (a = []) => this.t('Dash_BookingsThisMonth', a);
    /** Translation lookup for `Dash_UnreadSupport`. */
    Dash_UnreadSupport: t = (a = []) => this.t('Dash_UnreadSupport', a);
    /** Translation lookup for `Dash_UnreadMessages`. */
    Dash_UnreadMessages: t = (a = []) => this.t('Dash_UnreadMessages', a);
    /** Translation lookup for `Dash_Booked`. */
    Dash_Booked: t = (a = []) => this.t('Dash_Booked', a);
    /** Translation lookup for `Menu_StudyDashboard`. */
    Menu_StudyDashboard: t = (a = []) => this.t('Menu_StudyDashboard', a);
    /** Translation lookup for `User_Cancel_Title`. */
    User_Cancel_Title: t = (a = []) => this.t('User_Cancel_Title', a);
    /** Translation lookup for `User_Cancel_ReasonLabel`. */
    User_Cancel_ReasonLabel: t = (a = []) => this.t('User_Cancel_ReasonLabel', a);
    /** Translation lookup for `User_Cancel_ReasonPlaceholder`. */
    User_Cancel_ReasonPlaceholder: t = (a = []) => this.t('User_Cancel_ReasonPlaceholder', a);
    /** Translation lookup for `User_Cancel_ReasonRequired`. */
    User_Cancel_ReasonRequired: t = (a = []) => this.t('User_Cancel_ReasonRequired', a);
    /** Translation lookup for `User_Cancel_Submit`. */
    User_Cancel_Submit: t = (a = []) => this.t('User_Cancel_Submit', a);
    /** Translation lookup for `User_Cancel_Success`. */
    User_Cancel_Success: t = (a = []) => this.t('User_Cancel_Success', a);
    /** Translation lookup for `User_Withdraw_Card`. */
    User_Withdraw_Card: t = (a = []) => this.t('User_Withdraw_Card', a);
    /** Translation lookup for `User_Withdraw_Title`. */
    User_Withdraw_Title: t = (a = []) => this.t('User_Withdraw_Title', a);
    /** Translation lookup for `User_Withdraw_ReasonLabel`. */
    User_Withdraw_ReasonLabel: t = (a = []) => this.t('User_Withdraw_ReasonLabel', a);
    /** Translation lookup for `User_Withdraw_ReasonPlaceholder`. */
    User_Withdraw_ReasonPlaceholder: t = (a = []) => this.t('User_Withdraw_ReasonPlaceholder', a);
    /** Translation lookup for `User_Withdraw_Submit`. */
    User_Withdraw_Submit: t = (a = []) => this.t('User_Withdraw_Submit', a);
    /** Translation lookup for `User_Withdraw_Success`. */
    User_Withdraw_Success: t = (a = []) => this.t('User_Withdraw_Success', a);
    /** Translation lookup for `User_Cancel_Card`. */
    User_Cancel_Card: t = (a = []) => this.t('User_Cancel_Card', a);
    /** Translation lookup for `User_Cancellations`. */
    User_Cancellations: t = (a = []) => this.t('User_Cancellations', a);
    /** Translation lookup for `User_Declines`. */
    User_Declines: t = (a = []) => this.t('User_Declines', a);
    /** Translation lookup for `QuickChat_Title`. */
    QuickChat_Title: t = (a = []) => this.t('QuickChat_Title', a);
    /** Translation lookup for `QuickChat_NoMessages`. */
    QuickChat_NoMessages: t = (a = []) => this.t('QuickChat_NoMessages', a);
    /** Translation lookup for `QuickChat_OpenProfile`. */
    QuickChat_OpenProfile: t = (a = []) => this.t('QuickChat_OpenProfile', a);
    /** Translation lookup for `QuickChat_AllMessages`. */
    QuickChat_AllMessages: t = (a = []) => this.t('QuickChat_AllMessages', a);
    /** Translation lookup for `Action_Edit`. */
    Action_Edit: t = (a = []) => this.t('Action_Edit', a);
    /** Translation lookup for `Action_Delete`. */
    Action_Delete: t = (a = []) => this.t('Action_Delete', a);
    /** Translation lookup for `Action_Cancel`. */
    Action_Cancel: t = (a = []) => this.t('Action_Cancel', a);
    /** Translation lookup for `Action_Close`. */
    Action_Close: t = (a = []) => this.t('Action_Close', a);
    /** Translation lookup for `Action_Remove`. */
    Action_Remove: t = (a = []) => this.t('Action_Remove', a);
    /** Translation lookup for `Action_Add`. */
    Action_Add: t = (a = []) => this.t('Action_Add', a);
    /** Translation lookup for `Filter_NoResults`. */
    Filter_NoResults: t = (a = []) => this.t('Filter_NoResults', a);
    /** Translation lookup for `Preview_UserTitle`. */
    Preview_UserTitle: t = (a = []) => this.t('Preview_UserTitle', a);
    /** Translation lookup for `Preview_Loading`. */
    Preview_Loading: t = (a = []) => this.t('Preview_Loading', a);
    /** Translation lookup for `Preview_OpenProfile`. */
    Preview_OpenProfile: t = (a = []) => this.t('Preview_OpenProfile', a);
    /** Translation lookup for `Preview_SendMessage`. */
    Preview_SendMessage: t = (a = []) => this.t('Preview_SendMessage', a);
    /** Translation lookup for `Preview_Specialization`. */
    Preview_Specialization: t = (a = []) => this.t('Preview_Specialization', a);
    /** Translation lookup for `Preview_Bio`. */
    Preview_Bio: t = (a = []) => this.t('Preview_Bio', a);
    /** Translation lookup for `Preview_Rating`. */
    Preview_Rating: t = (a = []) => this.t('Preview_Rating', a);
    /** Translation lookup for `Preview_Conducted`. */
    Preview_Conducted: t = (a = []) => this.t('Preview_Conducted', a);
    /** Translation lookup for `Preview_TotalBookings`. */
    Preview_TotalBookings: t = (a = []) => this.t('Preview_TotalBookings', a);
    /** Translation lookup for `Preview_Cancellations`. */
    Preview_Cancellations: t = (a = []) => this.t('Preview_Cancellations', a);
    /** Translation lookup for `Preview_CompletedBookings`. */
    Preview_CompletedBookings: t = (a = []) => this.t('Preview_CompletedBookings', a);
    /** Translation lookup for `Preview_RoleExpert`. */
    Preview_RoleExpert: t = (a = []) => this.t('Preview_RoleExpert', a);
    /** Translation lookup for `Preview_RoleUser`. */
    Preview_RoleUser: t = (a = []) => this.t('Preview_RoleUser', a);
    /** Translation lookup for `Pagination_Prev`. */
    Pagination_Prev: t = (a = []) => this.t('Pagination_Prev', a);
    /** Translation lookup for `Pagination_Next`. */
    Pagination_Next: t = (a = []) => this.t('Pagination_Next', a);
    /** Translation lookup for `Pagination_Of`. */
    Pagination_Of: t = (a = []) => this.t('Pagination_Of', a);
    /** Translation lookup for `Pagination_Items`. */
    Pagination_Items: t = (a = []) => this.t('Pagination_Items', a);
    /** Translation lookup for `Im_GoToDialogs`. */
    Im_GoToDialogs: t = (a = []) => this.t('Im_GoToDialogs', a);
    /** Translation lookup for `Profile_MyProfile`. */
    Profile_MyProfile: t = (a = []) => this.t('Profile_MyProfile', a);
    /** Translation lookup for `NotifPrefs_Title`. */
    NotifPrefs_Title: t = (a = []) => this.t('NotifPrefs_Title', a);
    /** Translation lookup for `NotifPrefs_Messages`. */
    NotifPrefs_Messages: t = (a = []) => this.t('NotifPrefs_Messages', a);
    /** Translation lookup for `NotifPrefs_Support`. */
    NotifPrefs_Support: t = (a = []) => this.t('NotifPrefs_Support', a);
    /** Translation lookup for `NotifPrefs_Bookings`. */
    NotifPrefs_Bookings: t = (a = []) => this.t('NotifPrefs_Bookings', a);
    /** Translation lookup for `NotifFreq_Each`. */
    NotifFreq_Each: t = (a = []) => this.t('NotifFreq_Each', a);
    /** Translation lookup for `NotifFreq_Hourly`. */
    NotifFreq_Hourly: t = (a = []) => this.t('NotifFreq_Hourly', a);
    /** Translation lookup for `NotifFreq_Daily`. */
    NotifFreq_Daily: t = (a = []) => this.t('NotifFreq_Daily', a);
    /** Translation lookup for `NotifFreq_Off`. */
    NotifFreq_Off: t = (a = []) => this.t('NotifFreq_Off', a);
    /** Translation lookup for `NotifPrefs_Saved`. */
    NotifPrefs_Saved: t = (a = []) => this.t('NotifPrefs_Saved', a);
    /** Translation lookup for `Grid_Search`. */
    Grid_Search: t = (a = []) => this.t('Grid_Search', a);
    /** Translation lookup for `Grid_PrevPage`. */
    Grid_PrevPage: t = (a = []) => this.t('Grid_PrevPage', a);
    /** Translation lookup for `Grid_NextPage`. */
    Grid_NextPage: t = (a = []) => this.t('Grid_NextPage', a);
    /** Translation lookup for `Grid_Items`. */
    Grid_Items: t = (a = []) => this.t('Grid_Items', a);
    /** Translation lookup for `Attach_Hint`. */
    Attach_Hint: t = (a = []) => this.t('Attach_Hint', a);
    /** Translation lookup for `Attach_TooLarge`. */
    Attach_TooLarge: t = (a = []) => this.t('Attach_TooLarge', a);
    /** Translation lookup for `Attach_Empty`. */
    Attach_Empty: t = (a = []) => this.t('Attach_Empty', a);
    /** Translation lookup for `Attach_ExtNotAllowed`. */
    Attach_ExtNotAllowed: t = (a = []) => this.t('Attach_ExtNotAllowed', a);
    /** Translation lookup for `Attach_TooMany`. */
    Attach_TooMany: t = (a = []) => this.t('Attach_TooMany', a);
    /** Translation lookup for `A11y_CloseModal`. */
    A11y_CloseModal: t = (a = []) => this.t('A11y_CloseModal', a);
    /** Translation lookup for `A11y_RemoveAttachment`. */
    A11y_RemoveAttachment: t = (a = []) => this.t('A11y_RemoveAttachment', a);
    /** Translation lookup for `A11y_AttachFiles`. */
    A11y_AttachFiles: t = (a = []) => this.t('A11y_AttachFiles', a);
    /** Translation lookup for `A11y_PreviousImage`. */
    A11y_PreviousImage: t = (a = []) => this.t('A11y_PreviousImage', a);
    /** Translation lookup for `A11y_NextImage`. */
    A11y_NextImage: t = (a = []) => this.t('A11y_NextImage', a);
    /** Translation lookup for `A11y_ImagePreview`. */
    A11y_ImagePreview: t = (a = []) => this.t('A11y_ImagePreview', a);
    /** Translation lookup for `A11y_WriteMessage`. */
    A11y_WriteMessage: t = (a = []) => this.t('A11y_WriteMessage', a);
    /** Translation lookup for `A11y_WriteComment`. */
    A11y_WriteComment: t = (a = []) => this.t('A11y_WriteComment', a);
    /** Translation lookup for `A11y_PriceMin`. */
    A11y_PriceMin: t = (a = []) => this.t('A11y_PriceMin', a);
    /** Translation lookup for `A11y_PriceMax`. */
    A11y_PriceMax: t = (a = []) => this.t('A11y_PriceMax', a);
    /** Translation lookup for `User_SupportTickets`. */
    User_SupportTickets: t = (a = []) => this.t('User_SupportTickets', a);
    /** Translation lookup for `User_NoBookings`. */
    User_NoBookings: t = (a = []) => this.t('User_NoBookings', a);
    /** Translation lookup for `User_ExpertCancellations`. */
    User_ExpertCancellations: t = (a = []) => this.t('User_ExpertCancellations', a);
    /** Translation lookup for `User_ExpertDeclines`. */
    User_ExpertDeclines: t = (a = []) => this.t('User_ExpertDeclines', a);
    /** Translation lookup for `User_UserCancellations`. */
    User_UserCancellations: t = (a = []) => this.t('User_UserCancellations', a);
    /** Translation lookup for `User_UserDeclines`. */
    User_UserDeclines: t = (a = []) => this.t('User_UserDeclines', a);
    /** Translation lookup for `User_TicketSubject`. */
    User_TicketSubject: t = (a = []) => this.t('User_TicketSubject', a);
    /** Translation lookup for `User_TicketStatus`. */
    User_TicketStatus: t = (a = []) => this.t('User_TicketStatus', a);
    /** Translation lookup for `User_TicketUpdated`. */
    User_TicketUpdated: t = (a = []) => this.t('User_TicketUpdated', a);
    /** Translation lookup for `User_LedgerParty`. */
    User_LedgerParty: t = (a = []) => this.t('User_LedgerParty', a);
    /** Translation lookup for `Settings_CancellationPenaltyPercent`. */
    Settings_CancellationPenaltyPercent: t = (a = []) => this.t('Settings_CancellationPenaltyPercent', a);
    /** Translation lookup for `Settings_CancellationPenaltyHelp`. */
    Settings_CancellationPenaltyHelp: t = (a = []) => this.t('Settings_CancellationPenaltyHelp', a);
    /** Translation lookup for `Registration_Disabled_Title`. */
    Registration_Disabled_Title: t = (a = []) => this.t('Registration_Disabled_Title', a);
    /** Translation lookup for `Registration_Disabled`. */
    Registration_Disabled: t = (a = []) => this.t('Registration_Disabled', a);
    /** Translation lookup for `Footer_Contact`. */
    Footer_Contact: t = (a = []) => this.t('Footer_Contact', a);
    /** Translation lookup for `External_Title`. */
    External_Title: t = (a = []) => this.t('External_Title', a);
    /** Translation lookup for `External_Description`. */
    External_Description: t = (a = []) => this.t('External_Description', a);
    /** Translation lookup for `External_Host`. */
    External_Host: t = (a = []) => this.t('External_Host', a);
    /** Translation lookup for `External_FullUrl`. */
    External_FullUrl: t = (a = []) => this.t('External_FullUrl', a);
    /** Translation lookup for `External_Continue`. */
    External_Continue: t = (a = []) => this.t('External_Continue', a);
    /** Translation lookup for `External_Cancel`. */
    External_Cancel: t = (a = []) => this.t('External_Cancel', a);
    /** Translation lookup for `External_InvalidUrl`. */
    External_InvalidUrl: t = (a = []) => this.t('External_InvalidUrl', a);
    /** Translation lookup for `MagicLink_Error_Title`. */
    MagicLink_Error_Title: t = (a = []) => this.t('MagicLink_Error_Title', a);
    /** Translation lookup for `MagicLink_Error_Guidance`. */
    MagicLink_Error_Guidance: t = (a = []) => this.t('MagicLink_Error_Guidance', a);
    /** Translation lookup for `MagicLink_Error_ContactSupport`. */
    MagicLink_Error_ContactSupport: t = (a = []) => this.t('MagicLink_Error_ContactSupport', a);
}

/** Active translations for this bundle. */
export const I18nForeground = new I18n([I18nDataRU, I18nDataEN]);
