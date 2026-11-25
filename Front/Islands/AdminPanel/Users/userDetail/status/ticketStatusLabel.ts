import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
/** Отображает данные раздела и передаёт действия пользователя обработчикам. */
export function ticketStatusLabel(status: string): string {
    switch (status) {
        case 'open':             return t.Support_Status_Open();
        case 'investigation':    return t.Support_Status_Investigation();
        case 'in_progress':      return t.Support_Status_InProgress();
        case 'waiting_user':     return t.Support_Status_WaitingUser();
        case 'waiting_support':  return t.Support_Status_WaitingSupport();
        case 'escalated':        return t.Support_Status_Escalated();
        case 'on_hold':          return t.Support_Status_OnHold();
        case 'deferred':         return t.Support_Status_Deferred();
        case 'low_priority':     return t.Support_Status_LowPriority();
        case 'resolved':         return t.Support_Status_Resolved();
        case 'rejected':         return t.Support_Status_Rejected();
        default:                 return status;
    }
}
