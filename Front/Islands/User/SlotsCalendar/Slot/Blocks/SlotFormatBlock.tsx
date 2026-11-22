import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {slotPlaceLabel, slotPlaceValue} from '../../../../../Common/booking/slotFormat';
import {SlotItem} from '../../State/types';

/**
 * Формат занятия и место.
 *
 * Место показывается, только если оно известно: у онлайн-слота без ссылки
 * подставлять сюда слово «Онлайн» значило бы повторять подпись слева.
 */
export const SlotFormatBlock: React.FC<{slot: SlotItem}> = ({slot}) => {
    const place = slotPlaceValue(slot);

    return (
        <div className="slot-format-panel" data-test-id="slot-detail-format">
            <span className="slot-format-badge" data-format={slot.is_online ? 'online' : 'offline'}>
                {slot.is_online ? t.Slot_Online() : t.Slot_Offline()}
            </span>
            {place && (
                <div className="slot-format-place">
                    <span className="slot-format-place-label">{slotPlaceLabel(slot)}:</span> {place}
                </div>
            )}
        </div>
    );
};
