import * as React from 'react';
import {actionCostHint} from '../../../../../../Common/booking/bookingAction';
import {Slot} from '../../../types';

export const CalendarSlotCostHint: React.FC<{slot: Slot}> = ({slot}) => (
    <div className="expert-slot-cost-hint" data-test-id={`booking-cost-hint-${slot.id}`}>
        {actionCostHint('expert', slot.booking_status)}
    </div>
);
