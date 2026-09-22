import {I18nForeground as t} from '../../../I18nGen/I18nForeground';

export function statusLabel(status: string): string {
    switch (status) {
        case 'pending':   return t.Booking_Status_Pending();
        case 'confirmed': return t.Booking_Status_Confirmed();
        case 'cancelled': return t.Booking_Status_Cancelled();
        case 'completed': return t.Booking_Status_Completed();
        case 'free':      return t.Slot_Status_Free();
        case 'booked':    return t.Slot_Status_Booked();
        case 'expired':   return t.Slot_Status_Expired();
        default:          return status;
    }
}

export function entryTypeLabel(type: string): string {
    switch (type) {
        case 'top_up':          return t.Ledger_Type_TopUp();
        case 'booking_invoice': return t.Ledger_Type_Invoice();
        case 'booking_payment': return t.Ledger_Type_Payment();
        case 'booking_refund':  return t.Ledger_Type_Refund();
        case 'manual':          return t.Ledger_Type_Manual();
        default:                return type;
    }
}
