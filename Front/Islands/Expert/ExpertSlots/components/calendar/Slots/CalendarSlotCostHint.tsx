import * as React from 'react';
import {actionCostHint} from '@/Common/booking/actions/outcomes/actionCostHint';
import {Slot} from '@/Islands/Expert/ExpertSlots/types';

/** Подготовить данные для соответствующего интерфейса. */
export const CalendarSlotCostHint: React.FC<{slot: Slot}> = ({slot}) => (
    <div className="expert-slot-cost-hint" data-test-id={`booking-cost-hint-${slot.id}`}>
        {actionCostHint('expert', slot.booking_status)}
    </div>
);
