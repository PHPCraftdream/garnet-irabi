import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import type {Slot} from '@/Islands/Expert/ExpertSlots/types';
import {SlotCard} from './SlotCard';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';

interface Props {
    slots: Slot[];
    onCancel?: (id: number) => void;
    onEdit?: (slot: Slot) => void;
    onComplete?: (id: number) => void;
    onDelete?: (id: number) => void;
}

export class SlotsList extends AntiHookComponent<Props> {
    /** Отобразить соответствующую часть интерфейса. */
    private renderCards() {
        const {slots, onCancel, onEdit, onComplete, onDelete} = this.props;
        const cards: React.ReactNode[] = [];
        for (const slot of slots) {
            cards.push(<SlotCard key={slot.id} slot={slot} onCancel={onCancel} onEdit={onEdit}
                onComplete={onComplete} onDelete={onDelete} />);
        }
        return cards;
    }

    /** Отобразить соответствующую часть интерфейса. */
    render() {
        return (
            <>
                <h3 className="expert-slots-list-heading">{t.Slot_MySlots()}</h3>
                <div className="expert-slots-list-grid">
                    {this.props.slots.length === 0 ? (
                        <div><p className="expert-slots-list-empty">{t.Slot_NoSlots()}</p></div>
                    ) : this.renderCards()}
                </div>
            </>
        );
    }
}
