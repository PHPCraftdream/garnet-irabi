import * as React from 'react';
import {SlotFormatFields} from '@/Islands/Expert/ExpertSlots/components/Slot/SlotFormatFields';

interface BatchFormatRowProps {
    batchIsOnline: boolean;
    setBatchIsOnline: (v: boolean) => void;
    batchLocation: string;
    setBatchLocation: (v: string) => void;
}

/** Поля для выбора онлайн- или очного формата занятий группы. */
export const BatchFormatRow: React.FC<BatchFormatRowProps> = (props) => (
    <div className="batch-format-row">
        <SlotFormatFields
            isOnline={props.batchIsOnline}
            location={props.batchLocation}
            onIsOnlineChange={props.setBatchIsOnline}
            onLocationChange={props.setBatchLocation}
            idPrefix="batch"
        />
    </div>
);
