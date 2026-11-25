import {I18nForeground as t} from '../../../I18nGen/I18nForeground';

    /** Формирует представление данных для соответствующего раздела панели. */
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
