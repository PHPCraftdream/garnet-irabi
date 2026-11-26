import {I18nForeground as t} from '@/I18nGen/I18nForeground';
/** Отображает данные раздела и передаёт действия пользователя обработчикам. */
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

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
