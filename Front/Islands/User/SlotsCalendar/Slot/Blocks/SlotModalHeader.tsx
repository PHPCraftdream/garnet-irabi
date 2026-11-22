import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';

type StatusKind = 'confirmed' | 'pending' | 'cancelled' | 'other';

function statusKind(status: string): StatusKind {
    if (status === 'confirmed' || status === 'pending' || status === 'cancelled') return status;
    return 'other';
}

function statusText(status: string): string {
    switch (status) {
        case 'confirmed': return t.Booking_Status_Confirmed();
        case 'pending': return t.Booking_Status_Pending();
        case 'cancelled': return t.Booking_Status_Cancelled();
        default: return status;
    }
}

export function SlotModalHeader({bookingStatus, onClose}: {bookingStatus: string; onClose: () => void}) {
    return (
        <div className="slot-modal-header">
            <div className="slot-modal-heading-group">
                <h3 className="slot-modal-title">{t.Slot_Details()}</h3>
                <span className="slot-modal-status" data-status={statusKind(bookingStatus)}>
                    {statusText(bookingStatus)}
                </span>
            </div>
            <button
                type="button"
                className="slot-modal-close"
                title={t.Action_Close()}
                aria-label={t.Action_Close()}
                onClick={onClose}
                data-test-id="slot-detail-close"
            >
                &times;
            </button>
        </div>
    );
}
