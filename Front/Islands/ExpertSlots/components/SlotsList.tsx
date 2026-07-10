import * as React from 'react';
import {Slot} from '../types';
import {SlotCard} from './SlotCard';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';

interface Props {
    slots: Slot[];
    onCancel?: (id: number) => void;
    onEdit?: (slot: Slot) => void;
    onComplete?: (id: number) => void;
    onDelete?: (id: number) => void;
}

export const SlotsList: React.FC<Props> = ({slots, onCancel, onEdit, onComplete, onDelete}) => {
    return (
        <>
            <h3 className="mt-2 mb-4">{t.Slot_MySlots()}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {slots.length === 0 ? (
                    <div>
                        <p className="text-muted">{t.Slot_NoSlots()}</p>
                    </div>
                ) : (
                    slots.map(slot => (
                        <SlotCard
                            key={slot.id}
                            slot={slot}
                            onCancel={onCancel}
                            onEdit={onEdit}
                            onComplete={onComplete}
                            onDelete={onDelete}
                        />
                    ))
                )}
            </div>
        </>
    );
};
