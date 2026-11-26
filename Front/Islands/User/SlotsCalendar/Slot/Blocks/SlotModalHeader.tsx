import * as React from 'react';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';

const actionClose = t.Action_Close;
const slotDetails = t.Slot_Details;

type StatusKind = 'confirmed' | 'pending' | 'cancelled' | 'other';

/** Обновляет данные календаря. */
function statusKind(status: string): StatusKind {
    if (status === 'confirmed' || status === 'pending' || status === 'cancelled') return status;
    return 'other';
}

/** Обновляет данные календаря. */
function statusText(status: string): string {
    switch (status) {
        case 'confirmed': return t.Booking_Status_Confirmed();
        case 'pending': return t.Booking_Status_Pending();
        case 'cancelled': return t.Booking_Status_Cancelled();
        default: return status;
    }
}

/** Обновляет данные календаря. */
export function SlotModalHeader({bookingStatus, onClose}: {bookingStatus: string; onClose: () => void}) {
    return (
        <div className="slot-modal-header">
            <div className="slot-modal-heading-group">
                <h3 className="slot-modal-title">{slotDetails()}</h3>
                <span className="slot-modal-status" data-status={statusKind(bookingStatus)}>
                    {statusText(bookingStatus)}
                </span>
            </div>
            <button
                type="button"
                className="slot-modal-close"
                title={actionClose()}
                aria-label={actionClose()}
                onClick={onClose}
                data-test-id="slot-detail-close"
            >
                &times;
            </button>
        </div>
    );
}
