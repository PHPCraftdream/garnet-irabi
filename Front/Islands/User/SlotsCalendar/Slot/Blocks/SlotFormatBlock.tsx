import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {slotPlaceLabel, slotPlaceValue} from '../../../../../Common/booking/slotFormat';
import {SlotItem} from '../../types';

/**
 * Формат занятия и место.
 *
 * Место показывается, только если оно известно: у онлайн-слота без ссылки
 * подставлять сюда слово «Онлайн» значило бы повторять подпись слева.
 */
export const SlotFormatBlock: React.FC<{slot: SlotItem}> = ({slot}) => {
    const place = slotPlaceValue(slot);

    return (
        <div className="px-3 py-2 rounded-lg bg-surface-alt" data-test-id="slot-detail-format">
            <span className={`inline-block text-xs px-2 py-0.5 rounded ${slot.is_online ? 'status-success' : 'status-notice'}`}>
                {slot.is_online ? t.Slot_Online() : t.Slot_Offline()}
            </span>
            {place && (
                <div className="text-sm mt-1.5">
                    <span className="text-muted">{slotPlaceLabel(slot)}:</span> {place}
                </div>
            )}
        </div>
    );
};
